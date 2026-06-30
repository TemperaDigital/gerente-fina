/**
 * Rota /dashboard — Painel de Controle Principal.
 * Consumo em tempo real da View account_balances e sumário de orçamentos.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Landmark, 
  Target, 
  TrendingUp,
  ArrowRight 
} from "lucide-react";

import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Tipagens dos Dados da View e Tabelas do Supabase
// ---------------------------------------------------------------------------
interface AccountBalance {
  account_id: string;
  account_name: string;
  bank_name: string | null;
  balance: number;
}

interface BudgetSummary {
  id: string;
  limit_amount: number;
  current_amount: number;
  categories: {
    name: string;
  } | null;
}

// ---------------------------------------------------------------------------
// TanStack Query Options — Agrupando chamadas paralelas para performance
// ---------------------------------------------------------------------------
const dashboardQueryOptions = () =>
  queryOptions({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Consome a View de saldos consolidados por conta
      const { data: balancesData, error: balancesError } = await supabase
        .from("account_balances")
        .select("account_id, account_name, bank_name, balance");

      // 2. Busca os top 3 orçamentos críticos para o card de visão geral
      const { data: budgetsData, error: budgetsError } = await supabase
        .from("budgets")
        .select("id, limit_amount, current_amount, categories ( name )")
        .eq("user_id", user.id)
        .limit(3);

      if (balancesError) throw balancesError;
      if (budgetsError) throw budgetsError;

      return {
        balances: (balancesData as unknown as AccountBalance[]) || [],
        budgets: (budgetsData as unknown as BudgetSummary[]) || [],
      };
    },
  });

// ---------------------------------------------------------------------------
// Definição da Rota do TanStack Router
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — Gerente Fina" }],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(dashboardQueryOptions());
  },
  component: DashboardPage,
});

// ---------------------------------------------------------------------------
// Componente Principal da Tela
// ---------------------------------------------------------------------------
function DashboardPage() {
  // Puxa os dados cacheados e pré-carregados pelo Loader do Router
  const { data } = useSuspenseQuery(dashboardQueryOptions());
  const { balances, budgets } = data;

  // Cálculos dinâmicos em cima dos dados REAIS do banco
  const totalBalance = balances.reduce((acc, curr) => acc + (curr.balance || 0), 0);
  
  // Helpers de formatação
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-8">
        
        {/* Cabeçalho */}
        <header>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Visão Geral
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Acompanhe a saúde do seu ecossistema financeiro consolidado hoje.
          </p>
        </header>

        {/* Módulo 1: Cards de Indicadores Globais */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <GlassCard className="p-6 border border-white/10 bg-zinc-900/40">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">Saldo Bruto Consolidado</span>
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Wallet className="size-5" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-mono font-bold tracking-tight text-foreground/90">
                {formatCurrency(totalBalance)}
              </h3>
              <p className="mt-1 text-xs text-emerald-400 font-medium flex items-center gap-1">
                <TrendingUp className="size-3" /> Soma de todas as contas ativas
              </p>
            </div>
          </GlassCard>

          <GlassCard className="p-6 border border-white/10 bg-zinc-900/40">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">Orçamentos Ativos</span>
              <div className="rounded-full bg-amber-500/10 p-2 text-amber-400">
                <Target className="size-5" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-3xl font-mono font-bold tracking-tight text-foreground/90">
                {budgets.length}
              </h3>
              <p className="mt-1 text-xs text-foreground/40">
                Limites de gastos monitorados por categoria
              </p>
            </div>
          </GlassCard>

          <GlassCard className="p-6 border border-white/10 bg-zinc-900/40 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">Acesso Operacional</span>
              <div className="rounded-full bg-blue-500/10 p-2 text-blue-400">
                <Landmark className="size-5" />
              </div>
            </div>
            <div className="mt-4 flex h-11 items-center justify-between">
              <span className="text-sm text-foreground/70">Ambiente de Desenvolvimento</span>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20 animate-pulse">
                Seed Active
              </span>
            </div>
          </GlassCard>
        </div>

        {/* Módulo 2: Grid de Distribuição Monetária */}
        <div className="grid gap-6 md:grid-cols-2">
          
          {/* Listagem de Saldos Reais da View */}
          <GlassCard className="p-6 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-lg font-medium text-foreground/90">Minhas Contas e Bancos</h2>
                <span className="text-xs text-foreground/40 font-mono">{balances.length} mapeadas</span>
              </div>
              
              <div className="mt-4 divide-y divide-white/5">
                {balances.length === 0 ? (
                  <p className="py-6 text-center text-sm text-foreground/40">Nenhum saldo encontrado na View.</p>
                ) : (
                  balances.map((acc) => (
                    <div key={acc.account_id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-white/5 text-foreground/60">
                          <Landmark className="size-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground/90">{acc.account_name}</p>
                          <p className="text-xs text-foreground/40">{acc.bank_name || "Instituição"}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-mono font-semibold ${acc.balance >= 0 ? "text-foreground/80" : "text-red-400"}`}>
                        {formatCurrency(acc.balance)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-white/5">
              <Link to="/accounts">
                <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-primary hover:bg-primary/5">
                  Gerenciar contas bancárias <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
          </GlassCard>

          {/* Sumário de Monitoramento de Orçamentos */}
          <GlassCard className="p-6 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-lg font-medium text-foreground/90">Status dos Limites</h2>
                <span className="text-xs text-primary font-medium">Foco do mês</span>
              </div>

              <div className="mt-5 space-y-5">
                {budgets.length === 0 ? (
                  <p className="py-6 text-center text-sm text-foreground/40">Vá em Orçamentos para fixar tetos de despesas.</p>
                ) : (
                  budgets.map((b) => {
                    const limit = b.limit_amount || 1;
                    const pct = Math.min(Math.round((b.current_amount / limit) * 100), 100);
                    return (
                      <div key={b.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-foreground/80">{b.categories?.name || "Geral"}</span>
                          <span className="text-xs font-mono text-foreground/40">
                            {formatCurrency(b.current_amount)} / {formatCurrency(b.limit_amount)}
                          </span>
                        </div>
                        <Progress value={pct} className={`h-1.5 ${pct >= 100 ? "bg-red-500/20" : "bg-primary/20"}`} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5">
              <Link to="/budgets">
                <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-primary hover:bg-primary/5">
                  Ver todos os orçamentos <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
          </GlassCard>

        </div>
      </div>
    </AppShell>
  );
}