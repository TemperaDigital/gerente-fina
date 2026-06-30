/**
 * Rota /budgets — Gerenciador de Orçamentos & Metas de Poupança.
 * Conexão direta com Supabase, cálculo de progresso e fim do "Em Breve".
 */
import { createFileRoute } from "@tanstack/react-router";
import { 
  queryOptions, 
  useMutation, 
  useQueryClient, 
  useSuspenseQuery 
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { Plus, Target, PiggyBank, TrendingUp, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ---------------------------------------------------------------------------
// Tipagens Estruturadas
// ---------------------------------------------------------------------------
interface BudgetWithCategory {
  id: string;
  category_id: string;
  limit_amount: number;
  current_amount: number;
  period: string;
  categories: {
    name: string;
  } | null;
}

interface SavingGoal {
  id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Queries do TanStack Query (Fiação Direta do Banco)
// ---------------------------------------------------------------------------
const budgetsQueryOptions = () =>
  queryOptions({
    queryKey: ["budgets", "list"],
    queryFn: async (): Promise<BudgetWithCategory[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Busca orçamentos trazendo o nome da categoria associada via Join
      const { data, error } = await supabase
        .from("budgets")
        .select(`
          id,
          category_id,
          limit_amount,
          current_amount,
          period,
          categories ( name )
        `)
        .eq("user_id", user.id);

      if (error) throw error;
      return (data as unknown as BudgetWithCategory[]) || [];
    },
  });

const goalsQueryOptions = () =>
  queryOptions({
    queryKey: ["goals", "list"],
    queryFn: async (): Promise<SavingGoal[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("goals")
        .select("id, title, target_amount, current_amount, target_date, status")
        .eq("user_id", user.id)
        .order("target_date", { ascending: true });

      if (error) throw error;
      return (data as unknown as SavingGoal[]) || [];
    },
  });

// ---------------------------------------------------------------------------
// Definição da Rota do TanStack Router
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/budgets")({
  head: () => ({
    meta: [{ title: "Orçamentos & Metas — Gerente Fina" }],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(budgetsQueryOptions()),
      context.queryClient.ensureQueryData(goalsQueryOptions()),
    ]);
  },
  component: BudgetsAndGoalsPage,
});

