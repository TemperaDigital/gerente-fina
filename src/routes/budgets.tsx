/**
 * Rota /budgets — Tetos de gastos por categoria.
 * Barra de progresso visual derivada das transactions kind='expense'.
 */
import { useState } from "react";
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import {
  GlassCard,
  GooglePeriodPicker,
  formatBRL,
} from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { listBudgets, upsertBudget, deleteBudget } from "@/services/budgets.functions";
import { getCategoriesLookup } from "@/services/lookups.functions";
import { cn } from "@/lib/utils";

interface BudgetsSearch {
  month: string;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const budgetsQ = (month: string) =>
  queryOptions({
    queryKey: ["budgets", month],
    queryFn: () => listBudgets({ data: { month } }),
  });
const categoriesQ = () =>
  queryOptions({
    queryKey: ["lookup", "categories"],
    queryFn: () => getCategoriesLookup(),
  });

export const Route = createFileRoute("/budgets")({
  head: () => ({ meta: [{ title: "Orçamentos — Gerente Fina" }] }),
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
      context.queryClient.ensureQueryData(budgetsQ(deps.month)),
      context.queryClient.ensureQueryData(categoriesQ()),
    ]);
  },
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="p-6 text-rose-400">{error.message}</div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-6 text-foreground/60">Indisponível.</div>
    </AppShell>
  ),
  component: BudgetsPage,
});

function BudgetsPage() {
  const { month } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const { data: budgets } = useSuspenseQuery(budgetsQ(month));
  const { data: categories } = useSuspenseQuery(categoriesQ());
  const expenseCats = categories.filter((c) => c.kind === "expense");

  const upsertFn = useServerFn(upsertBudget);
  const deleteFn = useServerFn(deleteBudget);

  const [catId, setCatId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [recurring, setRecurring] = useState(true);

  const upsert = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          category_id: catId,
          amount,
          reference_month: recurring ? null : month,
        },
      }),
    onSuccess: () => {
      toast.success("Orçamento salvo.");
      setAmount("");
      setCatId("");
      qc.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Orçamento removido.");
      qc.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              Orçamentos
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Tetos por categoria — consumo em tempo real.
            </p>
          </div>
          <GooglePeriodPicker
            value={month}
            onChange={(m) =>
              navigate({ search: () => ({ month: m }) })
            }
          />
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr,2fr]">
          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold">Novo teto</h2>
            <div className="mt-3 space-y-3">
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={catId} onValueChange={setCatId}>
                  <SelectTrigger className="mt-1 border-white/10 bg-white/[0.04]">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCats.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor mensal (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 border-white/10 bg-white/[0.04]"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground/70">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="accent-primary"
                />
                Recorrente em todos os meses
              </label>
              <Button
                onClick={() => upsert.mutate()}
                disabled={!catId || !amount || upsert.isPending}
                className="w-full gap-2"
              >
                <Plus className="size-4" /> Salvar
              </Button>
            </div>
          </GlassCard>

          <div className="space-y-3">
            {budgets.length === 0 ? (
              <GlassCard className="p-8 text-center text-sm text-foreground/50">
                Nenhum orçamento configurado para este mês.
              </GlassCard>
            ) : (
              budgets.map((b) => {
                const tone =
                  b.percent >= 100
                    ? "bg-rose-400"
                    : b.percent >= 80
                    ? "bg-amber-400"
                    : "bg-emerald-400";
                return (
                  <GlassCard key={b.id} className="p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {b.category_name ?? "—"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-foreground/50">
                          {b.reference_month ? "Pontual deste mês" : "Recorrente"}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-foreground/50 hover:text-rose-400"
                        onClick={() => remove.mutate(b.id)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Progress
                      value={b.percent}
                      className={cn("mt-3 h-2 bg-white/10", `[&>div]:${tone}`)}
                    />
                    <div className="mt-2 grid grid-cols-3 text-xs">
                      <div>
                        <div className="text-foreground/50">Gasto</div>
                        <div className="font-semibold tabular-nums text-rose-300">
                          {formatBRL(b.spent)}
                        </div>
                      </div>
                      <div>
                        <div className="text-foreground/50">Teto</div>
                        <div className="font-semibold tabular-nums">
                          {formatBRL(b.amount)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-foreground/50">Restante</div>
                        <div
                          className={cn(
                            "font-semibold tabular-nums",
                            Number(b.remaining) < 0
                              ? "text-rose-300"
                              : "text-emerald-300",
                          )}
                        >
                          {formatBRL(b.remaining)}
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
