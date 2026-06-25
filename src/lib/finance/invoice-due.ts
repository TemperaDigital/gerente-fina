/**
 * Regra Constitucional #3 — Correção do Meio do Mês.
 *
 * Cálculo do vencimento da fatura de cartão de crédito para uma compra:
 *
 *   - Se `due_day > closing_day`: a fatura fecha e vence no MESMO mês civil
 *     (Ex.: fecha 05/06, vence 15/06). Compras feitas após o fechamento
 *     entram na fatura do mês seguinte.
 *
 *   - Se `due_day <= closing_day`: a fatura vence no mês SEGUINTE ao
 *     fechamento (Ex.: fecha 25/06, vence 05/07).
 *
 * PROIBIDO aplicar incrementos cegos de `+1 mês` sem validar a relação
 * entre os dois dias. Função pura — não toca em Date.now nem em fuso.
 */

export interface InvoiceDueInput {
  /** Data da compra (timezone do usuário, idealmente normalizada para America/Sao_Paulo). */
  purchaseDate: Date;
  /** Dia do mês em que a fatura fecha (1..31). */
  closingDay: number;
  /** Dia do mês em que a fatura vence (1..31). */
  dueDay: number;
}

function clampToMonth(year: number, monthIndex: number, day: number): Date {
  // Cria a data e, se o dia não existir no mês (ex.: 31/02), usa o último dia.
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(year, monthIndex, safeDay);
}

export function computeInvoiceDueDate({
  purchaseDate,
  closingDay,
  dueDay,
}: InvoiceDueInput): Date {
  if (closingDay < 1 || closingDay > 31) throw new Error("closingDay fora de 1..31");
  if (dueDay < 1 || dueDay > 31) throw new Error("dueDay fora de 1..31");

  const year = purchaseDate.getFullYear();
  const month = purchaseDate.getMonth();
  const day = purchaseDate.getDate();

  // 1) Em qual mês de FECHAMENTO esta compra cai?
  //    Se a compra foi feita até o dia de fechamento (inclusive), entra na
  //    fatura que fecha NESTE mês; caso contrário, entra na do próximo.
  const closingMonthOffset = day <= closingDay ? 0 : 1;
  const closingDate = clampToMonth(year, month + closingMonthOffset, closingDay);

  // 2) A partir do mês de fechamento, calcular o vencimento.
  //    due_day > closing_day  → vence no MESMO mês civil do fechamento.
  //    due_day <= closing_day → vence no mês SEGUINTE.
  const dueMonthOffset = dueDay > closingDay ? 0 : 1;
  return clampToMonth(
    closingDate.getFullYear(),
    closingDate.getMonth() + dueMonthOffset,
    dueDay,
  );
}
