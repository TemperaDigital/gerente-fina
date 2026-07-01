/**
 * Rota /installments — Parcelamentos, Empréstimos, Financiamentos e Consórcios.
 * Consome server functions com Admin Client (seed user), sem dependência de auth do browser.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, CreditCard, Wallet, Landmark, Trophy } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GlassCard } from "@/components/dashboard/primitives";
import { Progress } from "@/components/ui/progress";
import {
  listInstallmentPurchases,
  listLoans,
  type InstallmentPurchaseDTO,
  type LoanDTO,
} from "@/services/installments.functions";
import { fromCents, toCents, safePercent } from "@/lib/finance/money";

const formatBRL = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0) || 0,
  );

const formatDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

function installmentsQO(fn: () => Promise<InstallmentPurchaseDTO[]>) {
  return queryOptions({
    queryKey: ["installments", "purchases"],
    queryFn: fn,
  });
}
function loansQO(fn: () => Promise<LoanDTO[]>) {
  return queryOptions({ queryKey: ["installments", "loans"], queryFn: fn });
}

export const Route = createFileRoute("/installments")({
  head: () => ({ meta: [{ title: "Parcelamentos & Dívidas — Gerente Fina" }] }),
  component: InstallmentsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <GlassCard className="p-6 text-sm text-red-300">
          Erro ao carregar parcelamentos: {error.message}
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

const KIND_META: Record<
  LoanDTO["kind"],
  { label: string; tone: string; icon: typeof Wallet }
> = {
  personal: { label: "Empréstimos", tone: "text-red-300", icon: Wallet },
  financing: { label: "Financiamentos", tone: "text-sky-300", icon: Landmark },
  consortium: { label: "Consórcios", tone: "text-emerald-300", icon: Trophy },
};

function InstallmentsPage() {
  const fetchPurchases = useServerFn(listInstallmentPurchases);
  const fetchLoans = useServerFn(listLoans);
  const { data: purchases } = useSuspenseQuery(installmentsQO(fetchPurchases));
  const { data: loans } = useSuspenseQuery(loansQO(fetchLoans));

  const monthlyTotalCents = [
    ...purchases.map((p) => {
      const remaining = toCents(p.remaining_amount);
      const left = Math.max(p.installments_count - p.paid_count, 1);
      return remaining / BigInt(left);
    }),
    ...loans.map((l) => {
      const principal = toCents(l.principal_amount);
      return principal / BigInt(Math.max(l.installments_count, 1));
    }),
  ].reduce((acc, v) => acc + v, 0n);

  const loansByKind = (kind: LoanDTO["kind"]) =>
    loans.filter((l) => l.kind === kind);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Parcelamentos & Dívidas
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Compras parceladas, empréstimos, financiamentos e consórcios.
          </p>
        </header>

        <GlassCard className="mb-6 border border-white/10 p-5">
          <p className="text-xs uppercase tracking-wider text-foreground/50">
            Compromisso mensal consolidado (estimado)
          </p>
          <p className="mt-2 font-mono text-3xl font-semibold text-primary">
            {formatBRL(fromCents(monthlyTotalCents))}
          </p>
        </GlassCard>

        {/* Parcelamentos */}
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-orange-300">
            <CreditCard className="size-4" /> Parcelamentos no cartão
          </h2>
          {purchases.length === 0 ? (
            <GlassCard className="p-8 text-center text-sm text-foreground/60">
              Nenhuma compra parcelada cadastrada.
            </GlassCard>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {purchases.map((p) => {
                const pct = safePercent(p.paid_count, p.installments_count);
                return (
                  <GlassCard
                    key={p.id}
                    className="border border-white/10 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{p.description}</p>
                        <p className="text-xs text-foreground/50">
                          {p.category_name ?? "Sem categoria"} ·{" "}
                          {p.account_name ?? "Sem conta"}
                        </p>
                      </div>
                      <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-300">
                        {p.paid_count}/{p.installments_count}
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="font-mono text-lg">
                        {formatBRL(p.total_amount)}
                      </span>
                      <span className="text-xs text-foreground/50">
                        falta {formatBRL(p.remaining_amount)}
                      </span>
                    </div>
                    <Progress value={Math.round(pct)} className="mt-2 h-2" />
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground/60">
                      <Calendar className="size-3.5" />
                      Próx.: {formatDate(p.next_due_date)}
                    </p>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </section>

        {/* Loans por tipo */}
        {(Object.keys(KIND_META) as LoanDTO["kind"][]).map((kind) => {
          const meta = KIND_META[kind];
          const list = loansByKind(kind);
          const Icon = meta.icon;
          return (
            <section key={kind} className="mb-8">
              <h2
                className={`mb-3 flex items-center gap-2 text-sm font-medium ${meta.tone}`}
              >
                <Icon className="size-4" /> {meta.label}
              </h2>
              {list.length === 0 ? (
                <GlassCard className="p-6 text-center text-sm text-foreground/50">
                  Nenhum registro.
                </GlassCard>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((l) => {
                    const pct = safePercent(
                      l.installments_paid,
                      l.installments_count,
                    );
                    return (
                      <GlassCard
                        key={l.id}
                        className="border border-white/10 p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{l.description}</p>
                            <p className="text-xs text-foreground/50">
                              {l.account_name ?? "Sem conta"} · vence dia{" "}
                              {l.monthly_due_day}
                            </p>
                          </div>
                          {kind === "consortium" && l.is_contemplated && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                              Contemplado
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex items-baseline justify-between">
                          <span className="font-mono text-lg">
                            {formatBRL(l.principal_amount)}
                          </span>
                          <span className="text-xs text-foreground/50">
                            {l.installments_paid}/{l.installments_count}
                          </span>
                        </div>
                        <Progress
                          value={Math.round(pct)}
                          className="mt-2 h-2"
                        />
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