// ---------------------------------------------------------------------------
// Componente Principal da Tela
// ---------------------------------------------------------------------------
function BudgetsAndGoalsPage() {
  const queryClient = useQueryClient();

  // Consome os dados reais sincronizados do banco de dados
  const { data: budgets } = useSuspenseQuery(budgetsQueryOptions());
  const { data: goals } = useSuspenseQuery(goalsQueryOptions());

  // Mutations para exclusão (Pronto para você estender para o CRUD completo)
  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orçamento removido.");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Meta de poupança removida.");
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  // Auxiliares de Formatação
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const calculatePercentage = (current: number, limit: number) => {
    if (!limit || limit === 0) return 0;
    const percentage = (current / limit) * 100;
    return Math.min(Math.round(percentage), 100);
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Gestão de Limites e Metas
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Controle seus tetos de gastos por categoria e monitore seus objetivos de acúmulo de capital.
          </p>
        </header>

        <Tabs defaultValue="limites" className="w-full">
          <TabsList className="mb-6 grid w-full grid-cols-2 max-w-md border border-white/10 bg-zinc-950/40 p-1">
            <TabsTrigger value="limites" className="gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Target className="size-4" /> Orçamentos Mensais
            </TabsTrigger>
            <TabsTrigger value="metas" className="gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <PiggyBank className="size-4" /> Metas de Poupança
            </TabsTrigger>
          </TabsList>

          {/* ========================================================================= */}
          {/* ABA 1: ORÇAMENTOS POR CATEGORIA */}
          {/* ========================================================================= */}
          <TabsContent value="limites" className="space-y-4">
            <div className="flex justify-end mb-2">
              <Button className="rounded-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="size-4" /> Definir Novo Teto
              </Button>
            </div>

            {budgets.length === 0 ? (
              <GlassCard className="p-12 text-center text-foreground/60">
                <Target className="mx-auto size-12 opacity-30 mb-4" />
                Nenhum limite de despesa configurado para este mês.
              </GlassCard>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {budgets.map((budget) => {
                  const pct = calculatePercentage(budget.current_amount, budget.limit_amount);
                  const isOver = pct >= 100;
                  const isWarning = pct >= 80 && pct < 100;

                  return (
                    <GlassCard key={budget.id} className="p-5 border border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-foreground/90">
                              {budget.categories?.name || "Categoria Indefinida"}
                            </h3>
                            <p className="text-xs text-foreground/40 uppercase tracking-wider mt-0.5">
                              Período: {budget.period}
                            </p>
                          </div>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="size-8 text-destructive opacity-40 hover:opacity-100 hover:bg-destructive/10"
                            onClick={() => {
                              if(confirm("Deseja deletar este orçamento?")) deleteBudgetMutation.mutate(budget.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        <div className="my-5 space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xl font-mono font-semibold">
                              {formatCurrency(budget.current_amount)}
                            </span>
                            <span className="text-xs text-foreground/50">
                              de {formatCurrency(budget.limit_amount)}
                            </span>
                          </div>
                          <Progress 
                            value={pct} 
                            className={`h-2 ${isOver ? "bg-red-500/20" : isWarning ? "bg-amber-500/20" : "bg-primary/20"}`}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                        <span className="font-medium text-foreground/70">{pct}% consumido</span>
                        {isOver ? (
                          <span className="flex items-center gap-1 text-red-400 font-medium">
                            <AlertTriangle className="size-3.5" /> Estourado
                          </span>
                        ) : isWarning ? (
                          <span className="flex items-center gap-1 text-amber-400 font-medium">
                            <AlertTriangle className="size-3.5" /> Limite Próximo
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-medium">Dentro do planejado</span>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ========================================================================= */}
          {/* ABA 2: METAS DE POUPANÇA (FIM DO "EM BREVE") */}
          {/* ========================================================================= */}
          <TabsContent value="metas" className="space-y-4">
            <div className="flex justify-end mb-2">
              <Button className="rounded-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="size-4" /> Criar Objetivo
              </Button>
            </div>

            {goals.length === 0 ? (
              <GlassCard className="p-12 text-center text-foreground/60">
                <PiggyBank className="mx-auto size-12 opacity-30 mb-4" />
                Nenhum objetivo de poupança ou investimento cadastrado ainda.
              </GlassCard>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {goals.map((goal) => {
                  const pct = calculatePercentage(goal.current_amount, goal.target_amount);
                  const isCompleted = pct >= 100;

                  return (
                    <GlassCard key={goal.id} className="p-5 border border-white/10 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-foreground/90">{goal.title}</h3>
                            <p className="text-xs text-foreground/40 mt-0.5">
                              Alvo: {new Date(goal.target_date).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="size-8 text-destructive opacity-40 hover:opacity-100 hover:bg-destructive/10"
                            onClick={() => {
                              if(confirm("Deseja deletar esta meta?")) deleteGoalMutation.mutate(goal.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        <div className="my-5 space-y-2">
                          <div className="flex items-baseline justify-between">
                            <span className="text-xl font-mono font-semibold text-emerald-400">
                              {formatCurrency(goal.current_amount)}
                            </span>
                            <span className="text-xs text-foreground/50">
                              meta: {formatCurrency(goal.target_amount)}
                            </span>
                          </div>
                          <Progress value={pct} className="h-2 bg-emerald-500/20" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                        <span className="font-medium text-foreground/70">{pct}% acumulado</span>
                        {isCompleted ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <TrendingUp className="size-3.5" /> Concluída! 🎉
                          </span>
                        ) : (
                          <span className="text-primary font-medium">Em andamento</span>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}