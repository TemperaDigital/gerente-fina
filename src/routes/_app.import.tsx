/**
 * Rota /import — Importador Inteligente de Extratos e Faturas (Partes 2+3).
 *
 * Fluxo:
 *   1. Selecionar conta destino — BANCO/DINHEIRO (extrato) ou CARTÃO (fatura)
 *   2. Upload CSV → classifyAndCheckImport (hash + dedup + classificação IA)
 *   3. Pré-visualização EDITÁVEL: categoria sugerida por linha (corrigível),
 *      badges de confiança, categorias novas propostas em destaque,
 *      descrição/tipo editáveis, incluir/excluir linha
 *   4. commitSmartImport → cria categorias novas aprovadas + grava lançamentos
 *
 * MODO FATURA (conta tipo credit_card):
 *   - Semântica de sinais INVERTIDA: positivo = compra (despesa),
 *     negativo = estorno/crédito (receita). Em extrato bancário é o oposto.
 *   - O vínculo com a fatura correta (regra do meio do mês) é feito pela
 *     trigger tg_attach_credit_card_invoice no banco — zero lógica aqui.
 *
 * PAGAMENTO DE FATURA (correção contábil):
 *   - Pagamento de fatura NÃO é receita nem despesa — é uma LIQUIDAÇÃO
 *     (dinheiro sai da conta corrente, abate a dívida do cartão). Linhas
 *     detectadas por isInvoicePaymentLine NÃO entram na tabela normal —
 *     ficam isoladas na seção "Pagamento(s) de Fatura Detectado(s)".
 *   - A fatura sendo quitada quase nunca é a que está sendo importada agora
 *     — é a anterior, já fechada. suggestInvoiceForPayment() sugere a fatura
 *     mais provável (maior due_date <= data do pagamento), mas a conta de
 *     origem NUNCA é sugerida — o extrato não informa isso, exige escolha
 *     humana sempre.
 *   - Ao confirmar, cada linha de pagamento vira uma chamada independente a
 *     createTransactionEntry(kind: "invoice_payment"), que já orquestra a
 *     RPC atômica e idempotente pay_credit_card_invoice — o importador NUNCA
 *     chama a RPC diretamente nem duplica essa lógica.
 *
 * Nota de design: o dedup_hash é calculado sobre a linha ORIGINAL do extrato.
 * Edições de descrição/tipo na pré-visualização NÃO recalculam o hash — isso é
 * intencional: o hash identifica a linha do banco de origem, garantindo que o
 * mesmo extrato reimportado seja barrado mesmo que o usuário tenha editado.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  Upload,
  FileText,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Landmark,
  Sparkles,
  Pencil,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAccountsLookup, getCategoriesLookup } from "@/services/lookups.functions";
import {
  classifyAndCheckImport,
  commitSmartImport,
  getDefaultImportAccount,
  type SmartImportRow,
} from "@/lib/supabase/import.functions";
import { detectCsvSchema } from "@/lib/supabase/csv-schema.functions";
import { extractPdfStatement } from "@/lib/supabase/pdf-statement.functions";
import { createTransactionEntry } from "@/services/transactions.functions";
import {
  listInvoicesForPayment,
  type InvoiceForPaymentDTO,
} from "@/services/invoices.functions";
import { suggestInvoiceForPayment } from "@/lib/finance/invoice-payment-match";
import {
  parseCsvDate,
  parseCsvAmount,
  extractInstallmentHint,
} from "@/lib/finance/csv-mapping";

// ---------------------------------------------------------------------------
// Estado editável por linha
// category_choice: "cat:<uuid>" | "new:<nome>" | "" (pendente)
// ---------------------------------------------------------------------------
interface EditableRow extends SmartImportRow {
  include: boolean;
  category_choice: string;
  /** Parcelamento detectado na descrição original (ex: "3/12") — metadado, não persistido. */
  installment_hint: { current: number; total: number } | null;
}

/**
 * Linha detectada como pagamento de fatura — NUNCA passa por
 * classifyAndCheckImport/commitSmartImport. Exige conta de origem e fatura
 * escolhidas manualmente antes de poder ser confirmada.
 */
interface PaymentRow {
  key: string;
  occurred_on: string;
  description: string;
  amount_raw: string;
  source_account_id: string;
  paid_invoice_id: string;
}

/** Nomes de coluna já suportados sem precisar de detecção via IA (economiza a chamada). */
const KNOWN_DATE_KEYS = ["Data", "date", "Date"];
const KNOWN_DESCRIPTION_KEYS = ["Descricao", "description", "Description"];
const KNOWN_AMOUNT_KEYS = ["Valor", "amount", "Amount"];

