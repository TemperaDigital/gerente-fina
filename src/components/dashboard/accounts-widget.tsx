import { AlertTriangle, Building2, ShieldAlert, Wallet } from "lucide-react";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";

interface AccountsWidgetProps {
  accounts: any[];
}

export function AccountsWidget({ accounts }: AccountsWidgetProps) {
  // Filtra cartões de crédito para manter apenas contas e dinheiro
  const bankAccounts = accounts.filter((a) => a?.type !== "credit_card");

  if (bankAccounts.length === 0) {
    return (
      <GlassCard className="p-6 text-center text-sm text-foreground/50">
        Nenhuma conta bancária cadastrada no momento.
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <h2 className="text-lg font-medium text-foreground/90">
          Minhas Contas & Disponibilidade
        </h2>
        <span className="text-xs font-medium text-foreground/40">
          {bankAccounts.length} mapeadas
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {bankAccounts.map((account) => {
          // MAPEAMENTO BLINDADO: Resolve chaves dinamicamente independente do formato da API
          const name = account?.name || account?.account_name || "Conta Sem Nome";
          const type = account?.type || "bank";
          
          // Converte o saldo de forma segura para centavos para fazer a lógica matemática
          let balanceCents = 0;
          if (typeof account?.balance_cents === "number") {
            balanceCents = account.balance_cents;
          } else if (account?.balance !== undefined) {
            balanceCents = Math.round(Number(account.balance) * 100);
          }

          // Converte o limite de cheque especial
          let overdraftLimitCents = 0;
          if (typeof account?.overdraft_limit_cents === "number") {
            overdraftLimitCents = account.overdraft_limit_cents;
          } else if (account?.overdraft_limit !== undefined) {
            overdraftLimitCents = Math.round(Number(account.overdraft_limit) * 100);
          }

          const isNegative = balanceCents < 0;
          const usedOverdraft = isNegative ? Math.abs(balanceCents) : 0;
          
          const overdraftPercentage =
            overdraftLimitCents > 0
              ? Math.min(100, Math.round((usedOverdraft / overdraftLimitCents) * 100))
              : 0;

          const daysInOverdraft = account?.overdraft_since
            ? Math.floor((Date.now() - new Date(account.overdraft_since).getTime()) / (1000 * 60 * 60 * 24))
            : isNegative ? 1 : 0;

          return (
            <GlassCard
              key={account?.id || Math.random()}
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
                    {type === "bank" ? <Building2 className="size-4" /> : <Wallet className="size-4" />}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-foreground/50">
                      {type === "bank" ? "Conta Corrente" : "Dinheiro em Espécie"}
                    </div>
                  </div>
                </div>

                {/* Alerta de Cheque Especial */}
                {isNegative && overdraftLimitCents > 0 && (
                  <div className="flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
                    <AlertTriangle className="size-3 shrink-0" />
                    <span>{daysInOverdraft} {daysInOverdraft === 1 ? "dia" : "dias"} no limite</span>
                  </div>
                )}
              </div>

              {/* Saldo */}
              <div className="mt-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-foreground/50">
                  {isNegative ? "Saldo Devedor" : "Saldo Atual"}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-2xl font-bold tracking-tight font-mono",
                    isNegative ? "text-rose-400" : "text-emerald-400"
                  )}
                >
                  {/* formatBRL espera o valor decimal real, dividimos os centavos por 100 */}
                  {formatBRL(balanceCents / 100)}
                </div>
              </div>

              {/* Barra do Cheque Especial */}
              {overdraftLimitCents > 0 && (
                <div className="mt-4 border-t border-white/5 pt-3">
                  <div className="flex justify-between text-xs">
                    <span className="flex items-center gap-1 text-foreground/60">
                      <ShieldAlert className="size-3.5 text-amber-400" /> Limite: {formatBRL(overdraftLimitCents / 100)}
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

                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
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
