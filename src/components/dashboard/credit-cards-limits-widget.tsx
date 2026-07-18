/**
 * Bloco 2 — Cartões de Crédito com barra de limite e fatura em aberto.
 * Missão 19.
 */
import { CreditCard } from "lucide-react";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import type { CreditCardPanelDTO } from "@/services/dashboard.functions";

function formatBR(date: string | null): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function CreditCardsLimitsWidget({ cards }: { cards: CreditCardPanelDTO[] }) {
  if (cards.length === 0) {
    return (
      <GlassCard className="p-6 text-center text-sm text-foreground/50">
        Nenhum cartão de crédito cadastrado.
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <h2 className="text-lg font-medium text-foreground/90">Cartões de Crédito</h2>
        <span className="text-xs font-medium text-foreground/40">
          {cards.length} {cards.length === 1 ? "cartão" : "cartões"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((c) => {
          const limit = c.credit_limit_cents ?? 0;
          const used = c.used_cents;
          const available = Math.max(0, limit - used);
          const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          const tone =
            pct >= 90
              ? "bg-rose-500"
              : pct >= 70
                ? "bg-amber-500"
                : "bg-emerald-500";
          const textTone =
            pct >= 90 ? "text-rose-400" : pct >= 70 ? "text-amber-400" : "text-emerald-400";

          return (
            <GlassCard
              key={c.account_id}
              className="relative overflow-hidden border border-white/10 p-5 transition-all hover:border-white/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300">
                    <CreditCard className="size-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{c.account_name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-foreground/50">
                      Fecha dia {c.closing_day ?? "—"} · Vence dia {c.due_day ?? "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fatura aberta */}
              <div className="mt-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-foreground/50">
                  Fatura em aberto
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                    {formatBRL((c.open_invoice_cents / 100).toFixed(2))}
                  </span>
                  {c.open_invoice_due_date && (
                    <span className="text-xs text-foreground/40">
                      vence {formatBR(c.open_invoice_due_date)}
                    </span>
                  )}
                </div>
              </div>

              {/* Barra de limite */}
              {limit > 0 && (
                <div className="mt-4 border-t border-white/5 pt-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground/60">
                      Utilizado {formatBRL((used / 100).toFixed(2))}
                    </span>
                    <span className={cn("font-semibold", textTone)}>{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={cn("h-full transition-all duration-500", tone)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-foreground/40">
                    <span>Limite {formatBRL((limit / 100).toFixed(2))}</span>
                    <span>Disponível {formatBRL((available / 100).toFixed(2))}</span>
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
