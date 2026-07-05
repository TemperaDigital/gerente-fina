/**
 * Aritmética pura do card "Saldo do Mês" (Missão 16, correção final).
 * Extraída de getCashBasisSummary (dashboard.functions.ts) para permitir
 * testar a propriedade de sanidade sem depender do banco.
 */
export interface MonthlyBalanceInput {
  incomeCents: bigint;
  fixedExpenseCents: bigint;
  variableExpenseCents: bigint;
  invoicePaymentCents: bigint;
  /** Agendamentos (recurrences) pendentes do período — sempre >= 0. */
  scheduledPendingCents: bigint;
}

/**
 * Saldo do Mês = Receitas − Custo Fixo − Custo Variável − Fatura de Cartões
 * (paga) − Agendamentos pendentes. Como scheduledPendingCents nunca é
 * negativo (constraint `amount > 0` em recurrences), subtraí-lo só pode
 * manter ou piorar o resultado — nunca torná-lo mais positivo do que já
 * seria sem os agendamentos.
 */
export function computeMonthlyBalance(input: MonthlyBalanceInput): bigint {
  return (
    input.incomeCents -
    input.fixedExpenseCents -
    input.variableExpenseCents -
    input.invoicePaymentCents -
    input.scheduledPendingCents
  );
}
