/**
 * Aritmética pura do modal "Detalhamento de Despesas" (Missão — modal
 * Despesas do Dashboard). Extraída de dashboard.functions.getExpenseBreakdown
 * para permitir teste de sanidade sem depender do Supabase.
 *
 * Regra de sanidade obrigatória:
 *   sum(invoice_payments) + sum(fixed) + sum(variable) === totals.total
 *   e totals.total DEVE bater com o `expense_cash` de getCashBasisSummary
 *   quando alimentado com o mesmo conjunto de linhas do período.
 *
 * Convenções compartilhadas com getCashBasisSummary (Missão 16):
 *   - só entram linhas de conta bank/cash (credit_card nunca conta aqui);
 *   - categoria com nature nula é tratada como VARIÁVEL (default);
 *   - pagamentos de fatura só na perna débito (kind='invoice_payment' +
 *     type='debit'); a perna crédito não é dinheiro saindo.
 *   - pagamento de fatura sem paid_invoice_id preenchido (caso-limite) NÃO
 *     é descartado — vai pro item sintético "Outros pagamentos de fatura",
 *     senão a soma dos 3 blocos pode divergir silenciosamente do KPI.
 */
import { fromCents, toCents } from "@/lib/finance/money";

export type AccountType = "cash" | "bank" | "credit_card";

export interface ExpenseInputExpense {
  kind: "expense";
  amount: string;
  account_type: AccountType | null | undefined;
  category_id: string | null;
  category_name: string | null;
  category_nature: "FIXA" | "VARIÁVEL" | null;
  icon: string | null;
  color: string | null;
}

export interface ExpenseInputInvoicePayment {
  kind: "invoice_payment";
  type: "debit" | "credit";
  amount: string;
  account_type: AccountType | null | undefined;
  invoice_account_id: string | null;
  invoice_account_name: string | null;
}

export type ExpenseInput = ExpenseInputExpense | ExpenseInputInvoicePayment;

export interface CategoryBreakdownItem {
  category_id: string;
  category_name: string;
  icon: string | null;
  color: string | null;
  amount: string;
}

export interface InvoicePaymentBreakdownItem {
  account_id: string;
  account_name: string;
  amount: string;
}

export interface ExpenseBreakdownResult {
  totals: {
    fixed: string;
    variable: string;
    invoice: string;
    total: string;
  };
  invoice_payments: InvoicePaymentBreakdownItem[];
  fixed: CategoryBreakdownItem[];
  variable: CategoryBreakdownItem[];
}

const UNCATEGORIZED_ID = "__uncategorized__";
const UNCATEGORIZED_LABEL = "Sem categoria";
const ORPHAN_INVOICE_ID = "__other_invoice__";
const ORPHAN_INVOICE_LABEL = "Outros pagamentos de fatura";

function isCashAccount(type: AccountType | null | undefined): boolean {
  return type === "bank" || type === "cash";
}

export function aggregateExpenseBreakdown(
  rows: ReadonlyArray<ExpenseInput>,
): ExpenseBreakdownResult {
  const fixedMap = new Map<string, { item: CategoryBreakdownItem; cents: bigint }>();
  const variableMap = new Map<string, { item: CategoryBreakdownItem; cents: bigint }>();
  const invoiceMap = new Map<string, { item: InvoicePaymentBreakdownItem; cents: bigint }>();

  for (const r of rows) {
    if (!isCashAccount(r.account_type)) continue;

    if (r.kind === "expense") {
      const cents = toCents(r.amount);
      if (cents === 0n) continue;
      const bucket = r.category_nature === "FIXA" ? fixedMap : variableMap;
      const key = r.category_id ?? UNCATEGORIZED_ID;
      const existing = bucket.get(key);
      if (existing) {
        existing.cents += cents;
      } else {
        bucket.set(key, {
          cents,
          item: {
            category_id: key,
            category_name: r.category_name ?? UNCATEGORIZED_LABEL,
            icon: r.icon,
            color: r.color,
            amount: "0.00",
          },
        });
      }
    } else if (r.kind === "invoice_payment" && r.type === "debit") {
      const cents = toCents(r.amount);
      if (cents === 0n) continue;
      const key = r.invoice_account_id ?? ORPHAN_INVOICE_ID;
      const existing = invoiceMap.get(key);
      if (existing) {
        existing.cents += cents;
      } else {
        invoiceMap.set(key, {
          cents,
          item: {
            account_id: key,
            account_name:
              r.invoice_account_name ?? (r.invoice_account_id ? "Cartão" : ORPHAN_INVOICE_LABEL),
            amount: "0.00",
          },
        });
      }
    }
  }

  const fixedList = Array.from(fixedMap.values())
    .map((e) => ({ ...e.item, amount: fromCents(e.cents), _c: e.cents }))
    .sort((a, b) => (b._c > a._c ? 1 : b._c < a._c ? -1 : 0))
    .map(({ _c: _drop, ...rest }) => {
      void _drop;
      return rest;
    });

  const variableList = Array.from(variableMap.values())
    .map((e) => ({ ...e.item, amount: fromCents(e.cents), _c: e.cents }))
    .sort((a, b) => (b._c > a._c ? 1 : b._c < a._c ? -1 : 0))
    .map(({ _c: _drop, ...rest }) => {
      void _drop;
      return rest;
    });

  const invoiceList = Array.from(invoiceMap.values())
    .map((e) => ({ ...e.item, amount: fromCents(e.cents), _c: e.cents }))
    .sort((a, b) => (b._c > a._c ? 1 : b._c < a._c ? -1 : 0))
    .map(({ _c: _drop, ...rest }) => {
      void _drop;
      return rest;
    });

  let fixedCents = 0n;
  for (const e of fixedMap.values()) fixedCents += e.cents;
  let variableCents = 0n;
  for (const e of variableMap.values()) variableCents += e.cents;
  let invoiceCents = 0n;
  for (const e of invoiceMap.values()) invoiceCents += e.cents;

  return {
    totals: {
      fixed: fromCents(fixedCents),
      variable: fromCents(variableCents),
      invoice: fromCents(invoiceCents),
      total: fromCents(fixedCents + variableCents + invoiceCents),
    },
    invoice_payments: invoiceList,
    fixed: fixedList,
    variable: variableList,
  };
}
