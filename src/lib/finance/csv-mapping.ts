/**
 * Mapeamento determinístico de CSV genérico para o formato interno do
 * importador. A IA (detectCsvSchema) roda UMA VEZ por arquivo para descobrir
 * o mapa de colunas; aplicar esse mapa em todas as linhas é PURO — sem I/O,
 * sem chamada de IA — fácil de testar com vitest.
 */

export type CsvDateFormat = "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YY";

export type CsvNegativeConvention =
  | "minus_prefix"
  | "minus_suffix"
  | "parentheses"
  | "none";

export type CsvStatementType = "bank_statement" | "credit_card_invoice";

export interface CsvSchemaMap {
  date_key: string;
  description_key: string;
  amount_key: string;
  date_format: CsvDateFormat;
  negative_convention: CsvNegativeConvention;
  statement_type: CsvStatementType;
}

const DATE_FORMATS: CsvDateFormat[] = ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YY"];
const NEGATIVE_CONVENTIONS: CsvNegativeConvention[] = [
  "minus_prefix",
  "minus_suffix",
  "parentheses",
  "none",
];
const STATEMENT_TYPES: CsvStatementType[] = ["bank_statement", "credit_card_invoice"];

/**
 * Valida o mapa bruto devolvido pela IA contra as chaves realmente presentes
 * na amostra. Lança erro descritivo em vez de adivinhar — falha visível é
 * melhor que dado errado silencioso.
 */
export function validateCsvSchemaMap(
  map: Record<string, unknown>,
  sampleKeys: string[],
): CsvSchemaMap {
  const keySet = new Set(sampleKeys);
  const dateKey = map.date_key;
  const descKey = map.description_key;
  const amountKey = map.amount_key;

  if (typeof dateKey !== "string" || !keySet.has(dateKey)) {
    throw new Error(
      `Não foi possível identificar a coluna de data (a IA respondeu "${String(dateKey)}", que não existe no arquivo).`,
    );
  }
  if (typeof descKey !== "string" || !keySet.has(descKey)) {
    throw new Error(
      `Não foi possível identificar a coluna de descrição (a IA respondeu "${String(descKey)}", que não existe no arquivo).`,
    );
  }
  if (typeof amountKey !== "string" || !keySet.has(amountKey)) {
    throw new Error(
      `Não foi possível identificar a coluna de valor (a IA respondeu "${String(amountKey)}", que não existe no arquivo).`,
    );
  }
  if (dateKey === descKey || dateKey === amountKey || descKey === amountKey) {
    throw new Error(
      "A IA apontou a mesma coluna para mais de um campo — não é seguro prosseguir com este mapeamento.",
    );
  }
  if (!DATE_FORMATS.includes(map.date_format as CsvDateFormat)) {
    throw new Error(`Formato de data não reconhecido: "${String(map.date_format)}".`);
  }
  if (!NEGATIVE_CONVENTIONS.includes(map.negative_convention as CsvNegativeConvention)) {
    throw new Error(
      `Convenção de sinal negativo não reconhecida: "${String(map.negative_convention)}".`,
    );
  }
  if (!STATEMENT_TYPES.includes(map.statement_type as CsvStatementType)) {
    throw new Error(`Tipo de extrato não reconhecido: "${String(map.statement_type)}".`);
  }

  return {
    date_key: dateKey,
    description_key: descKey,
    amount_key: amountKey,
    date_format: map.date_format as CsvDateFormat,
    negative_convention: map.negative_convention as CsvNegativeConvention,
    statement_type: map.statement_type as CsvStatementType,
  };
}

/** Converte uma data bruta para ISO (YYYY-MM-DD) segundo o formato detectado. */
export function parseCsvDate(raw: string, format: CsvDateFormat): string {
  const s = raw.trim();
  let d: number;
  let m: number;
  let y: number;

  if (format === "YYYY-MM-DD") {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (!match) throw new Error(`Data "${raw}" não bate com o formato YYYY-MM-DD.`);
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else if (format === "DD/MM/YYYY") {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!match) throw new Error(`Data "${raw}" não bate com o formato DD/MM/YYYY.`);
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  } else if (format === "MM/DD/YYYY") {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!match) throw new Error(`Data "${raw}" não bate com o formato MM/DD/YYYY.`);
    m = Number(match[1]);
    d = Number(match[2]);
    y = Number(match[3]);
  } else {
    // DD/MM/YY
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
    if (!match) throw new Error(`Data "${raw}" não bate com o formato DD/MM/YY.`);
    d = Number(match[1]);
    m = Number(match[2]);
    y = 2000 + Number(match[3]);
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error(`Data "${raw}" tem dia/mês fora do intervalo válido.`);
  }

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Converte um valor bruto para módulo + sinal.
 * O separador decimal é inferido por regex (não depende da IA): termina em
 * `,DD` → vírgula é decimal (padrão BR, ex: "1.234,56"); caso contrário, ponto.
 */
export function parseCsvAmount(
  raw: string,
  convention: CsvNegativeConvention,
): { absAmount: string; isNegative: boolean } {
  let s = raw.trim();
  if (!s) throw new Error("Valor vazio.");

  let isNegative = false;

  if (convention === "parentheses" && /^\(.*\)$/.test(s)) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }
  if (convention === "minus_suffix" && s.endsWith("-")) {
    isNegative = true;
    s = s.slice(0, -1).trim();
  }
  if ((convention === "minus_prefix" || convention === "none") && /^-/.test(s)) {
    isNegative = true;
    s = s.replace(/^-\s*/, "");
  }

  // Remove símbolo de moeda e espaços remanescentes
  s = s.replace(/[R$\s]/g, "");

  // Vírgula com exatamente 2 dígitos ao final → decimal BR (ex: "1.234,56")
  const isBrDecimal = /,\d{2}$/.test(s);
  if (isBrDecimal) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Valor "${raw}" não pôde ser interpretado como número.`);
  }

  return { absAmount: Number(s).toFixed(2), isNegative };
}

/**
 * Detecta parcelamento embutido na descrição (ex: "Parcela 3/12", "(3/12)").
 * Retorna apenas metadado informativo — não cria installment_purchases.
 */
export function extractInstallmentHint(
  description: string,
): { current: number; total: number } | null {
  const patterns = [/parcela\s*(\d{1,2})\s*\/\s*(\d{1,3})/i, /\((\d{1,2})\s*\/\s*(\d{1,3})\)/];
  for (const re of patterns) {
    const match = re.exec(description);
    if (match) {
      const current = Number(match[1]);
      const total = Number(match[2]);
      if (current >= 1 && total >= current && total <= 360) {
        return { current, total };
      }
    }
  }
  return null;
}
