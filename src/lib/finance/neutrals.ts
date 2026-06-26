/**
 * Regra Constitucional §3 — Expurgo de Fluxos Neutros.
 *
 * `transfer` e `invoice_payment` NUNCA entram em totais de Receita/Despesa —
 * apenas movimentam patrimônio entre contas próprias.
 *
 * Toda agregação de valores opera em STRINGS (`numeric(14,2)` vem do
 * PostgREST como string) convertidas para inteiros em centavos. Zero uso de
 * `Number()` ou `parseFloat` no pipeline contábil — protege contra erros de
 * ponto flutuante (clássico `0.1 + 0.2 !== 0.3`).
 */

export type TransactionKind = "income" | "expense" | "transfer" | "invoice_payment";
export type TransactionType = "debit" | "credit";

export interface NeutralFilterable {
  kind: TransactionKind;
}

export interface AggregableTransaction extends NeutralFilterable {
  amount: string; // numeric(14,2) como string
  type: TransactionType;
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

export function splitByKind<T extends NeutralFilterable>(
  transactions: readonly T[],
): { real: T[]; neutral: T[] } {
  const real: T[] = [];
  const neutral: T[] = [];
  for (const t of transactions) (isNeutral(t.kind) ? neutral : real).push(t);
  return { real, neutral };
}

// ---------------------------------------------------------------------------
// Aritmética decimal por strings → inteiros em centavos
// ---------------------------------------------------------------------------

/** `"123.4"` → `12340n`; `"123"` → `12300n`. Lança em entrada inválida. */
export function amountToCents(amount: string): bigint {
  const s = amount.trim().replace(/^\+/, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`amount inválido: "${amount}"`);
  }
  const negative = s.startsWith("-");
  const unsigned = negative ? s.slice(1) : s;
  const [intPart, fracRaw = ""] = unsigned.split(".");
  const frac = (fracRaw + "00").slice(0, 2);
  const cents = BigInt(intPart) * 100n + BigInt(frac);
  return negative ? -cents : cents;
}

/** `12340n` → `"123.40"`. Preserva sinal e 2 casas. */
export function centsToAmount(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const intPart = abs / 100n;
  const fracPart = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${intPart.toString()}.${fracPart}`;
}

/**
 * Soma de Receitas e Despesas com expurgo automático de fluxos neutros.
 * Sinal: `credit` soma, `debit` subtrai. Devolve strings `numeric(14,2)`.
 */
export function sumIncomeExpense<T extends AggregableTransaction>(
  transactions: readonly T[],
): { income: string; expense: string; net: string } {
  let income = 0n;
  let expense = 0n;
  for (const t of transactions) {
    if (isNeutral(t.kind)) continue;
    const cents = amountToCents(t.amount);
    if (t.kind === "income") income += cents;
    else if (t.kind === "expense") expense += cents;
  }
  return {
    income: centsToAmount(income),
    expense: centsToAmount(expense),
    net: centsToAmount(income - expense),
  };
}
