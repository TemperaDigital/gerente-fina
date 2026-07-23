/**
 * ExpenseBreakdownDialog — modal detalhando o KPI "Despesas (caixa)" ao
 * clicar no card "Despesas" do Dashboard.
 *
 * Três seções com barras HORIZONTAIS (não donut — layout de lista com
 * progress bar por item, escalado pelo maior valor daquele bloco):
 *   1. Fatura de cartões (por cartão que teve pagamento no período)
 *   2. Custos fixos (categorias nature='FIXA')
 *   3. Custos variáveis (nature='VARIÁVEL' ou nula, mesma convenção do
 *      card "Saldo do Mês")
 *
 * Cada item é um drill-down clicável — leva para /transactions já filtrado
 * por mês + conta (fatura) ou mês + categoria + kind='expense' (fixa/var).
 * Em modo anual, os itens não são clicáveis (a tela de Lançamentos filtra
 * por mês, não por ano) — o usuário fecha o modal e navega manualmente.
 *
 * Rodapé mostra Total e — se por alguma razão a soma dos três blocos
 * divergir do KPI "Despesas (caixa)" — exibe um aviso vermelho pequeno
 * com a diferença em centavos. Esse é o teste de sanidade visual.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, CreditCard, PinIcon, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/categories/icon-picker";
import {
  getExpenseBreakdown,
  type ExpenseBreakdownDTO,
} from "@/services/dashboard.functions";
import { periodLabel, type DashboardPeriod } from "@/components/dashboard/primitives";
import { toCents, fromCents, safePercent } from "@/lib/finance/money";
import {
  buildExpenseDrilldownSearch,
  type BreakdownItemKind,
} from "@/lib/finance/expense-breakdown";

const BRL = (v: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(fromCents(toCents(v))),
  );

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: DashboardPeriod;
  /** expense_cash do KPI principal — usado para exibir aviso de divergência. */
  expectedTotal: string;
}

function periodKey(p: DashboardPeriod): string {
  return p.mode === "year" ? String(p.year) : p.month;
}

