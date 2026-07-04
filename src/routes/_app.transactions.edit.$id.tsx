/**
 * Rota /transactions/edit/$id — Retificação de Lançamento.
 *
 * REGRA CONSTITUCIONAL INEGOCIÁVEL:
 *   Esta tela NUNCA exibe "Converter em Parcelamento" nem ativa Recorrência.
 *   Edição = UPDATE limpo de atributos (descrição, valor, data, conta,
 *   categoria, observações). NÃO transmuta estruturas.
 */
import { useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowLeft, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GlassCard } from "@/components/dashboard/primitives";
import {
  getTransactionById,
  updateTransactionEntry,
  convertTransactionEntry,
  type TransactionKind,
} from "@/services/transactions.functions";
import {
  getAccountsLookup,
  getCategoriesLookup,
} from "@/services/lookups.functions";
import {
  listInvoicesForPayment,
  type InvoiceForPaymentDTO,
} from "@/services/invoices.functions";

/**
 * Mensagem explicando EXATAMENTE o que a conversão vai desfazer, antes de
 * qualquer ação — ver missão "Conversão segura de tipo de lançamento".
 * Retorna null para lançamento simples (sem vínculo estrutural).
 */
function structuralWarningFor(tx: {
  kind: TransactionKind;
  has_installment_link: boolean;
  installment_info: { current: number; total: number; purchase_description: string } | null;
  recurrence_id: string | null;
  transfer_counterpart_account_name: string | null;
}): string | null {
  if (tx.has_installment_link && tx.installment_info) {
    const { current, total, purchase_description } = tx.installment_info;
    const label = purchase_description ? `"${purchase_description}"` : "uma compra parcelada";
    return `Este lançamento faz parte de ${label} (${current}/${total}). Convertê-lo vai desvincular APENAS esta parcela; as demais permanecem intactas.`;
  }
  if (tx.kind === "transfer") {
    return `Este lançamento é uma perna de transferência${
      tx.transfer_counterpart_account_name
        ? ` com "${tx.transfer_counterpart_account_name}"`
        : ""
    }. A perna correspondente na conta de destino/origem será excluída junto.`;
  }
  if (tx.kind === "invoice_payment") {
    return "Este lançamento é uma perna de pagamento de fatura. A outra perna será excluída e o saldo da fatura será recalculado automaticamente pelo trigger existente.";
  }
  if (tx.recurrence_id) {
    return "Este lançamento foi gerado por uma recorrência ativa. A recorrência em si NÃO será afetada — apenas esta ocorrência específica será desvinculada.";
  }
  return null;
}

const NEW_KIND_LABEL: Record<TransactionKind, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
  invoice_payment: "Pagamento de Fatura",
};

const txQuery = (id: string) =>
  queryOptions({
    queryKey: ["transaction", id],
    queryFn: () => getTransactionById({ data: { id } }),
  });

const accountsQuery = () =>
  queryOptions({
    queryKey: ["lookups", "accounts"],
    queryFn: () => getAccountsLookup(),
  });

const categoriesQuery = () =>
  queryOptions({
    queryKey: ["lookups", "categories"],
    queryFn: () => getCategoriesLookup(),
  });

