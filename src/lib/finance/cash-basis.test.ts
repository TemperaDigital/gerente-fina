import { describe, it, expect } from "vitest";
import { computeMonthlyBalance } from "./cash-basis";

describe("computeMonthlyBalance", () => {
  it("calcula Receitas − Custo Fixo − Custo Variável − Fatura paga − Agendamentos", () => {
    const result = computeMonthlyBalance({
      incomeCents: 500000n,
      fixedExpenseCents: 100000n,
      variableExpenseCents: 80000n,
      invoicePaymentCents: 150000n,
      scheduledPendingCents: 20000n,
    });
    expect(result).toBe(150000n);
  });

  it("nunca fica mais positivo ao incluir agendamentos pendentes", () => {
    const withoutScheduled = computeMonthlyBalance({
      incomeCents: 100000n,
      fixedExpenseCents: 40000n,
      variableExpenseCents: 30000n,
      invoicePaymentCents: 50000n,
      scheduledPendingCents: 0n,
    });
    const withScheduled = computeMonthlyBalance({
      incomeCents: 100000n,
      fixedExpenseCents: 40000n,
      variableExpenseCents: 30000n,
      invoicePaymentCents: 50000n,
      scheduledPendingCents: 15000n,
    });
    expect(withScheduled).toBeLessThanOrEqual(withoutScheduled);
  });

  it("propriedade de sanidade: se a base (sem agendamentos) já é negativa, o saldo final continua negativo ou igual — nunca mais otimista", () => {
    const baseCents = 100000n - 40000n - 30000n - 150000n; // negativo de propósito
    expect(baseCents).toBeLessThan(0n);

    const result = computeMonthlyBalance({
      incomeCents: 100000n,
      fixedExpenseCents: 40000n,
      variableExpenseCents: 30000n,
      invoicePaymentCents: 150000n,
      scheduledPendingCents: 25000n,
    });
    expect(result).toBeLessThanOrEqual(baseCents);
    expect(result).toBeLessThan(0n);
  });

  it("resultado zero quando tudo se cancela exatamente", () => {
    const result = computeMonthlyBalance({
      incomeCents: 100000n,
      fixedExpenseCents: 40000n,
      variableExpenseCents: 30000n,
      invoicePaymentCents: 20000n,
      scheduledPendingCents: 10000n,
    });
    expect(result).toBe(0n);
  });
});
