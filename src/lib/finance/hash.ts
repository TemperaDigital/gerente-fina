/**
 * Hash antiduplicidade de transações.
 *
 * Quando sincronizamos extratos (Pluggy, OFX, manual), precisamos de uma
 * chave estável para deduplicar lançamentos idênticos sem depender de IDs
 * do provedor. O hash combina os campos canônicos da transação e produz um
 * hex SHA-256 determinístico.
 *
 * Função puramente isomorfa (usa WebCrypto, disponível no navegador, em
 * Cloudflare Workers e em Node 20+).
 */

export interface HashableTransaction {
  account_id: string;
  /** ISO date `YYYY-MM-DD` (sem componente de hora — datas idênticas no mesmo dia colidem por design). */
  date: string;
  /** Valor em centavos (inteiro). Use centavos para evitar erro de ponto flutuante. */
  amount_cents: number;
  /** Descrição original normalizada (trim + lowercase + colapso de espaços). */
  description: string;
}

function normalizeDescription(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function hashTransaction(tx: HashableTransaction): Promise<string> {
  const canonical = [
    tx.account_id,
    tx.date,
    String(tx.amount_cents),
    normalizeDescription(tx.description),
  ].join("|");

  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