export const Route = createFileRoute("/_app/transactions/edit/$id")({
  head: () => ({
    meta: [
      { title: "Editar Lançamento — Gerente Fina" },
      {
        name: "description",
        content: "Retifique atributos do lançamento sem transmutar estruturas.",
      },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(txQuery(params.id)),
      context.queryClient.ensureQueryData(accountsQuery()),
      context.queryClient.ensureQueryData(categoriesQuery()),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <GlassCard className="max-w-md p-6 text-center">
        <h2 className="text-lg font-semibold">Não foi possível abrir o lançamento</h2>
        <p className="mt-2 text-sm text-foreground/60">{error.message}</p>
      </GlassCard>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-center text-foreground/60">
      Lançamento não encontrado.
    </div>
  ),
  component: EditTransactionPage,
});

function EditTransactionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: tx } = useSuspenseQuery(txQuery(id));
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: categories } = useSuspenseQuery(categoriesQuery());

  const [description, setDescription] = useState(tx.description ?? "");
  const [amount, setAmount] = useState(tx.amount);
  const [occurredOn, setOccurredOn] = useState(tx.occurred_on);
  const [accountId, setAccountId] = useState(tx.account_id);
  const [categoryId, setCategoryId] = useState<string | undefined>(
    tx.category_id ?? undefined,
  );
  const [notes, setNotes] = useState(tx.notes ?? "");

  const isStructural =
    tx.kind === "transfer" ||
    tx.kind === "invoice_payment" ||
    tx.has_installment_link ||
    !!tx.recurrence_id;

  const filteredCategories = categories.filter((c) =>
    tx.kind === "income" ? c.kind === "income" : c.kind === "expense",
  );

  const mut = useMutation({
    mutationFn: () =>
      updateTransactionEntry({
        data: {
          id,
          description: description.trim(),
          amount: amount.replace(",", ".").trim(),
          occurred_on: occurredOn,
          account_id: accountId,
          category_id:
            tx.kind === "income" || tx.kind === "expense"
              ? categoryId ?? null
              : null,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Lançamento atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["transaction", id] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.invalidate();
      navigate({
        to: "/transactions",
        search: { month: occurredOn.slice(0, 7), page: 1 },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------------------------------------------------------------------------
  // Converter Lançamento — ação SEPARADA e EXPLÍCITA da retificação acima.
  // NUNCA oferece re-parcelamento/recorrência automática: só desfaz a
  // estrutura antiga e recria como income/expense/transfer/invoice_payment.
  // ---------------------------------------------------------------------------
  const structuralWarning = structuralWarningFor(tx);
  const bankAccounts = accounts.filter((a) => a.type !== "credit_card");
  const cardAccounts = accounts.filter((a) => a.type === "credit_card");

  const [convertSetupOpen, setConvertSetupOpen] = useState(false);
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false);
  const [newKind, setNewKind] = useState<TransactionKind | "">("");
  const [convertCategoryId, setConvertCategoryId] = useState("");
  const [convertCounterpartAccountId, setConvertCounterpartAccountId] = useState("");
  const [convertCardAccountId, setConvertCardAccountId] = useState("");
  const [convertInvoiceId, setConvertInvoiceId] = useState("");

  const invoicesQuery = useQuery({
    queryKey: ["invoices-for-payment", convertCardAccountId],
    queryFn: () =>
      listInvoicesForPayment({ data: { account_id: convertCardAccountId } }),
    enabled: !!convertCardAccountId,
  });
  const cardInvoices: InvoiceForPaymentDTO[] = invoicesQuery.data ?? [];

  const newKindCategories = categories.filter((c) =>
    newKind === "income" ? c.kind === "income" : c.kind === "expense",
  );

  function resetConvertSetup() {
    setNewKind("");
    setConvertCategoryId("");
    setConvertCounterpartAccountId("");
    setConvertCardAccountId("");
    setConvertInvoiceId("");
  }

  function openConvertSetup() {
    resetConvertSetup();
    setConvertSetupOpen(true);
  }

  function convertSetupIsValid(): boolean {
    if (!newKind) return false;
    if (newKind === "income" || newKind === "expense") return !!convertCategoryId;
    if (newKind === "transfer")
      return !!convertCounterpartAccountId && convertCounterpartAccountId !== accountId;
    if (newKind === "invoice_payment") return !!convertCardAccountId && !!convertInvoiceId;
    return false;
  }

  const convertMut = useMutation({
    mutationFn: () =>
      convertTransactionEntry({
        data: {
          transaction_id: id,
          new_kind: newKind as TransactionKind,
          amount: amount.replace(",", ".").trim(),
          occurred_on: occurredOn,
          description: description.trim(),
          account_id: accountId,
          notes: notes.trim() || null,
          category_id:
            newKind === "income" || newKind === "expense" ? convertCategoryId : undefined,
          counterpart_account_id:
            newKind === "transfer" ? convertCounterpartAccountId : undefined,
          paid_invoice_id: newKind === "invoice_payment" ? convertInvoiceId : undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("Lançamento convertido com sucesso.");
      setConvertConfirmOpen(false);
      setConvertSetupOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["transaction", id] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.invalidate();
      navigate({
        to: "/transactions",
        search: { month: occurredOn.slice(0, 7), page: 1 },
      });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConvertConfirmOpen(false);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Descrição obrigatória.");
    const normalized = amount.replace(",", ".").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized))
      return toast.error("Valor inválido. Use formato 1234.56");
    if (!accountId) return toast.error("Selecione a conta.");
    mut.mutate();
  }

  const kindLabel: Record<typeof tx.kind, string> = {
    income: "Receita",
    expense: "Despesa",
    transfer: "Transferência",
    invoice_payment: "Pagamento de Fatura",
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(700px 400px at 15% -10%, rgba(99,102,241,0.16), transparent 60%), radial-gradient(700px 400px at 85% 0%, rgba(168,85,247,0.12), transparent 60%)",
        }}
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between">
          <Button
            asChild
            variant="ghost"
            className="h-9 gap-2 rounded-full border border-white/10 bg-white/[0.04] text-foreground/70 hover:bg-white/10"
          >
            {/* O parâmetro search foi adicionado abaixo para corrigir o erro do TS */}
            <Link to="/transactions" search={{ month: occurredOn.slice(0, 7), page: 1 }}>
              <ArrowLeft className="size-4" /> Voltar
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Editar Lançamento
          </h1>
          <div className="w-[88px]" />
        </header>

        {/* Banner de modo retificação */}
        <GlassCard className="mb-4 flex items-start gap-3 border-amber-400/30 p-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div className="text-sm">
            <div className="font-semibold text-foreground">
              Modo retificação · {kindLabel[tx.kind]}
            </div>
            <div className="mt-1 text-xs text-foreground/60">
              Apenas atributos podem ser alterados. Estruturas
              (parcelamento, recorrência, transferência) permanecem
              inalteradas — para mudá-las, exclua o lançamento e crie um novo.
            </div>
          </div>
        </GlassCard>

        <form onSubmit={handleSubmit} className="space-y-4">
          <GlassCard className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Valor (R$)">
                <Input
                  inputMode="decimal"
                  className="border-white/10 bg-white/[0.04]"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Data">
                <Input
                  type="date"
                  className="border-white/10 bg-white/[0.04]"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Descrição">
              <Input
                className="border-white/10 bg-white/[0.04]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <Field
              label={
                tx.kind === "transfer"
                  ? "Conta (perna da transferência)"
                  : "Conta"
              }
            >
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="border-white/10 bg-white/[0.04]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {(tx.kind === "income" || tx.kind === "expense") && (
              <Field label="Categoria">
                <Select
                  value={categoryId ?? ""}
                  onValueChange={(v) => setCategoryId(v || undefined)}
                >
                  <SelectTrigger className="border-white/10 bg-white/[0.04]">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field label="Observações (opcional)">
              <Textarea
                className="min-h-[60px] border-white/10 bg-white/[0.04]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {isStructural && (
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-xs text-foreground/60">
                Este lançamento integra uma estrutura
                {tx.has_installment_link
                  ? " de parcelamento"
                  : tx.recurrence_id
                  ? " de recorrência"
                  : tx.kind === "transfer"
                  ? " de transferência"
                  : " de pagamento de fatura"}
                . Os vínculos sistêmicos não são exibidos aqui por design.
              </div>
            )}
          </GlassCard>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/10 bg-white/[0.04] hover:bg-white/10"
              onClick={() =>
                navigate({
                  to: "/transactions",
                  search: { month: occurredOn.slice(0, 7), page: 1 },
                })
              }
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mut.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {mut.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>

        {/* Conversão estrutural — ação SEPARADA da retificação acima */}
        <GlassCard className="mt-6 space-y-2 border-rose-400/20 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-200">
            <ShieldAlert className="size-4" /> Operação Estrutural
          </div>
          <p className="text-xs text-foreground/60">
            Precisa mudar o TIPO deste lançamento (ex.: de despesa para transferência)? A
            retificação acima não permite isso de propósito. Use a conversão — ela desfaz
            corretamente qualquer vínculo (parcelamento, recorrência, transferência, pagamento de
            fatura) antes de recriar o lançamento com o novo tipo.
          </p>
          <Button
            type="button"
            variant="outline"
            className="border-rose-400/30 bg-rose-400/5 text-rose-200 hover:bg-rose-400/10"
            onClick={openConvertSetup}
          >
            Converter lançamento...
          </Button>
        </GlassCard>
      </div>

      {/* Dialog 1 — escolha do novo tipo + campos exigidos por ele */}
      <Dialog open={convertSetupOpen} onOpenChange={setConvertSetupOpen}>
        <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Converter lançamento</DialogTitle>
            <DialogDescription>
              Escolha o novo tipo. Valor, data, descrição e conta usados serão os que estão
              preenchidos no formulário acima.
            </DialogDescription>
          </DialogHeader>

          {structuralWarning && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
              {structuralWarning}
            </div>
          )}

          <div className="space-y-3.5">
            <Field label="Novo tipo">
              <Select
                value={newKind}
                onValueChange={(v) => {
                  setNewKind(v as TransactionKind);
                  setConvertCategoryId("");
                  setConvertCounterpartAccountId("");
                  setConvertCardAccountId("");
                  setConvertInvoiceId("");
                }}
              >
                <SelectTrigger className="border-white/10 bg-white/[0.04]">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                  {(Object.keys(NEW_KIND_LABEL) as TransactionKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {NEW_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {(newKind === "income" || newKind === "expense") && (
              <Field label="Categoria">
                <Select value={convertCategoryId} onValueChange={setConvertCategoryId}>
                  <SelectTrigger className="border-white/10 bg-white/[0.04]">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                    {newKindCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {newKind === "transfer" && (
              <Field label="Conta de destino">
                <Select
                  value={convertCounterpartAccountId}
                  onValueChange={setConvertCounterpartAccountId}
                >
                  <SelectTrigger className="border-white/10 bg-white/[0.04]">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                    {accounts
                      .filter((a) => a.id !== accountId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {newKind === "invoice_payment" && (
              <>
                <Field label="Cartão">
                  <Select
                    value={convertCardAccountId}
                    onValueChange={(v) => {
                      setConvertCardAccountId(v);
                      setConvertInvoiceId("");
                    }}
                  >
                    <SelectTrigger className="border-white/10 bg-white/[0.04]">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                      {cardAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Fatura sendo quitada">
                  <Select
                    value={convertInvoiceId}
                    onValueChange={setConvertInvoiceId}
                    disabled={!convertCardAccountId}
                  >
                    <SelectTrigger className="border-white/10 bg-white/[0.04]">
                      <SelectValue
                        placeholder={
                          convertCardAccountId ? "Selecione..." : "Escolha um cartão primeiro"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
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
                </Field>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-white/10 bg-white/[0.04] hover:bg-white/10"
              onClick={() => setConvertSetupOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!convertSetupIsValid()}
              className="bg-rose-500 text-white hover:bg-rose-600"
              onClick={() => {
                setConvertSetupOpen(false);
                setConvertConfirmOpen(true);
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2 — confirmação destrutiva final, mesmo padrão visual usado em outras exclusões */}
      <AlertDialog open={convertConfirmOpen} onOpenChange={setConvertConfirmOpen}>
        <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar conversão?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-foreground/70">
              <span className="block">{structuralWarning}</span>
              <span className="block">
                Um novo lançamento de <strong>{newKind && NEW_KIND_LABEL[newKind]}</strong> será
                criado com os dados atuais do formulário. Esta ação não pode ser desfeita.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConvertConfirmOpen(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={convertMut.isPending}
              className="bg-rose-500 text-white hover:bg-rose-600"
              onClick={() => convertMut.mutate()}
            >
              {convertMut.isPending && <RefreshCw className="mr-1.5 size-3.5 animate-spin" />}
              Sim, converter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-foreground/60">
        {label}
      </Label>
      {children}
    </div>
  );
}