/**
 * Rota /dashboard — Painel de Controle Principal.
 * Consome server functions (admin) que já lidam com auth seed e expurgo
 * contábil. Aritmética monetária via lib BigInt (sem Number cru).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Wallet,
  Landmark,
  Target,
  TrendingUp,
  ArrowRight,
  CreditCard,
  Banknote,
} from "lucide-react";

import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  getDashboardSummary,
  getOpenCreditCardInvoices,
} from "@/services/dashboard.functions";
import { listBudgets } from "@/services/budgets.functions";
import { toCents, fromCents, safePercent } from "@/lib/finance/money";

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------
const summaryQuery = () =>
  queryOptions({
    queryKey: ["dashboard", "summary"],
    queryFn: () => getDashboardSummary({ data: {} }),
  });

const invoicesQuery = () =>
  queryOptions({
    queryKey: ["dashboard", "invoices"],
    queryFn: () => getOpenCreditCardInvoices(),
  });

const budgetsQuery = () =>
  queryOptions({
    queryKey: ["dashboard", "budgets"],
    queryFn: () => listBudgets({ data: {} }),
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Gerente Fina" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(summaryQuery()),
      context.queryClient.ensureQueryData(invoicesQuery()),
      context.queryClient.ensureQueryData(budgetsQuery()),
    ]);
  },
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <h2 className="text-xl font-semibold">Não foi possível carregar o Dashboard</h2>
        <p className="text-sm text-foreground/60">{error?.message ?? "Erro desconhecido"}</p>
        <Button onClick={reset}>Tentar novamente</Button>
      </div>
    </AppShell>
  ),
  component: DashboardPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BRL = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(fromCents(toCents(value))),
  );

const ACCOUNT_META: Record<string, { icon: typeof Landmark; label: string }> = {
  cash: { icon: Banknote, label: "Dinheiro" },
  bank: { icon: Landmark, label: "Banco" },
  credit_card: { icon: CreditCard, label: "Cartão" },
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
function DashboardPage() {
  const { data: summary } = useSuspenseQuery(summaryQuery());
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const { data: budgets } = useSuspenseQuery(budgetsQuery());

  const topBudgets = budgets.slice(0, 5);
  const isNegative = (v: string) => toCents(v) < 0n;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Visão Geral</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Saúde do seu ecossistema financeiro em tempo real.
          </p>
        </header>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GlassCard className="border border-white/10 bg-zinc-900/40 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">Saldo Consolidado</span>
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Wallet className="size-5" />
              </div>
            </div>
            <h3
              className={`mt-4 font-mono text-3xl font-bold tracking-tight ${
                isNegative(summary.consolidated_balance) ? "text-red-400" : "text-foreground/90"
              }`}
            >
              {BRL(summary.consolidated_balance)}
            </h3>
            <p className="mt-1 text-xs text-foreground/40">
              Soma de {summary.accounts.length} contas ativas
            </p>
          </GlassCard>

          <GlassCard className="border border-white/10 bg-zinc-900/40 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">Receitas do mês</span>
              <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-400">
                <TrendingUp className="size-5" />
              </div>
            </div>
            <h3 className="mt-4 font-mono text-3xl font-bold tracking-tight text-emerald-300">
              {BRL(summary.income)}
            </h3>
            <p className="mt-1 text-xs text-foreground/40">Sem fluxos neutros</p>
          </GlassCard>

          <GlassCard className="border border-white/10 bg-zinc-900/40 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">Despesas do mês</span>
              <div className="rounded-full bg-red-500/10 p-2 text-red-400">
                <CreditCard className="size-5" />
              </div>
            </div>
            <h3 className="mt-4 font-mono text-3xl font-bold tracking-tight text-red-300">
              {BRL(summary.expense)}
            </h3>
            <p className="mt-1 text-xs text-foreground/40">Categorizado por DRE</p>
          </GlassCard>

          <GlassCard className="border border-white/10 bg-zinc-900/40 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/60">Resultado líquido</span>
              <div className="rounded-full bg-amber-500/10 p-2 text-amber-400">
                <Target className="size-5" />
              </div>
            </div>
            <h3
              className={`mt-4 font-mono text-3xl font-bold tracking-tight ${
                isNegative(summary.net_result) ? "text-red-400" : "text-foreground/90"
              }`}
            >
              {BRL(summary.net_result)}
            </h3>
            <p className="mt-1 text-xs text-foreground/40">{invoices.length} faturas abertas</p>
          </GlassCard>
        </div>

        {/* Listagens */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Contas */}
          <GlassCard className="flex flex-col justify-between border border-white/10 p-6">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-lg font-medium text-foreground/90">Minhas Contas</h2>
                <span className="font-mono text-xs text-foreground/40">
                  {summary.accounts.length} mapeadas
                </span>
              </div>

              <div className="mt-4 divide-y divide-white/5">
                {summary.accounts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-foreground/40">
                    Nenhuma conta cadastrada.
                  </p>
                ) : (
                  summary.accounts.map((acc) => {
                    const meta = ACCOUNT_META[acc.account_type] ?? ACCOUNT_META.bank;
                    const Icon = meta.icon;
                    const neg = isNegative(acc.balance);
                    return (
                      <div
                        key={acc.account_id}
                        className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-lg bg-white/5 text-foreground/60">
                            <Icon className="size-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground/90">
                              {acc.account_name}
                            </p>
                            <p className="text-xs text-foreground/40">{meta.label}</p>
                          </div>
                        </div>
                        <span
                          className={`font-mono text-sm font-semibold ${
                            neg ? "text-red-400" : "text-foreground/80"
                          }`}
                        >
                          {BRL(acc.balance)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-white/5 pt-4">
              <Link to="/accounts">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs text-primary hover:bg-primary/5"
                >
                  Gerenciar contas <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
          </GlassCard>

          {/* Orçamentos */}
          <GlassCard className="flex flex-col justify-between border border-white/10 p-6">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-lg font-medium text-foreground/90">Orçamentos do mês</h2>
                <span className="text-xs font-medium text-primary">Top {topBudgets.length}</span>
              </div>

              <div className="mt-5 space-y-5">
                {topBudgets.length === 0 ? (
                  <p className="py-6 text-center text-sm text-foreground/40">
                    Defina tetos em Orçamentos.
                  </p>
                ) : (
                  topBudgets.map((b) => {
                    const pct = safePercent(b.spent, b.amount);
                    const tone =
                      pct >= 100
                        ? "text-red-400"
                        : pct >= 80
                          ? "text-amber-400"
                          : "text-emerald-400";
                    return (
                      <div key={b.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-foreground/80">
                            {b.category_name ?? "Geral"}
                          </span>
                          <span className={`font-mono text-xs ${tone}`}>
                            {BRL(b.spent)} / {BRL(b.amount)}
                          </span>
                        </div>
                        <Progress value={Math.min(pct, 100)} className="h-1.5" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-white/5 pt-4">
              <Link to="/budgets">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs text-primary hover:bg-primary/5"
                >
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
