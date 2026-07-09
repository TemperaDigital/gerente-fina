/**
 * Rota /dashboard — Painel de Controle Principal.
 *
 * C2: Gráfico de barras Receitas × Despesas (últimos 6 meses) via CashflowChart.
 *     Sempre fixo nos últimos 6 meses, independente do período selecionado
 *     abaixo — é um histórico de tendência, não um recorte do período atual
 *     (decisão da Missão 17, documentada em atualizacoes.md).
 * C3/Missão 17: período persistido na URL via validateSearch — mês
 *     (`?month=YYYY-MM`, padrão) OU ano inteiro (`?month=YYYY`). O mesmo
 *     parâmetro `month` carrega os dois formatos pra não quebrar os outros
 *     lugares do app que já linkam pra cá com `search={{month}}`
 *     (/accounts, /credit-cards) — o formato é distinguido por regex.
 *     Controla KPIs de regime de caixa, "Saldo do Mês/Ano" e o donut de
 *     categorias. O widget de Orçamentos é mensal por natureza (um teto não
 *     agrega por ano) — sempre mostra o mês corrente real, independente do
 *     período selecionado aqui.
 */
import { useEffect, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet,
  Target,
  TrendingUp,
  ArrowRight,
  CreditCard,
  CalendarClock,
  AlertTriangle,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";

import {
  GlassCard,
  PeriodPicker,
  periodLabel,
  formatMonthLabel,
  type DashboardPeriod,
} from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { CategoryDonut } from "@/components/dashboard/category-donut";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AccountsWidget } from "@/components/dashboard/accounts-widget";
import { HeaderClockBar } from "@/components/dashboard/header-clock-bar";
import {
  getDashboardSummary,
  getCashBasisSummary,
  getOpenCreditCardInvoices,
  getMonthlyDreHistory,
  getCategoryBreakdown,
} from "@/services/dashboard.functions";
import { listBudgets } from "@/services/budgets.functions";
import { materializeDueRecurrences } from "@/services/recurrence-materializer.functions";
import { listScheduledItems } from "@/services/scheduled-items.functions";
import { toCents, fromCents, safePercent } from "@/lib/finance/money";

// ---------------------------------------------------------------------------
// Helpers de mês / período (Missão 17)
// ---------------------------------------------------------------------------
function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Search param `month` aceita "YYYY-MM" (mês) OU "YYYY" (ano inteiro). */
function isYearOnly(value: string): boolean {
  return /^\d{4}$/.test(value);
}

/** Deriva o período tipado (mês ou ano) a partir do valor cru da URL. */
function periodFromSearch(value: string): DashboardPeriod {
  return isYearOnly(value) ? { mode: "year", year: Number(value) } : { mode: "month", month: value };
}

/** Serializa o período de volta pro formato aceito pelo search param `month`. */
function periodToSearch(period: DashboardPeriod): string {
  return period.mode === "year" ? String(period.year) : period.month;
}

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------
const summaryQuery = (month: string) =>
  queryOptions({
    queryKey: ["dashboard", "summary", month],
    queryFn: () => getDashboardSummary({ data: { month } }),
  });

const cashBasisQuery = (period: DashboardPeriod) =>
  queryOptions({
    queryKey: ["dashboard", "cash-basis", periodToSearch(period)],
    queryFn: () =>
      getCashBasisSummary({
        data: period.mode === "year" ? { year: period.year } : { month: period.month },
      }),
  });

const invoicesQuery = () =>
  queryOptions({
    queryKey: ["dashboard", "invoices"],
    queryFn: () => getOpenCreditCardInvoices(),
  });

// Orçamentos são mensais por natureza (um teto não agrega por ano) — sempre
// mostra o mês corrente REAL, independente do período selecionado no
// Dashboard (decisão da Missão 17, ver comentário no topo do arquivo).
const budgetsQuery = () =>
  queryOptions({
    queryKey: ["dashboard", "budgets", currentMonth()],
    queryFn: () => listBudgets({ data: {} }),
  });

