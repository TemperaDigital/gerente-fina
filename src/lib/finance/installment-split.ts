/**
 * Estimativa de série de parcelas a partir de UMA parcela conhecida (a
 * primeira, "1/N", detectada no importador). Puro — sem I/O.
 *
 * Diferente de `createTransactionEntry`'s installment branch (que divide um
 * TOTAL conhecido em N parcelas, absorvendo o resto na última), aqui vamos
 * na direção OPOSTA: só conhecemos o valor de UMA parcela e precisamos
 * estimar a série completa. Assumimos parcelas iguais (o caso comum de
 * "Parcela 1/12 de R$X" com valor fixo) — sem tentar adivinhar
 * arredondamento que o banco/emissor pode ter aplicado no valor real total.
 */
export function estimateInstallmentSeries(
  firstAmountRaw: string,
  installmentsCount: number,
): { totalAmount: string; amounts: string[] } {
  if (installmentsCount < 1) {
    throw new Error(`installmentsCount inválido: ${installmentsCount}`);
  }
  const unitCents = Math.round(Number(firstAmountRaw) * 100);
  if (!Number.isFinite(unitCents) || unitCents <= 0) {
    throw new Error(`firstAmountRaw inválido: "${firstAmountRaw}"`);
  }
  const totalCents = unitCents * installmentsCount;
  const unit = (unitCents / 100).toFixed(2);
  return {
    totalAmount: (totalCents / 100).toFixed(2),
    amounts: Array.from({ length: installmentsCount }, () => unit),
  };
}
