/**
 * Widget de Cartões de Crédito (faturas em aberto).
 * Badge pulsante amarelo quando a fatura já passou do dia de fechamento.
 */
import { CreditCard, AlertTriangle } from "lucide-react";
import { GlassCard, formatBRL } from "./primitives";
import type { OpenInvoiceDTO } from "@/services/dashboard.functions";
import { cn } from "@/lib/utils";

function formatBR(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function formatReferenceMonth(refMonth: string): string {
  const [y, m] = refMonth.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                  "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[Number(m) - 1] ?? ""}/${y.slice(2)}`;
}

export function CreditCardsWidget({ invoices }: { invoices: OpenInvoiceDTO[] }) {
  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="size-4 text-foreground/60" />
          <h2 className="text-sm font-semibold tracking-wide text-foreground">
            Cartões de Crédito
          </h2>
        </div>
        <span className="text-xs text-foreground/50">
          {invoices.length} fatura{invoices.length === 1 ? "" : "s"} em aberto
        </span>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-foreground/50">
          Nenhuma fatura em aberto.
        </div>
      ) : (
        <ul className="space-y-2">
          {invoices.map((inv) => (
            <li
              key={inv.invoice_id}
              className="group relative flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.06]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-indigo-500/20 text-violet-200">
                  <CreditCard className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {inv.account_name}
                    </span>
                    {inv.past_closing && (
                      <span
                        className={cn(
                          "relative inline-flex items-center gap-1 rounded-full",
                          "bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold",
                          "uppercase tracking-wider text-amber-300",
                          "ring-1 ring-amber-400/40",
                        )}
                        title="Fatura passou do dia de fechamento"
                      >
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
                        </span>
                        <AlertTriangle className="size-3" />
                        Atenção
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-foreground/50">
                    Ref. {formatReferenceMonth(inv.reference_month)} ·
                    {" "}fecha {formatBR(inv.closing_date)} ·
                    {" "}vence {formatBR(inv.due_date)}
                  </div>
                </div>
              </div>
              <div className="ml-3 text-right">
                <div className="text-sm font-semibold tabular-nums text-foreground">
                  {formatBRL(inv.total_amount)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-foreground/40">
                  Total parcial
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
