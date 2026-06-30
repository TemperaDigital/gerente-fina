/**
 * Helpers de aritmética monetária — BigInt em centavos.
 *
 * Cláusula Pétrea §3: zero confiança em Number/parseFloat para cálculo.
 * Toda soma, subtração e percentual passa por BigInt para evitar bugs
 * de ponto flutuante (0.1 + 0.2 !== 0.3).
 *
 * Convenções:
 *  - Entrada (UI ou DB): string `numeric(14,2)` ou number; aceita "R$ 1.234,56",
 *    "1,234.56", "1234.56", "-1234.56", "+1234.56".
 *  - Saída de cálculo: string `numeric(14,2)` (ex: "1234.56", "-12.00").
 *  - Centavos: BigInt (ex: 123456n).
 */

export type Money = string | number | null | undefined;

const CENTS_RE = /^-?\d+$/;

/** Normaliza string brasileira ("1.234,56") ou US ("1,234.56") para "1234.56". */
function normalizeNumericString(raw: string): string {
  let s = raw.trim();
  if (s === "") return "0";
  // remove R$, espaços e sinal de mais
  s = s.replace(/[R$\s]/g, "").replace(/^\+/, "");
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // assume separador decimal = o último símbolo (PT-BR: vírgula última)
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // pt-BR: pontos são milhar, vírgula é decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // en-US: vírgulas são milhar, ponto é decimal
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  // se sobrar caractere inválido, devolve 0
  if (!/^\d+(\.\d+)?$/.test(s)) return "0";
  return neg ? `-${s}` : s;
}

/** Converte qualquer Money em BigInt de centavos. Inválido → 0n. */
export function toCents(value: Money): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n;
    // arredonda banker-safe usando string fixed
    const s = value.toFixed(2);
    return toCents(s);
  }
  const s = normalizeNumericString(String(value));
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [intPart, fracRaw = ""] = abs.split(".");
  const frac = (fracRaw + "00").slice(0, 2);
  if (!CENTS_RE.test(intPart) || !/^\d{2}$/.test(frac)) return 0n;
  const cents = BigInt(intPart) * 100n + BigInt(frac);
  return neg ? -cents : cents;
}

/** Converte BigInt centavos para string `numeric(14,2)`. */
export function fromCents(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const int = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${int.toString()}.${frac}`;
}

/** Soma N valores monetários, retornando string `numeric(14,2)`. */
export function addAmounts(...values: Money[]): string {
  let total = 0n;
  for (const v of values) total += toCents(v);
  return fromCents(total);
}

/** Soma uma lista, com seletor opcional. */
export function sumAmounts<T>(list: ReadonlyArray<T>, pick: (item: T) => Money): string {
  let total = 0n;
  for (const item of list) total += toCents(pick(item));
  return fromCents(total);
}

/** Percentual seguro (0–100). Divisor 0 / null → 0. */
export function safePercent(part: Money, total: Money): number {
  const p = toCents(part);
  const t = toCents(total);
  if (t === 0n) return 0;
  // multiplica por 10000 para preservar 2 casas, depois divide
  const pct = Number((p * 10000n) / t) / 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

/** True se o valor representa um número negativo (sem usar Number). */
export function isNegativeAmount(value: Money): boolean {
  return toCents(value) < 0n;
}

/** Coage para string `numeric(14,2)` saneando qualquer entrada. */
export function normalizeAmount(value: Money): string {
  return fromCents(toCents(value));
}
