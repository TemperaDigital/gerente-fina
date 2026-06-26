/**
 * Hash antiduplicidade de transações — Constituição §3 (escudo de importação).
 *
 * REGRA CANÔNICA: o hash só é calculado para lançamentos cuja `source` esteja
 * em `('import', 'pluggy')`. Lançamentos com `source = 'manual'` NUNCA recebem
 * hash — eles podem duplicar livremente no banco (UNIQUE parcial é
 * `WHERE dedup_hash IS NOT NULL`) e a UI apenas exibe um toast de aviso.
 *
 * Os valores `amount` chegam do PostgREST como STRING (`"123.45"`) para
 * preservar a precisão de `numeric(14,2)`. Aqui jamais convertemos para
 * `Number` — toda canonicalização é textual.
 *
 * Função isomorfa (WebCrypto: browser, Cloudflare Workers, Node 20+).
 */

export type TransactionSource =
  | "manual"
  | "import"
  | "pluggy"
  | "recurrence"
  | "installment"
  | "invoice_close";

export type TransactionType = "debit" | "credit";

export interface HashableTransaction {
  user_id: string;
  account_id: string;
  /** ISO date `YYYY-MM-DD`. */
  occurred_on: string;
  /** String do PostgREST (`numeric(14,2)`). Sempre positivo (sinal vem de `type`). */
  amount: string;
  type: TransactionType;
  description: string;
}

function normalizeDescription(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Normaliza a string de valor para o formato canônico `"NNN.DD"` (2 casas).
 * Trabalha apenas com manipulação textual — zero ponto flutuante.
 */
export function normalizeAmount(raw: string): string {
  const s = raw.trim().replace(/^\+/, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`amount inválido para hash: "${raw}"`);
  }
  const unsigned = s.replace(/^-/, "");
  const [intPart, fracPartRaw = ""] = unsigned.split(".");
  const fracPart = (fracPartRaw + "00").slice(0, 2);
  const intNorm = intPart.replace(/^0+(?=\d)/, "");
  return `${intNorm}.${fracPart}`;
}

export async function hashTransaction(tx: HashableTransaction): Promise<string> {
  const canonical = [
    tx.user_id,
    tx.account_id,
    tx.occurred_on,
    normalizeAmount(tx.amount),
    tx.type,
    normalizeDescription(tx.description),
  ].join("|");

  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Espelha a trigger SQL `tg_transactions_autohash`: só computa hash quando a
 * origem é importação automática e o campo ainda não veio preenchido.
 * Lançamentos manuais ficam SEMPRE com `dedup_hash = null`.
 */
export function shouldComputeHash(input: {
  source: TransactionSource;
  dedup_hash: string | null | undefined;
}): boolean {
  if (input.dedup_hash) return false;
  return input.source === "import" || input.source === "pluggy";
}
