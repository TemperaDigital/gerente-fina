import { describe, it, expect } from "vitest";
import { computeInvoiceDueDate } from "./invoice-due";

/** Formata via getters LOCAIS (evita flakiness de fuso horário com toISOString). */
function d(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("computeInvoiceDueDate", () => {
  describe("due_day > closing_day (vencimento no MESMO mês civil do fechamento)", () => {
    it("compra antes do fechamento entra na fatura deste mês", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 2, 5), // 05/03/2024
        closingDay: 10,
        dueDay: 20,
      });
      expect(d(result)).toBe("2024-03-20");
    });

    it("compra depois do fechamento entra na fatura do mês seguinte", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 2, 15), // 15/03/2024, fechamento é dia 10
        closingDay: 10,
        dueDay: 20,
      });
      expect(d(result)).toBe("2024-04-20");
    });

    it("compra exatamente no dia de fechamento conta como 'até', não 'depois'", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 2, 10), // exatamente no dia 10
        closingDay: 10,
        dueDay: 20,
      });
      expect(d(result)).toBe("2024-03-20");
    });
  });

  describe("due_day <= closing_day (vencimento no mês SEGUINTE ao fechamento)", () => {
    it("compra antes do fechamento", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 5, 10), // 10/06/2024, fecha dia 25
        closingDay: 25,
        dueDay: 5,
      });
      expect(d(result)).toBe("2024-07-05");
    });

    it("compra depois do fechamento", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 5, 30), // 30/06/2024, fecha dia 25 → mês seguinte
        closingDay: 25,
        dueDay: 5,
      });
      expect(d(result)).toBe("2024-08-05");
    });
  });

  describe("virada de ano", () => {
    it("fechamento em dezembro empurra vencimento para fevereiro do ano seguinte", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 11, 28), // 28/12/2024, fecha dia 25 → fatura fecha em jan/2025
        closingDay: 25,
        dueDay: 5,
      });
      expect(d(result)).toBe("2025-02-05");
    });

    it("compra em dezembro antes do fechamento vence em janeiro do ano seguinte", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 11, 10), // 10/12/2024, fecha dia 25 (mesmo mês)
        closingDay: 25,
        dueDay: 5,
      });
      expect(d(result)).toBe("2025-01-05");
    });
  });

  describe("meses limítrofes e anos bissextos", () => {
    it("clampa closingDay=31 para o último dia de fevereiro em ano bissexto (29)", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 1, 5), // fevereiro/2024 (bissexto)
        closingDay: 31,
        dueDay: 10,
      });
      // Fechamento clampado para 29/02/2024; vencimento (due<=closing) mês seguinte, dia 10
      expect(d(result)).toBe("2024-03-10");
    });

    it("clampa closingDay=31 para o último dia de fevereiro em ano NÃO bissexto (28)", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2023, 1, 5), // fevereiro/2023 (não bissexto)
        closingDay: 31,
        dueDay: 10,
      });
      expect(d(result)).toBe("2023-03-10");
    });

    it("clampa dueDay=31 para o último dia de um mês com 30 dias (abril)", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 2, 5), // março/2024, dia 5 > closingDay 1 → fecha em abril
        closingDay: 1,
        dueDay: 31,
      });
      // Fechamento: 01/04/2024. due_day(31) > closing_day(1) → mesmo mês (abril, só tem 30 dias)
      expect(d(result)).toBe("2024-04-30");
    });

    it("dia de compra 31 num mês de closing_day que não existe (ex: compra em 31/01, fechamento dia 30)", () => {
      const result = computeInvoiceDueDate({
        purchaseDate: new Date(2024, 0, 31), // 31/01/2024
        closingDay: 30,
        dueDay: 10,
      });
      // dia da compra (31) > closingDay (30) → fecha no mês seguinte (fevereiro)
      // fevereiro 2024 (bissexto) não tem dia 30 → clampa para 29
      expect(d(result)).toBe("2024-03-10");
    });
  });

  describe("validação de entrada", () => {
    it("lança erro para closingDay fora do intervalo 1..31", () => {
      expect(() =>
        computeInvoiceDueDate({ purchaseDate: new Date(2024, 0, 1), closingDay: 0, dueDay: 10 }),
      ).toThrow(/closingDay/);
      expect(() =>
        computeInvoiceDueDate({ purchaseDate: new Date(2024, 0, 1), closingDay: 32, dueDay: 10 }),
      ).toThrow(/closingDay/);
    });

    it("lança erro para dueDay fora do intervalo 1..31", () => {
      expect(() =>
        computeInvoiceDueDate({ purchaseDate: new Date(2024, 0, 1), closingDay: 10, dueDay: 0 }),
      ).toThrow(/dueDay/);
      expect(() =>
        computeInvoiceDueDate({ purchaseDate: new Date(2024, 0, 1), closingDay: 10, dueDay: 32 }),
      ).toThrow(/dueDay/);
    });
  });
});
