import { describe, it, expect } from "vitest";
import { buildExpenseDrilldownSearch } from "./expense-breakdown";

describe("buildExpenseDrilldownSearch — destinos do drill-down do modal Despesas", () => {
  const month = { mode: "month" as const, month: "2026-07" };
  const year = { mode: "year" as const, year: 2026 };

  it("item de fatura de cartão em modo mensal → /transactions filtrado por conta + kind=invoice_payment", () => {
    const s = buildExpenseDrilldownSearch(month, {
      kind: "invoice_payment",
      id: "acc-nubank",
    });
    expect(s).toEqual({
      month: "2026-07",
      account_id: "acc-nubank",
      kind: "invoice_payment",
    });
  });

  it("item de categoria fixa em modo mensal → /transactions filtrado por categoria + kind=expense", () => {
    const s = buildExpenseDrilldownSearch(month, { kind: "fixed", id: "cat-aluguel" });
    expect(s).toEqual({
      month: "2026-07",
      category_id: "cat-aluguel",
      kind: "expense",
    });
  });

  it("item de categoria variável em modo mensal → /transactions filtrado por categoria + kind=expense", () => {
    const s = buildExpenseDrilldownSearch(month, {
      kind: "variable",
      id: "cat-mercado",
    });
    expect(s).toEqual({
      month: "2026-07",
      category_id: "cat-mercado",
      kind: "expense",
    });
  });

  it("modo anual: qualquer tipo de item permanece não-clicável (retorna null)", () => {
    expect(
      buildExpenseDrilldownSearch(year, { kind: "invoice_payment", id: "acc-x" }),
    ).toBeNull();
    expect(
      buildExpenseDrilldownSearch(year, { kind: "fixed", id: "cat-y" }),
    ).toBeNull();
    expect(
      buildExpenseDrilldownSearch(year, { kind: "variable", id: "cat-z" }),
    ).toBeNull();
  });
});
