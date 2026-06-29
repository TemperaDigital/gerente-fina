/**
 * Rota /dashboard — Tela inicial do Gerente Fina.
 *
 * Padrão TanStack: validateSearch (mês na URL) → loaderDeps → loader prima a
 * cache do Query Client → componente consome via useSuspenseQuery.
 *
 * Toda lógica de leitura vive nas server functions; este arquivo só
 * orquestra dados → UI. Visual: Dark Mode Premium / vidro fosco.
 */
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCcw,
  Banknote,
  Landmark,
  CreditCard,
} from "lucide-react";

const ACCOUNT_TYPE_META = {
  cash: { label: "Dinheiro", Icon: Banknote, color: "text-emerald-300" },
  bank: { label: "Conta Bancária", Icon: Landmark, color: "text-sky-300" },
  credit_card: { label: "Cartão de Crédito", Icon: CreditCard, color: "text-violet-300" },
} as const;

import {
  getDashboardSummary,
  getOpenCreditCardInvoices,
} from "@/services/dashboard.functions";
import {
  GlassCard,
  GooglePeriodPicker,
  KpiCard,
  KpiSkeleton,
  formatBRL,
} from "@/components/dashboard/primitives";
import { CreditCardsWidget } from "@/components/dashboard/credit-cards-widget";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Search params
// ---------------------------------------------------------------------------
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface DashboardSearch {
  month: string; // YYYY-MM
}

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------
const summaryQuery = (month: string) =>
  queryOptions({
    queryKey: ["dashboard", "summary", month],
    queryFn: () => getDashboardSummary({ data: { month } }),
  });

const invoicesQuery = () =>
  queryOptions({
    queryKey: ["dashboard", "open-invoices"],
    queryFn: () => getOpenCreditCardInvoices(),
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Gerente Fina" },
      {
        name: "description",
        content:
          "Visão consolidada de saldos, receitas, despesas e faturas de cartão.",
      },
    ],
  }),
  validateSearch: (raw): DashboardSearch => {
    const m =
      typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month)
        ? raw.month
        : currentMonth();
    return { month: m };
  },
  loaderDeps: ({ search: { month } }) => ({ month }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(summaryQuery(deps.month)),
      context.queryClient.ensureQueryData(invoicesQuery()),
    ]);
  },
  pendingComponent: DashboardPending,
  errorComponent: DashboardError,
  notFoundComponent: () => (
    <div className="p-10 text-center text-foreground/60">
      Dashboard indisponível.
    </div>
  ),
  component: DashboardPage,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function DashboardPage() {
  const { month } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();

  const { data: summary } = useSuspenseQuery(summaryQuery(month));
  const { data: invoices } = useSuspenseQuery(invoicesQuery());

  const setMonth = (next: string) =>
    navigate({ search: (prev: DashboardSearch) => ({ ...prev, month: next }) });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Visão consolidada do seu patrimônio e resultado mensal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <GooglePeriodPicker value={month} onChange={setMonth} />
            <Button
              size="icon"
              variant="ghost"
              className="size-9 rounded-full border border-white/10 bg-white/[0.04] text-foreground/70 hover:bg-white/10 hover:text-foreground"
              onClick={() => router.invalidate()}
              aria-label="Recarregar"
            >
              <RefreshCcw className="size-4" />
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Saldo Geral"
            amount={summary.consolidated_balance}
            hint="Soma de todas as contas (cash, banco e cartões)"
            icon={<Wallet className="size-4" />}
            tone={Number(summary.consolidated_balance) < 0 ? "negative" : "neutral"}
          />
          <KpiCard
            label="Receitas"
            amount={summary.income}
            hint="Entradas reais (sem transferências)"
            icon={<TrendingUp className="size-4" />}
            tone="positive"
          />
          <KpiCard
            label="Despesas"
            amount={summary.expense}
            hint="Saídas reais (sem pagamentos de fatura)"
            icon={<TrendingDown className="size-4" />}
            tone="negative"
          />
        </section>

        {/* Net result */}
        <div className="mt-4">
          <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="text-xs uppercase tracking-wider text-foreground/60">
                Resultado do mês
              </div>
              <div
                className={
                  summary.net_result.startsWith("-")
                    ? "mt-1 text-2xl font-semibold text-rose-400"
                    : "mt-1 text-2xl font-semibold text-emerald-400"
                }
              >
                {formatBRL(summary.net_result)}
              </div>
            </div>
            <div className="text-xs text-foreground/50">
              Receitas − Despesas, com expurgo de fluxos neutros.
            </div>
          </GlassCard>
        </div>

        {/* Layout 2 colunas: contas + cartões */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GlassCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-foreground">
                Contas
              </h2>
              <span className="text-xs text-foreground/50">
                {summary.accounts.length} ativa
                {summary.accounts.length === 1 ? "" : "s"}
              </span>
            </div>

            {summary.accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-foreground/50">
                Nenhuma conta cadastrada ainda.
              </div>
            ) : (
              <ul className="space-y-2">
                {summary.accounts.map((a) => (
                  <li
                    key={a.account_id}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {a.account_name}
                      </div>
                      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-foreground/50">
                        {a.account_type === "cash"
                          ? "Dinheiro"
                          : a.account_type === "bank"
                          ? "Conta Bancária"
                          : "Cartão de Crédito"}
                      </div>
                    </div>
                    <div
                      className={
                        a.balance.startsWith("-")
                          ? "text-sm font-semibold tabular-nums text-rose-400"
                          : "text-sm font-semibold tabular-nums text-foreground"
                      }
                    >
                      {formatBRL(a.balance)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <CreditCardsWidget invoices={invoices} />
        </section>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Pending & Error
// ---------------------------------------------------------------------------
function DashboardPending() {
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <Skeleton className="h-9 w-48 bg-white/10" />
        <Skeleton className="mt-2 h-4 w-72 bg-white/10" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
      </div>
    </div>
  );
}

function DashboardError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <GlassCard className="max-w-md p-6 text-center">
        <h2 className="text-lg font-semibold text-foreground">
          Não foi possível carregar o Dashboard
        </h2>
        <p className="mt-2 text-sm text-foreground/60">{error.message}</p>
        <Button
          className="mt-4"
          onClick={() => router.invalidate()}
          variant="secondary"
        >
          Tentar novamente
        </Button>
      </GlassCard>
    </div>
  );
}