function detectKnownColumns(
  keys: string[],
): { dateKey: string; descKey: string; amountKey: string } | null {
  const dateKey = KNOWN_DATE_KEYS.find((k) => keys.includes(k));
  const descKey = KNOWN_DESCRIPTION_KEYS.find((k) => keys.includes(k));
  const amountKey = KNOWN_AMOUNT_KEYS.find((k) => keys.includes(k));
  if (!dateKey || !descKey || !amountKey) return null;
  return { dateKey, descKey, amountKey };
}

/** Mesma semântica de sinal usada há tempos na tela: reaproveitada por todo formato de arquivo. */
function resolveLineKind(isCreditCardMode: boolean, isNegative: boolean): "income" | "expense" {
  if (isCreditCardMode) return isNegative ? "income" : "expense";
  return isNegative ? "expense" : "income";
}

/** Converte um arquivo lido no browser para base64 (chunked — evita estourar a call stack). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

const defaultAccountQuery = () =>
  queryOptions({ queryKey: ["import", "default-account"], queryFn: () => getDefaultImportAccount() });

const accountsQuery = () =>
  queryOptions({ queryKey: ["lookups", "accounts"], queryFn: () => getAccountsLookup() });

const categoriesQuery = () =>
  queryOptions({ queryKey: ["lookups", "categories"], queryFn: () => getCategoriesLookup() });

export const Route = createFileRoute("/_app/import")({
  head: () => ({ meta: [{ title: "Importar Extrato — Gerente Fina" }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(accountsQuery()),
      context.queryClient.ensureQueryData(categoriesQuery()),
      context.queryClient.ensureQueryData(defaultAccountQuery()),
    ]),
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <GlassCard className="p-6 text-sm text-red-300">
          Erro ao carregar importador: {error.message}
        </GlassCard>
      </div>
    </AppShell>
  ),
  component: () => (
    <AppShell>
      <ImportPage />
    </AppShell>
  ),
});

const CONFIDENCE_META = {
  high: { label: "Alta", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  medium: { label: "Média", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  low: { label: "Baixa", cls: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
} as const;

function ImportPage() {
  const queryClient = useQueryClient();
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { data: defaultAccount } = useSuspenseQuery(defaultAccountQuery());

  const [accountId, setAccountId] = useState(defaultAccount?.id ?? "");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // PDF protegido por senha: o arquivo pendente fica em memória local só para
  // permitir "Tentar novamente"; a SENHA nunca é persistida (nem banco, nem
  // log, nem cache/estado global) — vive só aqui e é limpa a cada tentativa.
  const [pdfPendingFile, setPdfPendingFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfPasswordWrong, setPdfPasswordWrong] = useState(false);

  // Pagamento(s) de fatura detectado(s) — isolados da tabela normal.
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [cardInvoices, setCardInvoices] = useState<InvoiceForPaymentDTO[]>([]);
  const [bulkSourceAccountId, setBulkSourceAccountId] = useState("");

  useEffect(() => {
    if (!accountId && defaultAccount?.id) setAccountId(defaultAccount.id);
  }, [defaultAccount, accountId]);

  const bankAccounts = accounts.filter((a) => a.type !== "credit_card");
  const cardAccounts = accounts.filter((a) => a.type === "credit_card");

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  const isCreditCard = selectedAccount?.type === "credit_card";
  const cardMissingConfig =
    isCreditCard && (!selectedAccount?.closing_day || !selectedAccount?.due_day);

  /** Linhas de pagamento de fatura não devem virar lançamento no cartão. */
  function isInvoicePaymentLine(description: string): boolean {
    const n = description
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return (
      (n.includes("pagamento") || n.includes("pgto")) &&
      (n.includes("fatura") || n.includes("recebido") || n.includes("debito automatico"))
    );
  }

  // Categorias novas propostas (agrupadas por nome+kind) entre as linhas incluídas
  const proposedNewCategories = useMemo(() => {
    const map = new Map<string, { name: string; kind: string; count: number }>();
    for (const r of rows) {
      if (!r.include || r.is_duplicate) continue;
      if (r.category_choice.startsWith("new:")) {
        const name = r.category_choice.slice(4);
        const key = `${name.toLowerCase()}|${r.kind}`;
        const cur = map.get(key);
        if (cur) cur.count++;
        else map.set(key, { name, kind: r.kind, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [rows]);

  // ---------------------------------------------------------------------------
  // Resolve os rascunhos de pagamento de fatura: busca as faturas do cartão
  // UMA VEZ e aplica a sugestão automática (nunca sugere a conta de origem —
  // isso o extrato não informa, exige escolha humana sempre).
  // ---------------------------------------------------------------------------
  async function resolvePaymentDrafts(
    drafts: Array<{ occurred_on: string; description: string; amount_raw: string }>,
  ): Promise<PaymentRow[]> {
    if (drafts.length === 0) return [];
    const invoices = await listInvoicesForPayment({ data: { account_id: accountId } });
    setCardInvoices(invoices);
    return drafts.map((d) => ({
      key: crypto.randomUUID(),
      occurred_on: d.occurred_on,
      description: d.description,
      amount_raw: d.amount_raw,
      source_account_id: "",
      paid_invoice_id: suggestInvoiceForPayment(invoices, d.occurred_on) ?? "",
    }));
  }

  // ---------------------------------------------------------------------------
  // Etapa final compartilhada por TODO formato de arquivo (CSV, PDF...):
  // separa pagamentos de fatura (seção própria) do restante (vai para a IA
  // classificar) e prepara os dois estados editáveis da pré-visualização.
  // ---------------------------------------------------------------------------
  async function finishUpload(
    parsed: Array<{
      occurred_on: string;
      description: string;
      amount_raw: string;
      kind: "income" | "expense";
    }>,
    hints: Array<{ current: number; total: number } | null>,
    paymentDrafts: Array<{ occurred_on: string; description: string; amount_raw: string }>,
  ) {
    if (parsed.length === 0 && paymentDrafts.length === 0) {
      toast.error("Nenhuma linha válida encontrada no arquivo.");
      return;
    }

    if (paymentDrafts.length > 0) {
      const resolved = await resolvePaymentDrafts(paymentDrafts);
      setPaymentRows(resolved);
      toast.info(
        `${resolved.length} pagamento(s) de fatura detectado(s) — revise a conta de origem e a fatura na seção própria abaixo.`,
      );
    } else {
      setPaymentRows([]);
      setCardInvoices([]);
    }

    if (parsed.length === 0) {
      setRows([]);
      return;
    }

    toast.info(`Analisando ${parsed.length} linhas com IA...`, { id: "classify" });
    const classified = await classifyAndCheckImport({
      data: { account_id: accountId, rows: parsed },
    });
    toast.dismiss("classify");

    // Converte para estado editável, pré-preenchendo com a sugestão da IA
    const editable: EditableRow[] = classified.map((r, i) => ({
      ...r,
      include: !r.is_duplicate,
      category_choice: r.suggested_category_id
        ? `cat:${r.suggested_category_id}`
        : r.suggested_new_category
        ? `new:${r.suggested_new_category}`
        : "",
      installment_hint: hints[i] ?? null,
    }));

    setRows(editable);

    const dups = editable.filter((r) => r.is_duplicate).length;
    const classifiedCount = editable.filter((r) => !r.is_duplicate && r.category_choice).length;
    const pending = editable.filter((r) => !r.is_duplicate && !r.category_choice).length;

    toast.success(
      `${classified.length} linhas: ${classifiedCount} classificadas pela IA` +
        (pending > 0 ? `, ${pending} aguardando categoria manual` : "") +
        (dups > 0 ? `, ${dups} duplicatas ignoradas` : "") + ".",
    );
  }

  function patchPaymentRow(key: string, patch: Partial<PaymentRow>) {
    setPaymentRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function applyBulkSourceAccount(id: string) {
    setBulkSourceAccountId(id);
    setPaymentRows((prev) => prev.map((r) => ({ ...r, source_account_id: id })));
  }

  /** Avisa quando o tipo de documento detectado não bate com a conta selecionada. */
  function warnStatementTypeMismatch(statementType: "bank_statement" | "credit_card_invoice") {
    const looksLikeCardButAccountIsBank = !isCreditCard && statementType === "credit_card_invoice";
    const looksLikeBankButAccountIsCard = isCreditCard && statementType === "bank_statement";
    if (looksLikeCardButAccountIsBank || looksLikeBankButAccountIsCard) {
      toast.warning(
        `O arquivo parece ser ${
          statementType === "credit_card_invoice" ? "uma fatura de cartão" : "um extrato bancário"
        }, mas o destino selecionado é ${isCreditCard ? "um cartão" : "uma conta bancária"}. Confira antes de continuar.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Upload PDF → extração de texto + IA no servidor → mesmo pipeline de sempre
  // ---------------------------------------------------------------------------
  async function handlePdfFile(file: File, password?: string) {
    setIsClassifying(true);
    try {
      const buf = await file.arrayBuffer();
      const file_base64 = arrayBufferToBase64(buf);
      const result = await extractPdfStatement({ data: { file_base64, password } });

      // A senha nunca sobrevive além desta tentativa — limpa já na volta,
      // sucesso ou falha, e o usuário digita de novo se precisar tentar outra vez.
      setPdfPassword("");

      if (result.requires_password) {
        setPdfPendingFile(file);
        setPdfPasswordWrong(!!result.password_incorrect);
        toast.error(
          result.password_incorrect
            ? "Senha incorreta. Tente novamente."
            : "Este PDF é protegido por senha. Digite a senha para continuar.",
        );
        return;
      }

      setPdfPendingFile(null);
      setPdfPasswordWrong(false);

      if (result.skipped_count && result.skipped_count > 0) {
        toast.info(
          `${result.skipped_count} lançamento(s) ignorado(s) por data/valor incompatível com o formato detectado.`,
        );
      }
      if (result.statement_type) warnStatementTypeMismatch(result.statement_type);

      const parsed: Array<{
        occurred_on: string;
        description: string;
        amount_raw: string;
        kind: "income" | "expense";
      }> = [];
      const hints: Array<{ current: number; total: number } | null> = [];
      const paymentDrafts: Array<{ occurred_on: string; description: string; amount_raw: string }> = [];

      for (const row of result.rows ?? []) {
        if (isCreditCard && isInvoicePaymentLine(row.description)) {
          paymentDrafts.push({
            occurred_on: row.occurred_on,
            description: row.description.trim(),
            amount_raw: row.amount_raw,
          });
          continue;
        }
        parsed.push({
          occurred_on: row.occurred_on,
          description: row.description.trim(),
          amount_raw: row.amount_raw,
          kind: resolveLineKind(isCreditCard, row.is_negative),
        });
        hints.push(extractInstallmentHint(row.description));
      }

      await finishUpload(parsed, hints, paymentDrafts);
    } catch (err: unknown) {
      toast.error(`Erro ao processar PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsClassifying(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Upload → parse → classificação IA
  // ---------------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!accountId) {
      toast.error("Selecione a conta bancária antes do upload.");
      return;
    }

    if (isPdfFile(file)) {
      e.target.value = "";
      await handlePdfFile(file);
      return;
    }

    setIsClassifying(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rawRows = results.data as Record<string, string>[];
          if (rawRows.length === 0) {
            toast.error("Arquivo vazio ou sem linhas reconhecíveis.");
            return;
          }

          // Colunas já conhecidas (Data/Descricao/Valor em pt/en) não precisam
          // de detecção por IA — só CSVs de formato desconhecido chamam a IA,
          // e apenas UMA VEZ por arquivo (nunca por linha).
          const knownCols = detectKnownColumns(Object.keys(rawRows[0]));

          let dateKey: string;
          let descKey: string;
          let amountKey: string;
          let dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YY" = "DD/MM/YYYY";
          let negativeConvention: "minus_prefix" | "minus_suffix" | "parentheses" | "none" =
            "minus_prefix";

          if (knownCols) {
            dateKey = knownCols.dateKey;
            descKey = knownCols.descKey;
            amountKey = knownCols.amountKey;
          } else {
            toast.info("Detectando colunas do arquivo com IA...", { id: "schema" });
            const sample = rawRows.slice(0, 5);
            const schemaMap = await detectCsvSchema({ data: { sample_rows: sample } });
            toast.dismiss("schema");

            dateKey = schemaMap.date_key;
            descKey = schemaMap.description_key;
            amountKey = schemaMap.amount_key;
            dateFormat = schemaMap.date_format;
            negativeConvention = schemaMap.negative_convention;

            warnStatementTypeMismatch(schemaMap.statement_type);
          }

          const parsed: Array<{
            occurred_on: string;
            description: string;
            amount_raw: string;
            kind: "income" | "expense";
          }> = [];
          const hints: Array<{ current: number; total: number } | null> = [];
          const paymentDrafts: Array<{ occurred_on: string; description: string; amount_raw: string }> = [];
          let skippedInvalid = 0;

          for (const row of rawRows) {
            const rawDate = row[dateKey] ?? "";
            const rawDesc = row[descKey] ?? "";
            const rawValue = row[amountKey] ?? "";
            if (!rawDate || !rawDesc || !rawValue) {
              skippedInvalid++;
              continue;
            }

            let occurred_on: string;
            let absAmount: string;
            let isNegative: boolean;
            try {
              occurred_on = knownCols
                ? rawDate.trim().includes("/")
                  ? (() => {
                      const [d, m, y] = rawDate.trim().split("/");
                      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
                    })()
                  : rawDate.trim()
                : parseCsvDate(rawDate, dateFormat);

              ({ absAmount, isNegative } = knownCols
                ? (() => {
                    const numeric = parseFloat(String(rawValue).trim().replace(",", "."));
                    if (Number.isNaN(numeric)) throw new Error("valor inválido");
                    return { absAmount: Math.abs(numeric).toFixed(2), isNegative: numeric < 0 };
                  })()
                : parseCsvAmount(rawValue, negativeConvention));
            } catch {
              skippedInvalid++;
              continue;
            }

            // MODO FATURA: pagamento de fatura vai para a seção própria, não
            // para a tabela normal (não é receita nem despesa — é liquidação)
            if (isCreditCard && isInvoicePaymentLine(rawDesc)) {
              paymentDrafts.push({ occurred_on, description: rawDesc.trim(), amount_raw: absAmount });
              continue;
            }

            parsed.push({
              occurred_on,
              description: rawDesc.trim(),
              amount_raw: absAmount,
              kind: resolveLineKind(isCreditCard, isNegative),
            });
            hints.push(extractInstallmentHint(rawDesc));
          }

          if (skippedInvalid > 0) {
            toast.info(`${skippedInvalid} linha(s) ignoradas por dado inválido ou incompleto.`);
          }

          await finishUpload(parsed, hints, paymentDrafts);
        } catch (err: unknown) {
          toast.dismiss("classify");
          toast.dismiss("schema");
          toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setIsClassifying(false);
        }
      },
      error: (err) => {
        toast.error(`Erro ao ler arquivo: ${err.message}`);
        setIsClassifying(false);
      },
    });
    e.target.value = "";
  };

  // ---------------------------------------------------------------------------
  // Edição por linha
  // ---------------------------------------------------------------------------
  function patchRow(idx: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function changeKind(idx: number, kind: "income" | "expense") {
    // Trocar o tipo invalida a categoria escolhida (kinds diferentes)
    patchRow(idx, { kind, category_choice: "" });
  }

  // ---------------------------------------------------------------------------
  // Confirmação
  // ---------------------------------------------------------------------------
  const included = rows.filter((r) => r.include && !r.is_duplicate);
  const pendingCategory = included.filter((r) => !r.category_choice).length;
  const paymentRowsPending = paymentRows.filter(
    (r) => !r.source_account_id || !r.paid_invoice_id,
  ).length;
  const hasSomethingToCommit = included.length > 0 || paymentRows.length > 0;
  const readyToCommit =
    hasSomethingToCommit && pendingCategory === 0 && paymentRowsPending === 0;

  interface PaymentOutcome {
    description: string;
    ok: boolean;
    was_duplicate?: boolean;
    reason?: string;
  }

  const commitMut = useMutation({
    mutationFn: async () => {
      let smartResult: { inserted: number; categories_created: number } | null = null;
      if (included.length > 0) {
        smartResult = await commitSmartImport({
          data: {
            rows: included.map((r) => ({
              occurred_on: r.occurred_on,
              description: r.description,
              amount_raw: r.amount_raw,
              kind: r.kind,
              account_id: r.account_id,
              dedup_hash: r.dedup_hash,
              category_id: r.category_choice.startsWith("cat:")
                ? r.category_choice.slice(4)
                : null,
              new_category_name: r.category_choice.startsWith("new:")
                ? r.category_choice.slice(4)
                : null,
              notes: r.notes ?? null,
            })),
          },
        });
      }

      // Cada pagamento de fatura é uma chamada INDEPENDENTE — uma falha não
      // derruba as demais. idempotency_key é determinístico (não randômico):
      // reimportar o mesmo arquivo com as mesmas escolhas não duplica o
      // pagamento, a RPC devolve was_duplicate=true.
      let paymentOutcomes: PaymentOutcome[] = [];
      if (paymentRows.length > 0) {
        const settled = await Promise.allSettled(
          paymentRows.map((r) =>
            createTransactionEntry({
              data: {
                kind: "invoice_payment",
                amount: r.amount_raw,
                occurred_on: r.occurred_on,
                description: r.description,
                account_id: r.source_account_id,
                paid_invoice_id: r.paid_invoice_id,
                idempotency_key: `import:${r.paid_invoice_id}:${r.source_account_id}:${r.occurred_on}:${r.amount_raw}`,
              },
            }),
          ),
        );
        paymentOutcomes = settled.map((s, i) => {
          if (s.status === "fulfilled") {
            return {
              description: paymentRows[i].description,
              ok: true,
              was_duplicate: s.value.was_duplicate,
            };
          }
          return {
            description: paymentRows[i].description,
            ok: false,
            reason: s.reason instanceof Error ? s.reason.message : String(s.reason),
          };
        });
      }

      return { smartResult, paymentOutcomes };
    },
    onSuccess: ({ smartResult, paymentOutcomes }) => {
      if (smartResult) {
        toast.success(
          `${smartResult.inserted} lançamento(s) importados` +
            (smartResult.categories_created > 0
              ? ` · ${smartResult.categories_created} categoria(s) nova(s) criada(s)`
              : "") + "!",
        );
      }

      if (paymentOutcomes.length > 0) {
        const succeeded = paymentOutcomes.filter((p) => p.ok);
        const failed = paymentOutcomes.filter((p) => !p.ok);
        const duplicates = succeeded.filter((p) => p.was_duplicate).length;

        if (failed.length === 0) {
          toast.success(
            `${succeeded.length} pagamento(s) de fatura processado(s) com sucesso` +
              (duplicates > 0 ? ` (${duplicates} já existia(m) — ignorado(s))` : "") +
              ".",
          );
        } else {
          toast.error(
            `${succeeded.length} pagamento(s) processado(s), ${failed.length} falharam: ` +
              failed.map((f) => `"${f.description}": ${f.reason}`).join(" · "),
          );
        }
      }

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["lookups", "categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setRows([]);
      setPaymentRows([]);
      setCardInvoices([]);
      setBulkSourceAccountId("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const BRL = (v: string) =>
    Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl flex items-center gap-2">
          Importador Inteligente
          <Sparkles className="size-5 text-primary" />
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          A IA classifica cada lançamento nas suas categorias — revise, corrija e confirme.
        </p>
      </header>

      {/* Etapa 1: Conta ou Cartão */}
      <GlassCard className="border border-white/10 p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
          <Landmark className="size-4 text-primary" /> Destino da importação
        </div>
        <div className="max-w-sm">
          <Select
            value={accountId}
            onValueChange={setAccountId}
            disabled={rows.length > 0 || paymentRows.length > 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione conta ou cartão..." />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Contas (extrato bancário)</SelectLabel>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              {cardAccounts.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Cartões (fatura)</SelectLabel>
                  {cardAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>💳 {a.name}</SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Banner: modo fatura ativo */}
        {isCreditCard && !cardMissingConfig && (
          <div className="flex items-start gap-2.5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-foreground/70 leading-relaxed">
            <CreditCard className="size-4 text-violet-400 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold text-violet-300">Modo fatura ativo:</span>{" "}
              valores positivos serão tratados como <strong>compras (despesas)</strong> e
              negativos como <strong>estornos</strong>. Linhas de pagamento de fatura são
              isoladas numa seção própria — não são receita nem despesa, exigem confirmar a
              conta de origem e a fatura quitada. Cada compra será vinculada à fatura correta
              (fechamento dia {selectedAccount?.closing_day}, vencimento dia {selectedAccount?.due_day}).
            </span>
          </div>
        )}

        {/* Alerta: cartão sem dias configurados */}
        {cardMissingConfig && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300 leading-relaxed">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>
              Este cartão não tem <strong>dia de fechamento</strong> e <strong>dia de vencimento</strong>{" "}
              configurados — as compras serão importadas, mas <strong>não serão vinculadas a nenhuma
              fatura</strong>. Configure em Cartões antes de importar para o vínculo automático funcionar.
            </span>
          </div>
        )}
      </GlassCard>

      {/* Etapa 2: Upload (ou prompt de senha, se o PDF pedir) */}
      {rows.length === 0 && paymentRows.length === 0 && pdfPendingFile && (
        <GlassCard className="p-6 border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="size-4" /> PDF protegido por senha
          </div>
          <p className="text-xs text-foreground/60">
            {pdfPasswordWrong
              ? "Senha incorreta — tente novamente."
              : `"${pdfPendingFile.name}" exige uma senha para ser aberto.`}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 max-w-md">
            <Input
              type="password"
              value={pdfPassword}
              onChange={(e) => setPdfPassword(e.target.value)}
              placeholder="Digite a senha do arquivo"
              autoFocus
              disabled={isClassifying}
            />
            <Button
              onClick={() => handlePdfFile(pdfPendingFile, pdfPassword)}
              disabled={isClassifying || !pdfPassword}
              className="shrink-0 gap-1.5"
            >
              {isClassifying && <RefreshCw className="size-3.5 animate-spin" />}
              Tentar novamente
            </Button>
            <Button
              variant="outline"
              disabled={isClassifying}
              onClick={() => {
                setPdfPendingFile(null);
                setPdfPassword("");
                setPdfPasswordWrong(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </GlassCard>
      )}

      {rows.length === 0 && paymentRows.length === 0 && !pdfPendingFile && (
        <GlassCard className="p-12 text-center border border-dashed border-white/20 relative hover:border-primary/40 transition-colors">
          <input
            type="file"
            accept=".csv,.pdf"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            disabled={isClassifying || !accountId}
          />
          {isClassifying ? (
            <RefreshCw className="mx-auto size-12 opacity-50 mb-4 animate-spin text-primary" />
          ) : (
            <Upload className={`mx-auto size-12 mb-4 ${!accountId ? "opacity-20" : "opacity-40"}`} />
          )}
          <p className="text-sm font-medium text-foreground/80">
            {isClassifying
              ? "Processando lançamentos com IA..."
              : !accountId
              ? "Selecione o destino acima para habilitar o upload"
              : isCreditCard
              ? "Clique ou arraste o arquivo CSV ou PDF da fatura do cartão"
              : "Clique ou arraste o arquivo CSV ou PDF do seu banco"}
          </p>
          <p className="text-xs text-foreground/40 mt-1">
            Reconhece automaticamente as colunas do CSV de qualquer banco, ou o texto de um PDF de
            extrato/fatura (ou use Data · Descricao · Valor)
          </p>
        </GlassCard>
      )}

      {/* Etapa 3: Pré-visualização editável */}
      {(rows.length > 0 || paymentRows.length > 0) && (
        <div className="space-y-4">

          {/* Pagamento(s) de Fatura Detectado(s) — NUNCA vão na tabela normal:
              não são receita nem despesa, são liquidação (RPC pay_credit_card_invoice) */}
          {paymentRows.length > 0 && (
            <GlassCard className="border border-violet-500/30 bg-violet-500/5 p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
                <CreditCard className="size-4" /> Pagamento(s) de Fatura Detectado(s) (
                {paymentRows.length})
              </div>
              <p className="text-xs text-foreground/60 leading-relaxed">
                Pagamento de fatura não é receita nem despesa — é uma liquidação entre a conta de
                origem e o cartão. A fatura sugerida é a mais provável, mas SEMPRE confira; a conta
                de origem nunca é sugerida automaticamente (o extrato não informa isso).
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-lg">
                <span className="text-xs text-foreground/60 shrink-0">
                  Aplicar esta conta a todos os pagamentos detectados:
                </span>
                <Select value={bulkSourceAccountId} onValueChange={applyBulkSourceAccount}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar conta de origem..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {paymentRows.map((r) => (
                  <div
                    key={r.key}
                    className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-3 grid gap-2 sm:grid-cols-[auto_1fr_1fr_1fr] sm:items-center"
                  >
                    <div className="text-xs font-mono text-foreground/60 whitespace-nowrap">
                      {r.occurred_on}
                    </div>
                    <div className="text-xs min-w-0">
                      <p className="font-medium truncate">{r.description}</p>
                      <p className="text-foreground/40 font-mono">R$ {BRL(r.amount_raw)}</p>
                    </div>
                    <Select
                      value={r.source_account_id}
                      onValueChange={(v) => patchPaymentRow(r.key, { source_account_id: v })}
                    >
                      <SelectTrigger
                        className={`h-8 text-xs ${
                          !r.source_account_id ? "border-amber-500/50 text-amber-400" : ""
                        }`}
                      >
                        <SelectValue placeholder="⚠ Conta de origem..." />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={r.paid_invoice_id}
                      onValueChange={(v) => patchPaymentRow(r.key, { paid_invoice_id: v })}
                    >
                      <SelectTrigger
                        className={`h-8 text-xs ${
                          !r.paid_invoice_id ? "border-amber-500/50 text-amber-400" : ""
                        }`}
                      >
                        <SelectValue placeholder="⚠ Fatura sendo quitada..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cardInvoices.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-foreground/40">
                            Nenhuma fatura disponível
                          </div>
                        ) : (
                          cardInvoices.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.reference_month.slice(0, 7)} · vence {inv.due_date} ·{" "}
                              {inv.status === "closed" ? "fechada" : "aberta"}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Banner de categorias novas propostas */}
          {proposedNewCategories.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
              <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/70 leading-relaxed">
                <span className="font-semibold text-foreground/90">
                  A IA propôs {proposedNewCategories.length} categoria(s) nova(s):
                </span>{" "}
                {proposedNewCategories.map((c, i) => (
                  <span key={c.name + c.kind}>
                    {i > 0 && " · "}
                    <span className="font-semibold text-primary">{c.name}</span>
                    <span className="text-foreground/40"> ({c.count} lançamento{c.count > 1 ? "s" : ""})</span>
                  </span>
                ))}
                <span className="block mt-1 text-foreground/40">
                  Elas serão criadas automaticamente na confirmação. Para trocar, use o seletor da linha.
                </span>
              </div>
            </div>
          )}

          {/* Barra de ações */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-zinc-900/60 p-4 rounded-xl border border-white/5">
            <div className="flex items-center gap-2 text-sm text-foreground/70">
              <FileText className="size-4 text-primary" />
              <span>
                {rows.length > 0 && (
                  <>
                    {included.length} de {rows.length} selecionadas
                    {pendingCategory > 0 && (
                      <span className="text-amber-400 font-semibold">
                        {" "}
                        · {pendingCategory} sem categoria
                      </span>
                    )}
                  </>
                )}
                {paymentRows.length > 0 && (
                  <span className={rows.length > 0 ? "ml-1" : ""}>
                    {rows.length > 0 ? "· " : ""}
                    {paymentRows.length} pagamento(s) de fatura
                    {paymentRowsPending > 0 && (
                      <span className="text-amber-400 font-semibold">
                        {" "}
                        ({paymentRowsPending} pendente(s) de conta/fatura)
                      </span>
                    )}
                  </span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRows([]);
                  setPaymentRows([]);
                  setCardInvoices([]);
                  setBulkSourceAccountId("");
                }}
                className="rounded-full"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => commitMut.mutate()}
                disabled={commitMut.isPending || !readyToCommit}
                className="rounded-full gap-1.5"
              >
                {commitMut.isPending && <RefreshCw className="size-3.5 animate-spin" />}
                Confirmar importação ({included.length + paymentRows.length}){" "}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Tabela editável */}
          {rows.length > 0 && (
          <GlassCard className="overflow-hidden border border-white/10">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.02]">
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="min-w-[180px]">Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="min-w-[200px]">Categoria (IA)</TableHead>
                    <TableHead>Confiança</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => {
                    const isDup = r.is_duplicate;
                    const conf = CONFIDENCE_META[r.confidence];
                    const kindCategories = categories.filter((c) => c.kind === r.kind);
                    const isEditing = editingIdx === idx;

                    return (
                      <TableRow
                        key={r.dedup_hash + idx}
                        className={`border-white/5 ${
                          isDup
                            ? "bg-red-500/10 text-red-300/50 line-through"
                            : !r.include
                            ? "opacity-40"
                            : "hover:bg-white/[0.02]"
                        }`}
                      >
                        {/* Incluir */}
                        <TableCell>
                          {isDup ? (
                            <span title="Duplicata — já existe no banco">
                              <AlertTriangle className="size-4 text-red-400" />
                            </span>
                          ) : (
                            <Checkbox
                              checked={r.include}
                              onCheckedChange={(v) => patchRow(idx, { include: v === true })}
                            />
                          )}
                        </TableCell>

                        {/* Data */}
                        <TableCell className="font-mono text-xs text-foreground/60 whitespace-nowrap">
                          {r.occurred_on}
                        </TableCell>

                        {/* Descrição editável */}
                        <TableCell>
                          {isEditing && !isDup ? (
                            <Input
                              value={r.description}
                              onChange={(e) => patchRow(idx, { description: e.target.value })}
                              onBlur={() => setEditingIdx(null)}
                              onKeyDown={(e) => e.key === "Enter" && setEditingIdx(null)}
                              autoFocus
                              className="h-7 text-xs"
                            />
                          ) : (
                            <button
                              className="group flex items-center gap-1.5 text-left max-w-[240px]"
                              onClick={() => !isDup && setEditingIdx(idx)}
                              disabled={isDup}
                            >
                              <span className="truncate font-medium text-xs">{r.description}</span>
                              {!isDup && (
                                <Pencil className="size-3 text-foreground/20 group-hover:text-foreground/60 shrink-0" />
                              )}
                            </button>
                          )}
                          {r.installment_hint && (
                            <span className="ml-1.5 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full border text-violet-400 bg-violet-500/10 border-violet-500/20">
                              {r.installment_hint.current}/{r.installment_hint.total}
                            </span>
                          )}
                        </TableCell>

                        {/* Tipo */}
                        <TableCell>
                          {isDup ? (
                            <span className="text-xs">{r.kind === "income" ? "Receita" : "Despesa"}</span>
                          ) : (
                            <Select
                              value={r.kind}
                              onValueChange={(v) => changeKind(idx, v as "income" | "expense")}
                            >
                              <SelectTrigger className="h-7 w-[110px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="expense">🛑 Despesa</SelectItem>
                                <SelectItem value="income">🟢 Receita</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>

                        {/* Categoria */}
                        <TableCell>
                          {isDup ? (
                            <span className="text-xs text-foreground/30">—</span>
                          ) : (
                            <Select
                              value={r.category_choice}
                              onValueChange={(v) => patchRow(idx, { category_choice: v })}
                            >
                              <SelectTrigger
                                className={`h-7 text-xs ${
                                  !r.category_choice ? "border-amber-500/50 text-amber-400" : ""
                                }`}
                              >
                                <SelectValue placeholder="⚠ Selecionar..." />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Categoria nova proposta pela IA para ESTA linha */}
                                {r.suggested_new_category && (
                                  <SelectItem value={`new:${r.suggested_new_category}`}>
                                    ✨ Nova: {r.suggested_new_category}
                                  </SelectItem>
                                )}
                                {kindCategories.map((c) => (
                                  <SelectItem key={c.id} value={`cat:${c.id}`}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>

                        {/* Confiança */}
                        <TableCell>
                          {isDup || !r.category_choice ? (
                            <span className="text-xs text-foreground/20">—</span>
                          ) : (
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${conf.cls}`}
                            >
                              {conf.label}
                            </span>
                          )}
                        </TableCell>

                        {/* Valor */}
                        <TableCell
                          className={`text-right font-mono font-semibold text-xs whitespace-nowrap ${
                            r.kind === "income" ? "text-emerald-400" : "text-foreground/80"
                          }`}
                        >
                          {r.kind === "income" ? "+" : "−"} R$ {BRL(r.amount_raw)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
