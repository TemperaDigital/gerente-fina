/**
 * Regra Constitucional #3 — Expurgo de Fluxos Neutros.
 *
 * Lançamentos do tipo `transfer` (transferência entre contas próprias) e
 * `invoice_payment` (pagamento de fatura de cartão) NUNCA podem ser somados
 * em totais de Receitas ou Despesas — eles apenas movimentam saldo entre
 * contas do mesmo patrimônio, sem gerar resultado contábil-gerencial.
 *
 * Função pura: receba uma lista de transações já tipadas e devolva apenas as
 * que devem entrar nos relatórios de resultado (DRE gerencial / dashboards).
 */

export type TransactionKind = "income" | "expense" | "transfer" | "invoice_payment";

export interface NeutralFilterable {
  kind: TransactionKind;
}

const NEUTRAL_KINDS: ReadonlySet<TransactionKind> = new Set([
  "transfer",
  "invoice_payment",
]);

export function isNeutral(kind: TransactionKind): boolean {
  return NEUTRAL_KINDS.has(kind);
}

export function excludeNeutrals<T extends NeutralFilterable>(transactions: readonly T[]): T[] {
  return transactions.filter((t) => !isNeutral(t.kind));
}
