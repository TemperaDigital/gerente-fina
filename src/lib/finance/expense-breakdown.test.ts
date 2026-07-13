import { describe, it, expect } from "vitest";
import {
  aggregateExpenseBreakdown,
  type ExpenseInput,
} from "./expense-breakdown";
import { addAmounts } from "@/lib/finance/money";

/**
 * Espelha a lógica de expense_cash de getCashBasisSummary — Custo Fixo +
 * Custo Variável + Fatura Paga, restrito a bank/cash. Se aggregateExpenseBreakdown
 * divergir disto, o total do modal diverge do KPI. Esse é o teste de sanidade
 * pedido pela missão.
 */
function expectedExpenseCashCents(rows: ReadonlyArray<ExpenseInput>): bigint {
  let cents = 0n;
  for (const r of rows) {
    const at = r.account_type;
    if (at !== "bank" && at !== "cash") continue;
    if (r.kind === "expense") {
      cents += BigInt(Math.round(Number(r.amount) * 100));
    } else if (r.kind === "invoice_payment" && r.type === "debit") {
      cents += BigInt(Math.round(Number(r.amount) * 100));
    }
  }
  return cents;
}

describe("aggregateExpenseBreakdown — sanidade contra expense_cash", () => {
  it("só despesas fixas: total bate com expense_cash", () => {
    const rows: ExpenseInput[] = [
      { kind: "expense", amount: "300.00", account_type: "bank", category_id: "c1", category_name: "Aluguel", category_nature: "FIXA", icon: null, color: null },
      { kind: "expense", amount: "120.50", account_type: "cash", category_id: "c2", category_name: "Internet", category_nature: "FIXA", icon: null, color: null },
      // deve ser ignorada (credit_card)
      { kind: "expense", amount: "999.99", account_type: "credit_card", category_id: "c3", category_name: "Ignora", category_nature: "FIXA", icon: null, color: null },
    ];
    const r = aggregateExpenseBreakdown(rows);
    expect(r.totals.fixed).toBe("420.50");
    expect(r.totals.variable).toBe("0.00");
    expect(r.totals.invoice).toBe("0.00");
    expect(r.totals.total).toBe("420.50");
    expect(r.fixed).toHaveLength(2);
    expect(r.fixed[0].category_name).toBe("Aluguel");
    expect(addAmounts(r.totals.fixed, r.totals.variable, r.totals.invoice)).toBe(r.totals.total);
    expect(BigInt(Math.round(Number(r.totals.total) * 100))).toBe(expectedExpenseCashCents(rows));
  });

  it("mistura fixa + variável + nula (nula vira variável): soma bate com expense_cash", () => {
    const rows: ExpenseInput[] = [
      { kind: "expense", amount: "200.00", account_type: "bank", category_id: "cf", category_name: "Fixa", category_nature: "FIXA", icon: null, color: null },
      { kind: "expense", amount: "50.00", account_type: "bank", category_id: "cv", category_name: "Mercado", category_nature: "VARIÁVEL", icon: null, color: null },
      { kind: "expense", amount: "17.25", account_type: "bank", category_id: "cn", category_name: "Sem nature", category_nature: null, icon: null, color: null },
      { kind: "expense", amount: "5.00", account_type: "cash", category_id: null, category_name: null, category_nature: null, icon: null, color: null },
    ];
    const r = aggregateExpenseBreakdown(rows);
    expect(r.totals.fixed).toBe("200.00");
    expect(r.totals.variable).toBe("72.25"); // 50 + 17.25 + 5
    expect(r.totals.invoice).toBe("0.00");
    expect(r.totals.total).toBe("272.25");
    expect(r.variable).toHaveLength(3);
    expect(r.variable.some((v) => v.category_name === "Sem categoria")).toBe(true);
    expect(BigInt(Math.round(Number(r.totals.total) * 100))).toBe(expectedExpenseCashCents(rows));
  });

  it("dois cartões diferentes + despesa: total dos 3 blocos === expense_cash", () => {
    const rows: ExpenseInput[] = [
      { kind: "invoice_payment", type: "debit", amount: "1500.00", account_type: "bank", invoice_account_id: "cc1", invoice_account_name: "Nubank" },
      { kind: "invoice_payment", type: "debit", amount: "780.33", account_type: "bank", invoice_account_id: "cc2", invoice_account_name: "Itaú" },
      // perna crédito (no cartão) — NÃO conta
      { kind: "invoice_payment", type: "credit", amount: "1500.00", account_type: "credit_card", invoice_account_id: "cc1", invoice_account_name: "Nubank" },
      { kind: "expense", amount: "42.00", account_type: "bank", category_id: "cv", category_name: "Uber", category_nature: "VARIÁVEL", icon: null, color: null },
    ];
    const r = aggregateExpenseBreakdown(rows);
    expect(r.totals.invoice).toBe("2280.33");
    expect(r.totals.variable).toBe("42.00");
    expect(r.totals.fixed).toBe("0.00");
    expect(r.totals.total).toBe("2322.33");
    expect(r.invoice_payments).toHaveLength(2);
    expect(r.invoice_payments[0].account_name).toBe("Nubank");
    expect(BigInt(Math.round(Number(r.totals.total) * 100))).toBe(expectedExpenseCashCents(rows));
  });

  it("pagamento de fatura sem paid_invoice_id vai para 'Outros pagamentos de fatura' e continua na soma", () => {
    const rows: ExpenseInput[] = [
      { kind: "invoice_payment", type: "debit", amount: "300.00", account_type: "bank", invoice_account_id: "cc1", invoice_account_name: "Nubank" },
      // órfão — sem paid_invoice_id
      { kind: "invoice_payment", type: "debit", amount: "88.00", account_type: "bank", invoice_account_id: null, invoice_account_name: null },
    ];
    const r = aggregateExpenseBreakdown(rows);
    expect(r.totals.invoice).toBe("388.00");
    expect(r.totals.total).toBe("388.00");
    expect(r.invoice_payments).toHaveLength(2);
    expect(r.invoice_payments.some((i) => i.account_name === "Outros pagamentos de fatura")).toBe(true);
    expect(BigInt(Math.round(Number(r.totals.total) * 100))).toBe(expectedExpenseCashCents(rows));
  });

  it("ordena descendente por valor dentro de cada bloco", () => {
    const rows: ExpenseInput[] = [
      { kind: "expense", amount: "10.00", account_type: "bank", category_id: "a", category_name: "A", category_nature: "VARIÁVEL", icon: null, color: null },
      { kind: "expense", amount: "500.00", account_type: "bank", category_id: "b", category_name: "B", category_nature: "VARIÁVEL", icon: null, color: null },
      { kind: "expense", amount: "50.00", account_type: "bank", category_id: "c", category_name: "C", category_nature: "VARIÁVEL", icon: null, color: null },
    ];
    const r = aggregateExpenseBreakdown(rows);
    expect(r.variable.map((v) => v.category_name)).toEqual(["B", "C", "A"]);
  });
});