const dreHistoryQuery = () =>
  queryOptions({
    queryKey: ["dashboard", "dre-history"],
    queryFn: () => getMonthlyDreHistory({ data: { months: 6 } }),
    staleTime: 5 * 60 * 1000,
  });

const breakdownQuery = (period: DashboardPeriod) =>
  queryOptions({
    queryKey: ["dashboard", "breakdown", periodToSearch(period)],
    queryFn: () =>
      getCategoryBreakdown({
        data:
          period.mode === "year"
            ? { year: period.year, kind: "expense" }
            : { month: period.month, kind: "expense" },
      }),
  });

const scheduledQuery = () =>
  queryOptions({
    queryKey: ["agendamentos"],
    queryFn: () => listScheduledItems(),
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
type DashSearch = { month: string };

/**
 * Normaliza o `month` bruto vindo da URL pra "YYYY-MM" ou "YYYY" (ano
 * inteiro). O parser de search padrão do TanStack Router coage valores
 * puramente numéricos pra `number` (ex.: `?month=2026` chega como o número
 * `2026`, não a string "2026") — por isso aceita os dois tipos aqui, não só
 * string.
 */
function normalizePeriodSearch(value: unknown): string {
  if (typeof value === "string" && (/^\d{4}-\d{2}$/.test(value) || /^\d{4}$/.test(value))) {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 1000 && value <= 9999) {
    return String(value);
  }
  return currentMonth();
}

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Gerente Fina" }] }),

  // C3/Missão 17: período persistido na URL — mês ou ano inteiro
  validateSearch: (raw): DashSearch => ({
    month: normalizePeriodSearch(raw.month),
  }),

  loader: async ({ context, location }) => {
    const raw = location.search as DashSearch;
    const monthSearch = normalizePeriodSearch(raw?.month);
    const period = periodFromSearch(monthSearch);
    await Promise.all([
      context.queryClient.ensureQueryData(
        summaryQuery(period.mode === "year" ? currentMonth() : period.month),
      ),
      context.queryClient.ensureQueryData(cashBasisQuery(period)),
      context.queryClient.ensureQueryData(invoicesQuery()),
      context.queryClient.ensureQueryData(budgetsQuery()),
      context.queryClient.ensureQueryData(dreHistoryQuery()),
      context.queryClient.ensureQueryData(breakdownQuery(period)),
      context.queryClient.ensureQueryData(scheduledQuery()),
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
// Helpers de formatação
// ---------------------------------------------------------------------------
const BRL = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(fromCents(toCents(value))),
  );

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
function DashboardPage() {
  const { month: monthSearch } = Route.useSearch();
  const period = periodFromSearch(monthSearch);
  const navigate = useNavigate({ from: "/dashboard" });
  const queryClient = useQueryClient();

  const { data: summary } = useSuspenseQuery(
    summaryQuery(period.mode === "year" ? currentMonth() : period.month),
  );
  const { data: cashBasis } = useSuspenseQuery(cashBasisQuery(period));
  const { data: invoices } = useSuspenseQuery(invoicesQuery());
  const { data: budgets } = useSuspenseQuery(budgetsQuery());
  const { data: dreHistory } = useSuspenseQuery(dreHistoryQuery());
  const { data: breakdown } = useSuspenseQuery(breakdownQuery(period));
  const { data: scheduledItems } = useSuspenseQuery(scheduledQuery());

  // Materializa recorrências vencidas (salário, contas fixas...) uma vez por
  // montagem — silencioso quando não há nada novo, nunca derruba o dashboard.
  const materializedRef = useRef(false);
  useEffect(() => {
    if (materializedRef.current) return;
    materializedRef.current = true;

    materializeDueRecurrences({ data: {} })
      .then((result) => {
        if (result.created > 0) {
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          toast.success(
            `${result.created} lançamento(s) recorrente(s) gerado(s) automaticamente (salário, contas fixas, assinaturas...).`,
          );
        }
      })
      .catch((err: unknown) => {
        console.error("Falha ao materializar recorrências:", err);
      });
  }, [queryClient]);

  const topBudgets = budgets.slice(0, 5);
  const isNegative = (v: string) => toCents(v) < 0n;
  const isCurrentMonth = period.mode === "month" && period.month === currentMonth();

  // Widget "Contas a Vencer" (Missão 7, Parte 3) — próximos 30 dias,
  // incluindo atrasados. Sem ação de confirmar aqui — isso fica só em
  // /agendamentos; este widget é só um lembrete visual.
  const todayForSchedule = new Date();
  todayForSchedule.setHours(0, 0, 0, 0);
  const todayScheduleIso = `${todayForSchedule.getFullYear()}-${String(todayForSchedule.getMonth() + 1).padStart(2, "0")}-${String(todayForSchedule.getDate()).padStart(2, "0")}`;
  const in30 = new Date(todayForSchedule);
  in30.setDate(in30.getDate() + 30);
  const in30Iso = `${in30.getFullYear()}-${String(in30.getMonth() + 1).padStart(2, "0")}-${String(in30.getDate()).padStart(2, "0")}`;
  const dueSoon = scheduledItems
    .filter((i) => i.next_run_on <= in30Iso)
    .sort((a, b) => a.next_run_on.localeCompare(b.next_run_on))
    .slice(0, 5);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <HeaderClockBar />

        {/* Header + seletor de período (Missão 17: mês OU ano inteiro) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Visão Geral</h1>
            <p className="mt-0.5 text-sm text-foreground/50">
              Saúde do seu ecossistema financeiro em tempo real.
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <PeriodPicker
              value={period}
              onChange={(next) => navigate({ search: { month: periodToSearch(next) } })}
            />
            {!isCurrentMonth && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-primary px-2 rounded-lg"
                onClick={() => navigate({ search: { month: currentMonth() } })}
              >
                Hoje
              </Button>
            )}
          </div>
        </div>

        {/* KPIs do mês selecionado — REGIME DE CAIXA (Missão 16): só conta
            dinheiro que de fato entrou/saiu de contas bank/cash no período.
            O donut de categorias e o gráfico de fluxo de caixa continuam em
            regime de competência de propósito — servem para "onde o dinheiro
            foi categorizado", não para "quanto saiu da conta". */}
        <div className="grid gap-4 sm:grid-cols-3">
          <GlassCard className="border border-white/10 bg-zinc-900/40 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
                Receitas
              </span>
              <div className="rounded-full bg-emerald-500/10 p-1.5 text-emerald-400">
                <TrendingUp className="size-4" />
              </div>
            </div>
            <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-emerald-300">
              {BRL(cashBasis.income_cash)}
            </p>
            <p className="mt-1 text-xs text-foreground/30">Regime de caixa — contas e dinheiro</p>
          </GlassCard>

          <GlassCard className="border border-white/10 bg-zinc-900/40 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
                Despesas
              </span>
              <div className="rounded-full bg-red-500/10 p-1.5 text-red-400">
                <CreditCard className="size-4" />
              </div>
            </div>
            <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-red-300">
              {BRL(cashBasis.expense_cash)}
            </p>
            <p className="mt-1 text-xs text-foreground/30">Regime de caixa — inclui fatura paga</p>
          </GlassCard>

          <GlassCard className="border border-white/10 bg-zinc-900/40 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
                Resultado líquido
              </span>
              <div className="rounded-full bg-amber-500/10 p-1.5 text-amber-400">
                <Target className="size-4" />
              </div>
            </div>
            <p
              className={`mt-3 font-mono text-2xl font-bold tracking-tight ${
                isNegative(cashBasis.net_cash) ? "text-red-400" : "text-foreground/90"
              }`}
            >
              {BRL(cashBasis.net_cash)}
            </p>
            <p className="mt-1 text-xs text-foreground/30">Receitas − Despesas (caixa)</p>
          </GlassCard>
        </div>

        {/* "Saldo do Mês" — composição visível dos 5 componentes, não só o
            número final (correção final da Missão 16). */}
        <GlassCard
          className={`border p-5 sm:p-6 ${
            isNegative(cashBasis.monthly_balance)
              ? "border-red-500/50 bg-red-500/10 ring-1 ring-red-500/40"
              : "border-white/10 bg-zinc-900/40"
          }`}
          title={cashBasis.caveats.join(" ")}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`rounded-full p-1.5 ${
                  isNegative(cashBasis.monthly_balance)
                    ? "bg-red-500/20 text-red-400"
                    : "bg-violet-500/10 text-violet-400"
                }`}
              >
                {isNegative(cashBasis.monthly_balance) ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <Wallet className="size-4" />
                )}
              </div>
              <h2 className="text-sm font-semibold text-foreground/80">
                {period.mode === "year" ? "Saldo do Ano" : "Saldo do Mês"}
              </h2>
            </div>
            <p
              className={`font-mono text-2xl font-bold tracking-tight ${
                isNegative(cashBasis.monthly_balance) ? "text-red-400" : "text-foreground/90"
              }`}
            >
              {BRL(cashBasis.monthly_balance)}
            </p>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-5">
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wide text-foreground/40">Receitas</p>
              <p className="mt-1 font-mono font-semibold text-emerald-300">
                +{BRL(cashBasis.income_cash)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wide text-foreground/40">
                Despesas Fixas
              </p>
              <p className="mt-1 font-mono font-semibold text-rose-300">
                −{BRL(cashBasis.fixed_expense_cash)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wide text-foreground/40">
                Despesas Variáveis
              </p>
              <p className="mt-1 font-mono font-semibold text-rose-300">
                −{BRL(cashBasis.variable_expense_cash)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wide text-foreground/40">
                Fatura de Cartões (paga)
              </p>
              <p className="mt-1 font-mono font-semibold text-rose-300">
                −{BRL(cashBasis.invoice_payment_cash)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-wide text-foreground/40">
                Agendamentos Pendentes
              </p>
              <p className="mt-1 font-mono font-semibold text-rose-300">
                −{BRL(cashBasis.scheduled_pending_cash)}
              </p>
            </div>
          </div>

          <p
            className={`mt-3 text-xs ${
              isNegative(cashBasis.monthly_balance)
                ? "font-medium text-red-400/90"
                : "text-foreground/30"
            }`}
          >
            {isNegative(cashBasis.monthly_balance)
              ? "Compromissos já superam a renda do período."
              : "Receitas menos custos fixos, variáveis, fatura de cartão paga e agendamentos pendentes."}
          </p>
        </GlassCard>
        <p className="text-[11px] text-foreground/30">
          * {period.mode === "year" ? "Saldo do Ano" : "Saldo do Mês"} não inclui parcelas de
          cartão (só conta quando a fatura é paga) nem parcelas de empréstimos, financiamentos ou
          consórcios — sem vínculo confiável com lançamentos no schema atual.
        </p>

        {/* Gráficos: barras (histórico) + donut (mês atual) */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* C2 — Gráfico de barras Receitas × Despesas (últimos 6 meses) */}
          <GlassCard className="border border-white/10 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-primary shrink-0" />
                <h2 className="text-sm font-semibold text-foreground/80">
                  Fluxo de Caixa — Últimos 6 meses
                </h2>
              </div>
              <Link to="/forecast">
                <Button variant="ghost" size="sm" className="text-xs text-primary gap-1 px-2">
                  Previsão <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
            <CashflowChart data={dreHistory} height={220} />
          </GlassCard>

          {/* Donut — despesas por categoria do período selecionado (mês ou ano inteiro) */}
          <GlassCard className="border border-white/10 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PieChartIcon className="size-4 text-primary shrink-0" />
                <h2 className="text-sm font-semibold text-foreground/80">
                  Despesas por categoria — {periodLabel(period)}
                </h2>
              </div>
              <Link
                to="/transactions"
                search={{ month: period.mode === "year" ? currentMonth() : period.month, page: 1 }}
              >
                <Button variant="ghost" size="sm" className="text-xs text-primary gap-1 px-2">
                  Detalhar <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
            <CategoryDonut data={breakdown} />
          </GlassCard>
        </div>

        {/* Contas + Orçamentos */}
        <div className="grid gap-6 md:grid-cols-2">
          <AccountsWidget accounts={summary?.accounts ?? []} />

          <GlassCard className="flex flex-col justify-between border border-white/10 p-5 sm:p-6">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
                <h2 className="text-sm font-semibold text-foreground/80">
                  Orçamentos — {formatMonthLabel(currentMonth())}
                </h2>
                <span className="text-xs font-medium text-primary">Top {topBudgets.length}</span>
              </div>

              <div className="space-y-4">
                {topBudgets.length === 0 ? (
                  <p className="py-6 text-center text-sm text-foreground/30">
                    Nenhum teto definido. Configure em Orçamentos.
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
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground/70 truncate max-w-[60%]">
                            {b.category_name ?? "Geral"}
                          </span>
                          <span className={`font-mono ${tone} shrink-0`}>
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

            <div className="mt-5 border-t border-white/5 pt-4">
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

        {/* Widget de faturas abertas (M3) */}
        {invoices.length > 0 && (
          <GlassCard className="border border-white/10 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                <CreditCard className="size-4 text-violet-400" />
                Faturas Abertas
              </h2>
              <Link to="/credit-cards">
                <Button variant="ghost" size="sm" className="text-xs text-primary gap-1 px-2">
                  Gerenciar <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {invoices.map((inv) => (
                <div
                  key={inv.invoice_id}
                  className={`rounded-xl border p-4 space-y-1 ${
                    inv.past_closing
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground/90 truncate">
                      {inv.account_name}
                    </span>
                    {inv.past_closing && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        Fechou
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-lg font-bold text-foreground/90">
                    {BRL(inv.total_amount)}
                  </p>
                  <p className="text-[11px] text-foreground/40">
                    Vence{" "}
                    {new Date(inv.due_date + "T12:00:00").toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Widget "Contas a Vencer" (Missão 7) — próximos 30 dias + atrasados */}
        {dueSoon.length > 0 && (
          <GlassCard className="border border-white/10 p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                <CalendarClock className="size-4 text-primary" />
                Contas a Vencer
              </h2>
              <Link to="/agendamentos">
                <Button variant="ghost" size="sm" className="gap-1 px-2 text-xs text-primary">
                  Ver todas <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {dueSoon.map((item) => {
                const overdue = item.next_run_on < todayScheduleIso;
                const isToday = item.next_run_on === todayScheduleIso;
                const [y, m, d] = item.next_run_on.split("-");
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                      overdue
                        ? "border-red-500/30 bg-red-500/5"
                        : isToday
                          ? "border-amber-500/30 bg-amber-500/5"
                          : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {overdue && <AlertTriangle className="size-3.5 shrink-0 text-red-400" />}
                        <span className="truncate text-sm font-medium text-foreground/90">
                          {item.description}
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground/40">
                        {overdue ? "Atrasado desde" : isToday ? "Vence hoje" : "Vence"} {d}/{m}/{y}
                        {" · "}
                        {item.account_name ?? "—"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-sm font-semibold ${
                        item.kind === "income" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {item.kind === "income" ? "+" : "−"}
                      {BRL(item.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}
      </div>
    </AppShell>
  );
}
