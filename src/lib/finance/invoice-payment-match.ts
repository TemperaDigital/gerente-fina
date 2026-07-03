/**
 * Heurística para sugerir qual fatura de cartão está sendo quitada por um
 * pagamento detectado no importador. Puro — sem I/O — fácil de testar.
 *
 * Regra validada com o usuário (contador): a fatura sendo paga é quase nunca
 * a que está sendo importada agora — é a anterior, a que já fechou. Entre as
 * faturas com status 'open' ou 'closed', escolhe a de maior due_date que
 * seja <= à data do pagamento; em empate de due_date, prioriza 'closed'
 * sobre 'open'. Sem candidato: retorna null — exige escolha manual (nunca
 * adivinha às cegas).
 */

export type InvoiceStatusForPayment = "open" | "closed" | "paid" | "overdue";

export interface InvoiceCandidate {
  id: string;
  due_date: string;
  status: InvoiceStatusForPayment;
}

export function suggestInvoiceForPayment(
  invoices: InvoiceCandidate[],
  occurredOn: string,
): string | null {
  const candidates = invoices.filter(
    (inv) => (inv.status === "open" || inv.status === "closed") && inv.due_date <= occurredOn,
  );
  if (candidates.length === 0) return null;

  const statusRank: Record<string, number> = { closed: 1, open: 0 };
  const sorted = [...candidates].sort((a, b) => {
    if (a.due_date !== b.due_date) return b.due_date.localeCompare(a.due_date);
    return (statusRank[b.status] ?? -1) - (statusRank[a.status] ?? -1);
  });

  return sorted[0].id;
}
