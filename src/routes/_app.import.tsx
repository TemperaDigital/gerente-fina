/**
 * Rota /import — Importação e Conciliação de Extratos CSV.
 *
 * Fluxo em 3 etapas:
 *   1. Selecionar conta destino (obrigatório — account_id é NOT NULL no schema)
 *   2. Fazer upload do CSV e escolher categoria padrão para linhas sem match
 *   3. Pré-visualizar com duplicatas marcadas → confirmar gravação
 *
 * Usa checkImportDuplicates + commitImport (src/services/import.functions.ts).
 * Hash SHA-256 via WebCrypto — mesmo algoritmo da trigger do banco.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
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
  checkImportDuplicates,
  commitImport,
  getDefaultImportAccount,
  type CheckedImportRow,
} from "@/lib/supabase/import.functions";

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

function ImportPage() {
  const queryClient = useQueryClient();
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { data: defaultAccount } = useSuspenseQuery(defaultAccountQuery());

  const [accountId, setAccountId] = useState(defaultAccount?.id ?? "");
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [rows, setRows] = useState<CheckedImportRow[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  // Pré-seleciona conta padrão assim que resolvida (mantém sincronia com Chat IA)
  useEffect(() => {
    if (!accountId && defaultAccount?.id) setAccountId(defaultAccount.id);
  }, [defaultAccount, accountId]);


  const bankAccounts = accounts.filter((a) => a.type !== "credit_card");
  const expenseCategories = categories.filter((c) => c.kind === "expense");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!accountId) { toast.error("Selecione a conta bancária antes do upload."); return; }
    if (!defaultCategoryId) { toast.error("Selecione uma categoria padrão antes do upload."); return; }

    setIsChecking(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const parsed: Array<{
            occurred_on: string;
            description: string;
            amount_raw: string;
            kind: "income" | "expense";
            account_id: string;
            category_id: string;
          }> = [];

          for (const row of results.data as Record<string, string>[]) {
            const rawDate = row.Data ?? row.date ?? row.Date ?? "";
            const rawDesc = row.Descricao ?? row.description ?? row.Description ?? "";
            const rawValue = row.Valor ?? row.amount ?? row.Amount ?? "";
            if (!rawDate || !rawDesc || !rawValue) continue;

            let occurred_on = rawDate.trim();
            if (occurred_on.includes("/")) {
              const [d, m, y] = occurred_on.split("/");
              occurred_on = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
            }

            const numericStr = rawValue.trim().replace(",", ".");
            const numeric = parseFloat(numericStr);
            if (Number.isNaN(numeric)) continue;

            parsed.push({
              occurred_on,
              description: rawDesc.trim(),
              amount_raw: Math.abs(numeric).toFixed(2),
              kind: numeric >= 0 ? "income" : "expense",
              account_id: accountId,
              category_id: defaultCategoryId,
            });
          }

          if (parsed.length === 0) {
            toast.error("Nenhuma linha válida. Verifique as colunas: Data, Descricao, Valor.");
            setIsChecking(false);
            return;
          }

          const checked = await checkImportDuplicates({
            data: { account_id: accountId, rows: parsed },
          });

          setRows(checked);

          const dups = checked.filter((r) => r.is_duplicate).length;
          if (dups > 0) toast.warning(`${dups} lançamento(s) já existem e serão ignorados.`);
          else toast.success(`${checked.length} lançamentos validados — nenhuma duplicidade.`);
        } catch (err: unknown) {
          toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setIsChecking(false);
        }
      },
      error: (err) => { toast.error(`Erro ao ler arquivo: ${err.message}`); setIsChecking(false); },
    });
  };

  const commitMut = useMutation({
    mutationFn: async () => {
      const newRows = rows.filter((r) => !r.is_duplicate);
      if (newRows.length === 0) throw new Error("Nenhum lançamento novo para importar.");
      return commitImport({ data: { rows: newRows } });
    },
    onSuccess: (result) => {
      toast.success(`${result.inserted} lançamento(s) integrados ao Livro-Caixa!`);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setRows([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const newCount = rows.filter((r) => !r.is_duplicate).length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Importador de Extratos</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Conciliação automática via SHA-256 — duplicatas detectadas antes de gravar.
        </p>
      </header>

      {/* Etapa 1: Configuração */}
      <GlassCard className="border border-white/10 p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
          <Landmark className="size-4 text-primary" /> Etapa 1 — Configure a importação
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Conta bancária de destino</Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={rows.length > 0}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta..." /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-foreground/40">Todos os lançamentos serão vinculados a esta conta.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria padrão</Label>
            <Select value={defaultCategoryId} onValueChange={setDefaultCategoryId} disabled={rows.length > 0}>
              <SelectTrigger><SelectValue placeholder="Selecione a categoria..." /></SelectTrigger>
              <SelectContent>
                {expenseCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-foreground/40">Pode reclassificar individualmente depois.</p>
          </div>
        </div>
      </GlassCard>

      {/* Etapa 2: Upload */}
      {rows.length === 0 && (
        <GlassCard className="p-12 text-center border border-dashed border-white/20 relative hover:border-primary/40 transition-colors">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            disabled={isChecking || !accountId || !defaultCategoryId}
          />
          {isChecking
            ? <RefreshCw className="mx-auto size-12 opacity-50 mb-4 animate-spin text-primary" />
            : <Upload className={`mx-auto size-12 mb-4 ${!accountId || !defaultCategoryId ? "opacity-20" : "opacity-40"}`} />
          }
          <p className="text-sm font-medium text-foreground/80">
            {isChecking
              ? "Cruzando hashes com o banco..."
              : !accountId || !defaultCategoryId
              ? "Preencha conta e categoria acima para habilitar o upload"
              : "Clique ou arraste o arquivo CSV do seu banco"}
          </p>
          <p className="text-xs text-foreground/40 mt-1">Colunas esperadas: Data · Descricao · Valor</p>
        </GlassCard>
      )}

      {/* Etapa 3: Pré-visualização */}
      {rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-zinc-900/60 p-4 rounded-xl border border-white/5">
            <div className="grid grid-cols-3 gap-2 text-xs sm:flex sm:items-center sm:gap-3 sm:text-sm text-foreground/70">
              <div className="flex items-center gap-1.5"><FileText className="size-4 text-primary shrink-0" /> <span className="font-semibold">{rows.length}</span> linhas</div>
              <div className="text-emerald-400 font-semibold">{newCount} novos</div>
              <div className="text-red-400 font-semibold">{rows.length - newCount} duplicatas</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setRows([])} className="rounded-full flex-1 sm:flex-none">Cancelar</Button>
              <Button
                size="sm"
                onClick={() => commitMut.mutate()}
                disabled={commitMut.isPending || newCount === 0}
                className="rounded-full gap-1.5 flex-1 sm:flex-none"
              >
                {commitMut.isPending && <RefreshCw className="size-3.5 animate-spin" />}
                Gravar {newCount} <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Mobile: cards empilhados */}
          <div className="grid gap-2 sm:hidden">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 space-y-2 ${
                  r.is_duplicate
                    ? "border-red-500/40 bg-red-500/10 opacity-70"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {r.is_duplicate
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-red-300 font-bold bg-red-500/20 px-2 py-0.5 rounded-full"><AlertTriangle className="size-3" /> Duplicado</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full"><CheckCircle className="size-3" /> Novo</span>
                  }
                  <span className={`font-mono text-sm font-semibold whitespace-nowrap ${r.kind === "income" ? "text-emerald-400" : "text-foreground/90"}`}>
                    {r.kind === "income" ? "+" : "−"} R$ {r.amount_raw}
                  </span>
                </div>
                <p className="text-sm font-medium line-clamp-2 min-w-0">{r.description}</p>
                <div className="flex items-center justify-between text-[11px] text-foreground/50">
                  <span className="font-mono">{r.occurred_on}</span>
                  <span className={`font-semibold ${r.kind === "income" ? "text-emerald-400" : "text-foreground/60"}`}>
                    {r.kind === "income" ? "Receita" : "Despesa"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabela */}
          <GlassCard className="hidden sm:block overflow-hidden border border-white/10">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
                  <TableRow className="border-white/10">
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-28 whitespace-nowrap">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead className="w-32 text-right whitespace-nowrap">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow
                      key={i}
                      className={`border-white/5 ${
                        r.is_duplicate
                          ? "bg-red-500/10 text-red-300/70"
                          : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <TableCell>
                        {r.is_duplicate
                          ? <span className="inline-flex items-center gap-1 text-[11px] text-red-300 font-bold bg-red-500/20 px-2 py-0.5 rounded-full"><AlertTriangle className="size-3" /> Duplicado</span>
                          : <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full"><CheckCircle className="size-3" /> Novo</span>
                        }
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground/60 whitespace-nowrap">{r.occurred_on}</TableCell>
                      <TableCell className="min-w-0 max-w-md truncate font-medium">{r.description}</TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold ${r.kind === "income" ? "text-emerald-400" : "text-foreground/60"}`}>
                          {r.kind === "income" ? "Receita" : "Despesa"}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold whitespace-nowrap ${r.kind === "income" ? "text-emerald-400" : "text-foreground/80"}`}>
                        {r.kind === "income" ? "+" : "−"} R$ {r.amount_raw}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </GlassCard>
        </div>
      )}

    </div>
  );
}
