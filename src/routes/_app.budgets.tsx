/**
 * Rota /budgets — Orçamentos por categoria.
 * Consome server functions com Admin Client (seed user). Metas de poupança ficam
 * marcadas como "Em breve" — a tabela `goals` ainda não foi materializada no banco.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Target, PiggyBank, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { GlassCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listBudgets,
  upsertBudget,
  deleteBudget,
  type BudgetDTO,
} from "@/services/budgets.functions";
import { getCategoriesLookup, type CategoryLookupDTO } from "@/services/lookups.functions";

const formatBRL = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0) || 0,
  );

function budgetsQO(fn: () => Promise<BudgetDTO[]>) {
  return queryOptions({ queryKey: ["budgets", "list"], queryFn: fn });
}
function categoriesQO(fn: () => Promise<CategoryLookupDTO[]>) {
  return queryOptions({ queryKey: ["lookups", "expense-cats"], queryFn: fn });
}

export const Route = createFileRoute("/_app/budgets")({
  head: () => ({ meta: [{ title: "Orçamentos — Gerente Fina" }] }),
  component: BudgetsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <GlassCard className="p-6 text-sm text-red-300">
          Erro ao carregar orçamentos: {error.message}
        </GlassCard>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-8 text-sm text-foreground/60">Recurso não encontrado.</div>
    </AppShell>
  ),
});

function BudgetsPage() {
  const qc = useQueryClient();
  const fetchBudgets = useServerFn(listBudgets);
  const fetchCats = useServerFn(getCategoriesLookup);
  const saveBudget = useServerFn(upsertBudget);
  const removeBudget = useServerFn(deleteBudget);

  const { data: budgets } = useSuspenseQuery(
    budgetsQO(() => fetchBudgets({ data: {} })),
  );
  const { data: categories } = useSuspenseQuery(categoriesQO(fetchCats));

  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const upsert = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("Selecione uma categoria.");
      if (!amount.trim()) throw new Error("Informe um valor.");
      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1,
      ).padStart(2, "0")}`;
      await saveBudget({
        data: { category_id: categoryId, amount, reference_month: month },
      });
    },
    onSuccess: () => {
      toast.success("Orçamento salvo.");
      setOpen(false);
      setCategoryId("");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await removeBudget({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Orçamento removido.");
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Orçamentos & Metas
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Defina tetos de gastos por categoria e acompanhe o consumo no mês.
          </p>
        </header>

        <Tabs defaultValue="limites" className="w-full">
          <TabsList className="mb-6 grid w-full max-w-md grid-cols-2 border border-white/10 bg-zinc-950/40 p-1">
            <TabsTrigger value="limites" className="gap-2">
              <Target className="size-4" /> Tetos mensais
            </TabsTrigger>
            <TabsTrigger value="metas" className="gap-2">
              <PiggyBank className="size-4" /> Metas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="limites" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-full gap-2">
                    <Plus className="size-4" /> Novo teto
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Definir teto mensal</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Categoria</Label>
                      <Select value={categoryId} onValueChange={setCategoryId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.filter((c) => c.kind === "expense").map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Valor limite (R$)</Label>
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => upsert.mutate()}
                      disabled={upsert.isPending}
                    >
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {budgets.length === 0 ? (
              <GlassCard className="p-12 text-center text-foreground/60">
                <Target className="mx-auto mb-4 size-12 opacity-30" />
                Nenhum teto definido ainda.
              </GlassCard>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {budgets.map((b) => {
                  const pct = Math.min(b.percent, 100);
                  const over = b.percent >= 100;
                  const warn = b.percent >= 80 && b.percent < 100;
                  return (
                    <GlassCard
                      key={b.id}
                      className="flex flex-col justify-between border border-white/10 p-5"
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium">
                              {b.category_name ?? "Categoria"}
                            </h3>
                            <p className="mt-0.5 text-xs uppercase tracking-wider text-foreground/40">
                              {b.reference_month ? "Mensal" : "Global"}
                            </p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-destructive opacity-50 hover:bg-destructive/10 hover:opacity-100"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover teto?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O teto de "{b.category_name}" será apagado.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => remove.mutate(b.id)}
                                >
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                        <div className="my-4 space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="font-mono text-xl font-semibold">
                              {formatBRL(b.spent)}
                            </span>
                            <span className="text-xs text-foreground/50">
                              de {formatBRL(b.amount)}
                            </span>
                          </div>
                          <Progress value={pct} className="h-2" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                        <span className="font-medium text-foreground/70">
                          {b.percent}% consumido
                        </span>
                        {over ? (
                          <span className="flex items-center gap-1 font-medium text-red-400">
                            <AlertTriangle className="size-3.5" /> Estourado
                          </span>
                        ) : warn ? (
                          <span className="flex items-center gap-1 font-medium text-amber-400">
                            <AlertTriangle className="size-3.5" /> Atenção
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-400">
                            No ritmo
                          </span>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="metas">
            <GlassCard className="p-12 text-center text-foreground/60">
              <PiggyBank className="mx-auto mb-4 size-12 opacity-30" />
              Metas de poupança em construção — a tabela <code>goals</code>{" "}
              será materializada em breve.
            </GlassCard>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
