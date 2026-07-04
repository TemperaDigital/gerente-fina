import { describe, it, expect } from "vitest";
import { suggestInvoiceForPayment, type InvoiceCandidate } from "./invoice-payment-match";

describe("suggestInvoiceForPayment", () => {
  it("retorna null para lista de faturas vazia", () => {
    expect(suggestInvoiceForPayment([], "2024-06-15")).toBeNull();
  });

  it("escolhe a única fatura candidata quando há apenas uma", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-1", due_date: "2024-06-05", status: "closed" },
    ];
    expect(suggestInvoiceForPayment(invoices, "2024-06-10")).toBe("inv-1");
  });

  it("escolhe a fatura de MAIOR due_date entre as que são <= data do pagamento", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-jan", due_date: "2024-01-05", status: "closed" },
      { id: "inv-fev", due_date: "2024-02-05", status: "closed" },
      { id: "inv-mar", due_date: "2024-03-05", status: "closed" },
    ];
    // pagamento em 10/03 — a fatura de março (05/03) já venceu e é a mais recente
    expect(suggestInvoiceForPayment(invoices, "2024-03-10")).toBe("inv-mar");
  });

  it("exclui faturas com due_date POSTERIOR à data do pagamento", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-passado", due_date: "2024-01-05", status: "closed" },
      { id: "inv-futuro", due_date: "2024-12-05", status: "open" },
    ];
    expect(suggestInvoiceForPayment(invoices, "2024-02-01")).toBe("inv-passado");
  });

  it("exclui faturas com status 'paid' mesmo que a data batesse", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-paga", due_date: "2024-03-05", status: "paid" },
      { id: "inv-fechada", due_date: "2024-02-05", status: "closed" },
    ];
    expect(suggestInvoiceForPayment(invoices, "2024-03-10")).toBe("inv-fechada");
  });

  it("exclui faturas com status 'overdue' mesmo que a data batesse", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-atrasada", due_date: "2024-03-05", status: "overdue" },
      { id: "inv-aberta", due_date: "2024-02-05", status: "open" },
    ];
    expect(suggestInvoiceForPayment(invoices, "2024-03-10")).toBe("inv-aberta");
  });

  it("em empate de due_date, prioriza status 'closed' sobre 'open'", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-open", due_date: "2024-03-05", status: "open" },
      { id: "inv-closed", due_date: "2024-03-05", status: "closed" },
    ];
    expect(suggestInvoiceForPayment(invoices, "2024-03-10")).toBe("inv-closed");
    // Ordem inversa no array de entrada não deve mudar o resultado.
    expect(suggestInvoiceForPayment([...invoices].reverse(), "2024-03-10")).toBe("inv-closed");
  });

  it("retorna null quando NENHUMA fatura tem due_date <= data do pagamento", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-futuro-1", due_date: "2024-05-05", status: "open" },
      { id: "inv-futuro-2", due_date: "2024-06-05", status: "closed" },
    ];
    expect(suggestInvoiceForPayment(invoices, "2024-01-01")).toBeNull();
  });

  it("retorna null quando só há faturas 'paid'/'overdue' (nenhuma open/closed elegível)", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-1", due_date: "2024-01-05", status: "paid" },
      { id: "inv-2", due_date: "2024-02-05", status: "overdue" },
    ];
    expect(suggestInvoiceForPayment(invoices, "2024-06-01")).toBeNull();
  });

  it("pagamento no MESMO dia do vencimento da fatura conta como elegível (<=)", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-1", due_date: "2024-03-10", status: "closed" },
    ];
    expect(suggestInvoiceForPayment(invoices, "2024-03-10")).toBe("inv-1");
  });

  it("é determinístico: chamadas repetidas com os mesmos dados retornam o mesmo resultado", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-a", due_date: "2024-03-05", status: "closed" },
      { id: "inv-b", due_date: "2024-02-05", status: "open" },
      { id: "inv-c", due_date: "2024-01-05", status: "closed" },
    ];
    const first = suggestInvoiceForPayment(invoices, "2024-03-05");
    for (let i = 0; i < 5; i++) {
      expect(suggestInvoiceForPayment(invoices, "2024-03-05")).toBe(first);
    }
  });

  it("não muta o array de faturas recebido", () => {
    const invoices: InvoiceCandidate[] = [
      { id: "inv-b", due_date: "2024-02-05", status: "open" },
      { id: "inv-a", due_date: "2024-01-05", status: "closed" },
    ];
    const copy = [...invoices];
    suggestInvoiceForPayment(invoices, "2024-06-01");
    expect(invoices).toEqual(copy);
  });
});
