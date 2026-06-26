/**
 * Rota /installments — Parcelamentos, Financiamentos e Consórcios.
 * Cores: roxo (parcelas), azul (financiamentos), âmbar (consórcios).
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Layers, Banknote, Sparkles, Trophy } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  listInstallmentPurchases,
  listLoans,
  type LoanDTO,
} from "@/services/installments.functions";
import { cn } from "@/lib/utils";

const purchasesQ = () =>
  queryOptions({
    queryKey: ["installments", "purchases"],
    queryFn: () => listInstallmentPurchases(),
  });
const loansQ = () =>
  queryOptions({ queryKey: ["installments", "loans"], queryFn: () => listLoans() });

export const Route = createFileRoute("/installments")({
  head: () => ({ meta: [{ title: "Parcelas & Dívidas — Gerente Fina" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(purchasesQ()),
      context.queryClient.ensureQueryData(loansQ()),
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
  component: InstallmentsPage,
});

function InstallmentsPage() {
  const { data: purchases } = useSuspenseQuery(purchasesQ());
  const { data: loans } = useSuspenseQuery(loansQ());

  const financings = loans.filter((l) => l.kind === "financing");
  const consortiums = loans.filter((l) => l.kind === "consortium");
  const personals = loans.filter((l) => l.kind === "personal");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Parcelas & Dívidas
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Compras parceladas correntes, financiamentos ativos e consórcios.
          </p>
        </header>

        <section className="mb-8">
          <SectionHeader
            icon={<Layers className="size-4" />}
            title="Compras parceladas"
            count={purchases.length}
            tone="violet"
          />
          {purchases.length === 0 ? (
            <Empty text="Nenhuma compra parcelada ativa." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {purchases.map((p) => {
                const percent =
                  p.installments_count > 0
                    ? Math.round((p.paid_count / p.installments_count) * 100)
                    : 0;
                return (
                  <GlassCard key={p.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {p.description}
                        </div>
                        <div className="mt-0.5 text-[11px] text-foreground/50">
                          {p.account_name ?? "—"}
                        </div>
                      </div>
                      <Badge className="bg-violet-500/20 text-violet-300 hover:bg-violet-500/20">
                        {p.paid_count}/{p.installments_count}
                      </Badge>
                    </div>
                    <Progress
                      value={percent}
                      className="mt-3 h-1.5 bg-white/10 [&>div]:bg-violet-400"
                    />
                    <div className="mt-3 flex items-end justify-between text-xs">
                      <span className="text-foreground/50">Restam</span>
                      <span className="text-sm font-semibold tabular-nums text-rose-300">
                        {formatBRL(p.remaining_amount)}
                      </span>
                    </div>
                    {p.next_due_date && (
                      <div className="mt-1 text-[11px] text-foreground/50">
                        Próx. vencimento: {p.next_due_date}
                      </div>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-8">
          <SectionHeader
            icon={<Banknote className="size-4" />}
            title="Financiamentos"
            count={financings.length}
            tone="sky"
          />
          <LoansGrid loans={financings} accent="sky" />
        </section>

        <section className="mb-8">
          <SectionHeader
            icon={<Trophy className="size-4" />}
            title="Consórcios"
            count={consortiums.length}
            tone="amber"
          />
          <LoansGrid loans={consortiums} accent="amber" showContemplation />
        </section>

        {personals.length > 0 && (
          <section className="mb-8">
            <SectionHeader
              icon={<Sparkles className="size-4" />}
              title="Empréstimos pessoais"
              count={personals.length}
              tone="rose"
            />
            <LoansGrid loans={personals} accent="rose" />
          </section>
        )}
      </div>
    </AppShell>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone: "violet" | "sky" | "amber" | "rose";
}) {
  const toneClass = {
    violet: "text-violet-300",
    sky: "text-sky-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  }[tone];
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={cn("flex items-center gap-2", toneClass)}>
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
      </span>
      <span className="text-xs text-foreground/40">({count})</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <GlassCard className="p-8 text-center text-sm text-foreground/50">
      {text}
    </GlassCard>
  );
}

function LoansGrid({
  loans,
  accent,
  showContemplation,
}: {
  loans: LoanDTO[];
  accent: "sky" | "amber" | "rose";
  showContemplation?: boolean;
}) {
  if (loans.length === 0) return <Empty text="Nenhum registro." />;
  const bar = {
    sky: "[&>div]:bg-sky-400",
    amber: "[&>div]:bg-amber-400",
    rose: "[&>div]:bg-rose-400",
  }[accent];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {loans.map((l) => {
        const percent =
          l.installments_count > 0
            ? Math.round((l.installments_paid / l.installments_count) * 100)
            : 0;
        return (
          <GlassCard key={l.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{l.description}</div>
                <div className="mt-0.5 text-[11px] text-foreground/50">
                  {l.account_name ?? "—"} · venc. dia {l.monthly_due_day}
                </div>
              </div>
              {showContemplation && (
                <Badge
                  className={cn(
                    l.is_contemplated
                      ? "bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25"
                      : "bg-zinc-500/20 text-zinc-300 hover:bg-zinc-500/20",
                  )}
                >
                  {l.is_contemplated ? "Contemplado" : "Aguardando"}
                </Badge>
              )}
            </div>
            <div className="mt-3 text-lg font-semibold tabular-nums">
              {formatBRL(l.principal_amount)}
            </div>
            <Progress value={percent} className={cn("mt-2 h-1.5 bg-white/10", bar)} />
            <div className="mt-2 flex items-center justify-between text-[11px] text-foreground/50">
              <span>
                {l.installments_paid}/{l.installments_count} parcelas
              </span>
              <span>{l.status}</span>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
