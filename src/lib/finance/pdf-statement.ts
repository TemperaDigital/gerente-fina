/**
 * Ancoragem de ano e validação da extração de PDFs (Fase C do Importador
 * Universal). Puro — sem I/O, sem chamada de IA — fácil de testar com vitest.
 *
 * Datas em faturas/extratos PDF costumam vir SEM ano (ex: "02/08"). O ANO é
 * calculado aqui, deterministicamente, ancorado na data de vencimento/
 * fechamento do documento (que a IA extrai à parte, geralmente impressa uma
 * vez, fora da tabela de lançamentos).
 */

export type PdfNegativeConvention = "minus_prefix" | "minus_suffix" | "parentheses" | "none";
export type PdfStatementType = "bank_statement" | "credit_card_invoice";

export interface PdfRawTransaction {
  day: number;
  month: number;
  description: string;
  amount_text: string;
}

export interface PdfExtractionMap {
  document_date: string;
  statement_type: PdfStatementType;
  negative_convention: PdfNegativeConvention;
  transactions: PdfRawTransaction[];
}

const NEGATIVE_CONVENTIONS: PdfNegativeConvention[] = [
  "minus_prefix",
  "minus_suffix",
  "parentheses",
  "none",
];
const STATEMENT_TYPES: PdfStatementType[] = ["bank_statement", "credit_card_invoice"];

/**
 * Valida o retorno bruto da IA. Lança erro descritivo em vez de adivinhar —
 * falha visível é melhor que dado errado silencioso.
 */
export function validatePdfExtraction(raw: Record<string, unknown>): PdfExtractionMap {
  const documentDate = raw.document_date;
  if (typeof documentDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    throw new Error(
      `Não foi possível identificar a data de vencimento/fechamento do documento (recebido: "${String(documentDate)}"). Sem essa âncora não é seguro calcular o ano dos lançamentos.`,
    );
  }
  if (!STATEMENT_TYPES.includes(raw.statement_type as PdfStatementType)) {
    throw new Error(`Tipo de documento não reconhecido: "${String(raw.statement_type)}".`);
  }
  if (!NEGATIVE_CONVENTIONS.includes(raw.negative_convention as PdfNegativeConvention)) {
    throw new Error(
      `Convenção de sinal negativo não reconhecida: "${String(raw.negative_convention)}".`,
    );
  }

  const txs = raw.transactions;
  if (!Array.isArray(txs) || txs.length === 0) {
    throw new Error("Nenhum lançamento foi encontrado no documento.");
  }

  const transactions: PdfRawTransaction[] = txs.map((t, i) => {
    const item = (t ?? {}) as Record<string, unknown>;
    const day = Number(item.day);
    const month = Number(item.month);
    const description = item.description;
    const amountText = item.amount_text;

    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error(`Lançamento ${i + 1}: dia inválido ("${String(item.day)}").`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error(`Lançamento ${i + 1}: mês inválido ("${String(item.month)}").`);
    }
    if (typeof description !== "string" || !description.trim()) {
      throw new Error(`Lançamento ${i + 1}: descrição vazia.`);
    }
    if (typeof amountText !== "string" || !amountText.trim()) {
      throw new Error(`Lançamento ${i + 1}: valor vazio.`);
    }

    return { day, month, description: description.trim(), amount_text: amountText.trim() };
  });

  return {
    document_date: documentDate,
    statement_type: raw.statement_type as PdfStatementType,
    negative_convention: raw.negative_convention as PdfNegativeConvention,
    transactions,
  };
}

/**
 * Calcula o ano de um lançamento sem ano explícito, ancorado na data de
 * vencimento/fechamento do documento: se o mês do lançamento for MAIOR que o
 * mês da âncora, é do ano ANTERIOR (fatura cruzando virada de ano); senão,
 * mesmo ano da âncora.
 */
export function anchorTransactionYear(month: number, day: number, anchorIso: string): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Mês inválido: ${month}.`);
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`Dia inválido: ${day}.`);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(anchorIso.trim());
  if (!match) {
    throw new Error(`Data-âncora inválida: "${anchorIso}".`);
  }
  const anchorYear = Number(match[1]);
  const anchorMonth = Number(match[2]);

  const year = month > anchorMonth ? anchorYear - 1 : anchorYear;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Confirma que a data realmente existe (ex.: 31 de abril não existe)
  const check = new Date(`${iso}T00:00:00Z`);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new Error(`Data "${day}/${month}" não existe no ano calculado (${year}).`);
  }

  return iso;
}
