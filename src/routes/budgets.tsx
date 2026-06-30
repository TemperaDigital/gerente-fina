/**
 * Rota /budgets — Orçamentos (tetos de gasto por categoria).
 *
 * Fiação real com Supabase via listBudgets / upsertBudget / deleteBudget.
 * Metas de Poupança ainda não possuem tabela (ver AGENTS.md §6 — pendência).
 */
import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus, Target, PiggyBank, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import {
  GlassCard,
  GooglePeriodPicker,
  formatBRL,
} from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Skeleton } from "@/components/ui/skeleton";

import {
  listBudgets,
  upsertBudget,
  deleteBudget,
  type BudgetDTO,
} from "@/services/budgets.functions";
import { getCategoriesLookup } from "@/services/lookups.functions";
import { safePercent } from "@/lib/finance/money";

// ---------------------------------------------------------------------------
// Search params
// ---------------------------------------------------------------------------
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface BudgetsSearch {
  month: string; // YYYY-MM
}

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------
const budgetsQuery = (month: string) =>
  queryOptions({
    queryKey: ["budgets", month],
    queryFn: () => listBudgets({ data: { month } }),
  });

const categoriesQuery = () =>
  queryOptions({
    queryKey: ["lookups", "categories"],
    queryFn: () => getCategoriesLookup(),
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/budgets")({
  head: () => ({
    meta: [
      { title: "Orçamentos — Gerente Fina" },
      {
        name: "description",
        content: "Defina tetos mensais de gasto por categoria.",
      },
    ],
  }),
  validateSearch: (raw): BudgetsSearch => {
    const m =
      typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month)
        ? raw.month
        : currentMonth();
    return { month: m };
  },
  loaderDeps: ({ search: { month } }) => ({ month }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(budgetsQuery(deps.month)),
      context.queryClient.ensureQueryData(categoriesQuery()),
    ]);
  },
  pendingComponent: BudgetsPending,
  errorComponent: BudgetsError,
  component: () => (
    <AppShell>
      <BudgetsPage />
    </AppShell>
  ),
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function BudgetsPage() {
  const { month } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: budgets } = useSuspenseQuery(budgetsQuery(month));
  const { data: categories } = useSuspenseQuery(categoriesQuery());

  const expenseCategories = categories.filter((c) => c.kind === "expense");

  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [scopeGlobal, setScopeGlobal] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<BudgetDTO | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setCategoryId("");
    setAmount("");
    setScopeGlobal(true);
  };

  const upsertMut = useMutation({
    mutationFn: () =>
      upsertBudget({
        data: {
          category_id: categoryId,
          amount,
          reference_month: scopeGlobal ? null : month,
        },
      }),
    onSuccess: async () => {
      toast.success("Orçamento salvo.");
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      router.invalidate();
      setOpenForm(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBudget({ data: { id } }),
    onSuccess: async () => {
      toast.success("Orçamento removido.");
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      router.invalidate();
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (b: BudgetDTO) => {
    setEditingId(b.id);
    setCategoryId(b.category_id);
    setAmount(b.amount);
    setScopeGlobal(b.reference_month === null);
    setOpenForm(true);
  };

  const setMonth = (next: string) =>
    navigate({ search: (prev: BudgetsSearch) => ({ ...prev, month: next }) });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return toast.error("Selecione uma categoria.");
    if (!amount.trim()) return toast.error("Informe o valor do teto.");
    upsertMut.mutate();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Orçamentos e Metas
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Defina tetos de gastos mensais por categoria. O consumo é
              calculado em tempo real a partir das suas transações.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <GooglePeriodPicker value={month} onChange={setMonth} />
            <Button
              onClick={() => {
                resetForm();
                setOpenForm(true);
              }}
              className="gap-2 rounded-full"
            >
              <Plus className="size-4" /> Definir Limite
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* BLOCO ORÇAMENTOS */}
          <section className="space-y-4 lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-foreground">
              <Target className="size-5 text-indigo-400" />
              <h2 className="text-sm font-semibold tracking-wide">
                Limites Mensais
              </h2>
              <span className="ml-auto text-xs text-foreground/50">
                {budgets.length} {budgets.length === 1 ? "categoria" : "categorias"}
              </span>
            </div>

            {budgets.length === 0 ? (
              <GlassCard className="px-4 py-10 text-center text-sm text-foreground/60">
                Nenhum teto definido para este mês. Use{" "}
                <span className="font-medium text-foreground">Definir Limite</span>{" "}
                para começar.
              </GlassCard>
            ) : (
              <ul className="space-y-3">
                {budgets.map((b) => (
                  <BudgetItem
                    key={b.id}
                    budget={b}
                    onEdit={() => openEdit(b)}
                    onDelete={() => setPendingDelete(b)}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* METAS — placeholder */}
          <aside className="space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <PiggyBank className="size-5 text-emerald-400" />
              <h2 className="text-sm font-semibold tracking-wide">
                Metas de Poupança
              </h2>
            </div>
            <GlassCard className="px-4 py-8 text-center text-sm text-foreground/60">
              Em breve. Definição de objetivos de poupança com prazo e progresso
              chega na próxima migração de schema.
            </GlassCard>
          </aside>
        </div>
      </div>

      {/* FORM */}
      <Dialog open={openForm} onOpenChange={(o) => { setOpenForm(o); if (!o) resetForm(); }}>
        <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Limite" : "Definir Teto de Gasto"}
            </DialogTitle>
            <DialogDescription className="text-foreground/60">
              Tetos globais valem para todos os meses; tetos do mês sobrescrevem
              o global apenas no período selecionado.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria de despesa</Label>
              <Select
                value={categoryId}
                onValueChange={setCategoryId}
                disabled={!!editingId}
              >
                <SelectTrigger className="border-white/10 bg-white/[0.04]">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                  {expenseCategories.length === 0 && (
                    <SelectItem value="__empty" disabled>
                      Nenhuma categoria de despesa cadastrada.
                    </SelectItem>
                  )}
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor limite (R$)</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="border-white/10 bg-white/[0.04]"
              />
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <input
                id="scope-global"
                type="checkbox"
                checked={scopeGlobal}
                onChange={(e) => setScopeGlobal(e.target.checked)}
                className="size-4"
              />
              <label htmlFor="scope-global" className="text-sm text-foreground/80">
                Aplicar em todos os meses (orçamento global)
              </label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setOpenForm(false); resetForm(); }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={upsertMut.isPending}>
                {upsertMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover orçamento?</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/60">
              O teto de{" "}
              <strong className="text-foreground">
                {pendingDelete?.category_name ?? "categoria"}
              </strong>{" "}
              será removido. As transações não são afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMut.mutate(pendingDelete.id)}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget item
// ---------------------------------------------------------------------------
function BudgetItem({
  budget,
  onEdit,
  onDelete,
}: {
  budget: BudgetDTO;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pct = safePercent(budget.spent, budget.amount);
  const isOver = pct >= 100;
  const tone =
    pct >= 100
      ? "from-rose-500 to-red-600"
      : pct >= 70
      ? "from-amber-500 to-orange-600"
      : "from-emerald-500 to-teal-600";

  return (
    <li>
      <GlassCard className="p-5">
        <div className="flex items-start justify-between gap-3">
          <button onClick={onEdit} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold text-foreground">
              {budget.category_name ?? "Categoria"}
            </div>
            <div className="mt-0.5 text-[11px] text-foreground/50">
              Gasto: {formatBRL(budget.spent)} de {formatBRL(budget.amount)}
              {budget.reference_month === null && " · global"}
            </div>
          </button>
          <div className="flex items-center gap-2">
            {isOver && (
              <span className="flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                <AlertCircle className="size-3" /> Estourado
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-foreground/50 hover:text-rose-300"
              onClick={onDelete}
              aria-label="Remover orçamento"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-white/5 bg-zinc-900/80 p-0.5">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-500`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>

        <div className="mt-2 flex justify-between font-mono text-[10px] text-foreground/50">
          <span>{pct.toFixed(0)}% consumido</span>
          <span>Disponível: {formatBRL(budget.remaining)}</span>
        </div>
      </GlassCard>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Pending & Error
// ---------------------------------------------------------------------------
function BudgetsPending() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48 bg-white/10" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full bg-white/10" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function BudgetsError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <GlassCard className="max-w-md p-6 text-center">
          <h2 className="text-lg font-semibold">Não foi possível carregar os orçamentos</h2>
          <p className="mt-2 text-sm text-foreground/60">{error.message}</p>
          <Button className="mt-4" onClick={() => router.invalidate()}>
            Tentar novamente
          </Button>
        </GlassCard>
      </div>
    </AppShell>
  );
}