export function ExpenseBreakdownDialog({ open, onOpenChange, period, expectedTotal }: Props) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", "expense-breakdown", periodKey(period)],
    queryFn: () =>
      getExpenseBreakdown({
        data: period.mode === "year" ? { year: period.year } : { month: period.month },
      }),
    enabled: open,
  });

  const divergenceCents = useMemo(() => {
    if (!data) return 0n;
    return toCents(data.totals.total) - toCents(expectedTotal);
  }, [data, expectedTotal]);

  const buildSearch = (kind: BreakdownItemKind, id: string) =>
    buildExpenseDrilldownSearch(period, { kind, id });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 bg-zinc-950/95 text-foreground backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4 text-red-400" />
            Detalhamento de Despesas — {periodLabel(period)}
          </DialogTitle>
          <DialogDescription className="text-xs text-foreground/50">
            Regime de caixa. Só o que efetivamente saiu de contas bank/cash no período.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <LoadingSections />}

        {isError && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            Não foi possível carregar o detalhamento: {(error as Error)?.message ?? "erro desconhecido"}
          </p>
        )}

        {data && !isLoading && (
          <div className="space-y-5">
            <Section
              title="Fatura de cartões"
              icon={<CreditCard className="size-3.5 text-violet-300" />}
              subtotal={data.totals.invoice}
              items={data.invoice_payments.map((i) => ({
                key: i.account_id,
                name: i.account_name,
                amount: i.amount,
                icon: null,
                color: "#a78bfa",
                linkSearch: buildSearch("invoice_payment", i.account_id) as TxLinkSearch | null,
              }))}
              accent="from-violet-500/60 to-violet-500/10"
              emptyIcon={<CreditCard className="size-8 opacity-30" aria-hidden />}
              emptyLabel="Nenhum pagamento de fatura neste período."
              onNavigate={() => onOpenChange(false)}
            />

            <Section
              title="Custos fixos"
              icon={<PinIcon className="size-3.5 text-rose-300" />}
              subtotal={data.totals.fixed}
              items={data.fixed.map((c) => ({
                key: c.category_id,
                name: c.category_name,
                amount: c.amount,
                icon: c.icon,
                color: c.color ?? "#f87171",
                linkSearch: buildSearch("fixed", c.category_id) as TxLinkSearch | null,
              }))}
              accent="from-rose-500/60 to-rose-500/10"
              emptyIcon={<PinIcon className="size-8 opacity-30" aria-hidden />}
              emptyLabel="Nenhuma despesa fixa neste período."
              onNavigate={() => onOpenChange(false)}
            />

            <Section
              title="Custos variáveis"
              icon={<Zap className="size-3.5 text-amber-300" />}
              subtotal={data.totals.variable}
              items={data.variable.map((c) => ({
                key: c.category_id,
                name: c.category_name,
                amount: c.amount,
                icon: c.icon,
                color: c.color ?? "#fbbf24",
                linkSearch: buildSearch("variable", c.category_id) as TxLinkSearch | null,
              }))}
              accent="from-amber-500/60 to-amber-500/10"
              emptyIcon={<Zap className="size-8 opacity-30" aria-hidden />}
              emptyLabel="Nenhuma despesa variável neste período."
              onNavigate={() => onOpenChange(false)}
            />


            <div className="flex items-center justify-between border-t border-white/10 pt-4">
              <span className="text-xs uppercase tracking-wide text-foreground/50">
                Total dos três blocos
              </span>
              <span className="font-mono text-lg font-bold text-red-300">
                {BRL(data.totals.total)}
              </span>
            </div>

            {divergenceCents !== 0n && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                <AlertTriangle className="size-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    Divergência de {BRL(fromCents(divergenceCents > 0n ? divergenceCents : -divergenceCents))}
                  </p>
                  <p className="text-red-300/80">
                    A soma detalhada ({BRL(data.totals.total)}) não bateu com o KPI
                    "Despesas" ({BRL(expectedTotal)}). Isso não deveria acontecer — abra
                    um ticket com o período selecionado.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Loading state — três seções esqueléticas para dar a mesma silhueta do
// conteúdo real, evitando "flash de vazio" enquanto a query resolve.
// ---------------------------------------------------------------------------
function LoadingSections() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      {[0, 1, 2].map((s) => (
        <div key={s} className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-32 bg-white/10" />
            <Skeleton className="h-4 w-20 bg-white/10" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-9 w-full rounded-lg bg-white/5" />
            <Skeleton className="h-9 w-4/5 rounded-lg bg-white/5" />
            <Skeleton className="h-9 w-2/3 rounded-lg bg-white/5" />
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando detalhamento de despesas…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloco com barras horizontais — layout compartilhado pelas 3 seções.
// ---------------------------------------------------------------------------

type TxLinkSearch =
  | { month: string; page: number; account_id: string; kind: "invoice_payment" }
  | { month: string; page: number; category_id: string; kind: "expense" };

interface SectionItem {
  key: string;
  name: string;
  amount: string;
  icon: string | null;
  color: string;
  linkSearch: TxLinkSearch | null;
}

function Section({
  title,
  icon,
  subtotal,
  items,
  accent,
  emptyIcon,
  emptyLabel,
  onNavigate,
}: {
  title: string;
  icon: React.ReactNode;
  subtotal: string;
  items: SectionItem[];
  accent: string;
  emptyIcon: React.ReactNode;
  emptyLabel: string;
  onNavigate: () => void;
}) {
  const maxAmount = items.reduce((acc, i) => {
    const cents = toCents(i.amount);
    return cents > acc ? cents : acc;
  }, 0n);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/60">
          {icon}
          {title}
        </div>
        <span className="font-mono text-sm font-semibold text-foreground/80">
          {BRL(subtotal)}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-6 text-center text-sm text-foreground/50">
          {emptyIcon}
          <span>{emptyLabel}</span>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const pct =
              maxAmount === 0n
                ? 0
                : safePercent(item.amount, fromCents(maxAmount));

            const inner = (
              <>
                <div
                  aria-hidden
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${accent}`}
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {item.icon ? (
                      <CategoryIcon icon={item.icon} className="size-4 shrink-0" />
                    ) : (
                      <span
                        aria-hidden
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                    )}
                    <span className="truncate text-sm text-foreground/90">{item.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground/90">
                      {BRL(item.amount)}
                    </span>
                    {item.linkSearch && (
                      <ChevronRight className="size-4 text-foreground/40" aria-hidden />
                    )}
                  </div>
                </div>
              </>
            );

            const baseClass =
              "relative block overflow-hidden rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2";

            return (
              <li key={item.key}>
                {item.linkSearch ? (
                  <Link
                    to="/transactions"
                    search={item.linkSearch}
                    onClick={onNavigate}
                    aria-label={`Ver lançamentos de ${item.name} — ${BRL(item.amount)}`}
                    className={`${baseClass} transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={baseClass}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Reexport para conveniência de tipagem externa. */
export type { ExpenseBreakdownDTO };
