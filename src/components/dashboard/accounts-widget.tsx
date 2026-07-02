import { AlertTriangle, Building2, ShieldAlert, Wallet } from "lucide-react";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";

// Tipo representando a conta vinda do banco de dados
export interface DashboardAccountDTO {
  id: string;
  name: string;
  type: "bank" | "wallet" | "credit_card";
  balance_cents: number;
  overdraft_limit_cents?: number;
  // Se o banco retornar a data em que entrou no negativo (ISO string)
  overdraft_since?: string | null;
}

interface AccountsWidgetProps {
  accounts: DashboardAccountDTO[];
}

export function AccountsWidget({ accounts }: AccountsWidgetProps) {
  // Filtramos apenas contas bancárias e carteiras (cartões de crédito têm lógica própria)
  const bankAccounts = accounts.filter((a) => a.type !== "credit_card");

  if (bankAccounts.length === 0) {
    return (
      <GlassCard className="p-6 text-center text-sm text-foreground/50">
        Nenhuma conta bancária cadastrada no momento.
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/70">
        Minhas Contas & Disponibilidade
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {bankAccounts.map((account) => {
          const balance = account.balance_cents;
          const overdraftLimit = account.overdraft_limit_cents || 0;
          const isNegative = balance < 0;

          // Cálculos do Cheque Especial
          const usedOverdraft = isNegative ? Math.abs(balance) : 0;
          const overdraftPercentage =
            overdraftLimit > 0 ? Math.min(100, Math.round((usedOverdraft / overdraftLimit) * 100)) : 0;

          // Cálculo aproximado de dias no vermelho (se houver a data de início)
          const daysInOverdraft = account.overdraft_since
            ? Math.floor((Date.now() - new Date(account.overdraft_since).getTime()) / (1000 * 60 * 60 * 24))
            : isNegative ? 1 : 0; // Fallback: se está negativo hoje, mínimo de 1 dia

          return (
            <GlassCard
              key={account.id}
              className={cn(
                "relative overflow-hidden p-5 transition-all hover:border-white/20",
                isNegative ? "border-rose-500/30 bg-rose-950/10" : "border-white/10"
              )}
            >
              {/* Cabeçalho do Card */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "grid size-9 place-items-center rounded-xl border",
                      isNegative
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                        : "border-white/10 bg-white/[0.04] text-foreground/80"
                    )}
                  >
                    {account.type === "bank" ? <Building2 className="size-4" /> : <Wallet className="size-4" />}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{account.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-foreground/50">
                      {account.type === "bank" ? "Conta Corrente" : "Carteira"}
                    </div>
                  </div>
                </div>

                {/* Badge de Alerta de Cheque Especial */}
                {isNegative && (
                  <div className="flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
                    <AlertTriangle className="size-3 shrink-0" />
                    <span>{daysInOverdraft} {daysInOverdraft === 1 ? "dia" : "dias"} no limite</span>
                  </div>
                )}
              </div>

              {/* Saldo Principal */}
              <div className="mt-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-foreground/50">
                  {isNegative ? "Saldo Devedor" : "Saldo Atual"}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-2xl font-bold tracking-tight",
                    isNegative ? "text-rose-400" : "text-emerald-400"
                  )}
                >
                  {formatBRL(balance)}
                </div>
              </div>

              {/* Barra de Utilização do Cheque Especial */}
              {overdraftLimit > 0 && (
                <div className="mt-4 border-t border-white/5 pt-3">
                  <div className="flex justify-between text-xs">
                    <span className="flex items-center gap-1 text-foreground/60">
                      <ShieldAlert className="size-3.5 text-amber-400" /> Limite: {formatBRL(overdraftLimit)}
                    </span>
                    <span
                      className={cn(
                        "font-semibold",
                        overdraftPercentage > 85
                          ? "text-rose-400"
                          : overdraftPercentage > 50
                          ? "text-amber-400"
                          : "text-foreground/80"
                      )}
                    >
                      {isNegative ? `${overdraftPercentage}% em uso` : "100% livre"}
                    </span>
                  </div>

                  {/* Componente visual da barra */}
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        overdraftPercentage > 85
                          ? "bg-rose-500"
                          : overdraftPercentage > 50
                          ? "bg-amber-500"
                          : "bg-sky-500"
                      )}
                      style={{ width: `${isNegative ? overdraftPercentage : 0}%` }}
                    />
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