/**
 * Bloco 3 — Faturas agrupadas por cartão: Futuras · Pagas · Vencidas.
 * Missão 19. Faturas vencidas ganham destaque pulsante vermelho.
 */
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard } from "lucide-react";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import type { CreditCardPanelDTO, PanelInvoiceDTO } from "@/services/dashboard.functions";

function formatBR(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function formatRef(refMonth: string): string {
  const [y, m] = refMonth.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[Number(m) - 1] ?? ""}/${y.slice(2)}`;
}

interface BucketProps {
  title: string;
  icon: React.ReactNode;
  invoices: PanelInvoiceDTO[];
  emptyLabel: string;
  variant: "future" | "paid" | "overdue";
}

function Bucket({ title, icon, invoices, emptyLabel, variant }: BucketProps) {
  const isOverdue = variant === "overdue";
  const titleTone =
    variant === "overdue"
      ? "text-rose-300"
      : variant === "paid"
        ? "text-emerald-300"
        : "text-sky-300";

  return (
    <div className="space-y-2">
      <div className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", titleTone)}>
        {icon}
        {title}
        <span className="ml-auto text-[10px] font-medium text-foreground/40">
          {invoices.length}
        </span>
      </div>
      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/5 px-3 py-3 text-center text-[11px] text-foreground/40">
          {emptyLabel}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {invoices.map((inv) => (
            <li
              key={inv.invoice_id}
              className={cn(
                "relative flex items-center justify-between rounded-lg border px-3 py-2 text-xs",
                variant === "overdue"
                  ? "border-rose-500/40 bg-rose-500/10"
                  : variant === "paid"
                    ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                    : "border-white/10 bg-white/[0.03]",
              )}
            >
              {isOverdue && (
                <span className="absolute -left-0.5 top-1/2 flex size-2 -translate-y-1/2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-rose-400" />
                </span>
              )}
              <div className="min-w-0 pl-1.5">
                <div className="font-medium text-foreground/90">Ref. {formatRef(inv.reference_month)}</div>
                <div className="text-[10px] text-foreground/40">
                  {variant === "paid" ? "Pago" : "Vence"} {formatBR(inv.due_date)}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 font-mono font-semibold tabular-nums",
                  variant === "overdue" ? "text-rose-300" : "text-foreground/90",
                )}
              >
                {formatBRL((inv.total_amount_cents / 100).toFixed(2))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InvoicesGroupedWidget({ cards }: { cards: CreditCardPanelDTO[] }) {
  const withAny = cards.filter((c) => c.invoices.length > 0);
  if (withAny.length === 0) {
    return (
      <GlassCard className="p-6 text-center text-sm text-foreground/50">
        Nenhuma fatura registrada nos últimos 12 meses.
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <h2 className="text-lg font-medium text-foreground/90">Faturas por Cartão</h2>
        <span className="text-xs font-medium text-foreground/40">
          Últimos 12 meses
        </span>
      </div>

      <div className="space-y-4">
        {withAny.map((c) => {
          const future = c.invoices.filter((i) => i.bucket === "future");
          const paid = c.invoices.filter((i) => i.bucket === "paid").slice(-6).reverse();
          const overdue = c.invoices.filter((i) => i.bucket === "overdue");

          return (
            <GlassCard key={c.account_id} className="border border-white/10 p-5">
              <div className="mb-4 flex items-center gap-2.5 border-b border-white/5 pb-3">
                <div className="grid size-8 place-items-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-300">
                  <CreditCard className="size-4" />
                </div>
                <span className="font-semibold text-foreground">{c.account_name}</span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Bucket
                  title="Futuras"
                  icon={<CalendarClock className="size-3.5" />}
                  invoices={future}
                  emptyLabel="Sem faturas futuras"
                  variant="future"
                />
                <Bucket
                  title="Vencidas"
                  icon={<AlertTriangle className="size-3.5" />}
                  invoices={overdue}
                  emptyLabel="Nenhuma vencida"
                  variant="overdue"
                />
                <Bucket
                  title="Pagas"
                  icon={<CheckCircle2 className="size-3.5" />}
                  invoices={paid}
                  emptyLabel="Nenhuma paga ainda"
                  variant="paid"
                />
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
