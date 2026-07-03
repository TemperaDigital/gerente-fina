/**
 * Server Functions — Dashboard (Gerente Fina).
 *
 * Lê das VIEWs `account_balances` e `monthly_dre` (migration 0004),
 * que já aplicam o expurgo de fluxos neutros (§3 da Constituição) e
 * derivam saldos em tempo real (sem materialização — §3).
 *
 * Camada headless: nenhuma dependência de UI. Retorna DTOs serializáveis
 * com `amount` em string `numeric(14,2)` para preservar precisão decimal.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addAmounts } from "@/lib/finance/money";

// -----------------------------------------------------------------------------
// Tipos públicos (DTOs)
// -----------------------------------------------------------------------------

export type AccountType = "cash" | "bank" | "credit_card";

export interface AccountBalanceDTO {
  account_id: string;
  account_name: string;
  account_type: AccountType;
  balance: string; // numeric(14,2)
  transactions_count: number;
  last_movement_on: string | null;
}

export interface DashboardSummaryDTO {
  reference_month: string; // YYYY-MM-01
  consolidated_balance: string; // soma dos saldos de todas as contas
  income: string;
  expense: string;
  net_result: string;
  accounts: AccountBalanceDTO[];
}

// -----------------------------------------------------------------------------
// getDashboardSummary
// -----------------------------------------------------------------------------

const DashboardInput = z
  .object({
    /** Mês de referência no formato `YYYY-MM`. Default: mês corrente. */
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "month deve ser YYYY-MM")
      .optional(),
  })
  .optional();

function resolveReferenceMonth(month: string | undefined): string {
  if (month) return `${month}-01`;
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// Aritmética monetária centralizada em src/lib/finance/money.ts

export const getDashboardSummary = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => DashboardInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const referenceMonth = resolveReferenceMonth(data?.month);

    const [balancesRes, dreRes] = await Promise.all([
      sb
        .from("account_balances")
        .select(
          "account_id, account_name, account_type, balance, transactions_count, last_movement_on",
        )
        .order("account_name", { ascending: true }),
      sb
        .from("monthly_dre")
        .select("income, expense, net_result")
        .eq("reference_month", referenceMonth)
        .maybeSingle(),
    ]);

    if (balancesRes.error) throw new Error(balancesRes.error.message);
    if (dreRes.error) throw new Error(dreRes.error.message);

    const accounts = (balancesRes.data ?? []) as AccountBalanceDTO[];
    const consolidated_balance = accounts.reduce(
      (acc, a) => addAmounts(acc, a.balance ?? "0.00"),
      "0.00",
    );

    const dre = dreRes.data ?? { income: "0.00", expense: "0.00", net_result: "0.00" };

    const summary: DashboardSummaryDTO = {
      reference_month: referenceMonth,
      consolidated_balance,
      income: dre.income ?? "0.00",
      expense: dre.expense ?? "0.00",
      net_result: dre.net_result ?? "0.00",
      accounts,
    };
    return summary;
  });

// -----------------------------------------------------------------------------
// getMonthlyDreHistory — últimos N meses para o gráfico de barras do Dashboard
// -----------------------------------------------------------------------------

export interface MonthlyDreDTO {
  reference_month: string; // YYYY-MM-DD (primeiro dia do mês)
  label: string;           // "Jan/25", "Fev/25", etc.
  income: number;
  expense: number;
  net_result: number;
}

export const getMonthlyDreHistory = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const raw = input as { months?: number } | undefined;
    return { months: typeof raw?.months === "number" ? raw.months : 6 };
  })
  .handler(async ({ data }): Promise<MonthlyDreDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    // Pega os últimos N meses em ordem cronológica
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - (data.months - 1));
    since.setUTCDate(1);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: rows, error } = await sb
      .from("monthly_dre")
      .select("reference_month, income, expense, net_result")
      .gte("reference_month", sinceStr)
      .order("reference_month", { ascending: true });

    if (error) throw new Error(error.message);

    // Preenche meses sem movimento com zeros para a linha do gráfico ficar contínua
    const result: MonthlyDreDTO[] = [];
    for (let i = 0; i < data.months; i++) {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - (data.months - 1 - i));
      d.setUTCDate(1);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const match = (rows ?? []).find((r) => r.reference_month === key);
      result.push({
        reference_month: key,
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
               .replace(".", "").replace(" de ", "/"),
        income: Number(match?.income ?? 0),
        expense: Number(match?.expense ?? 0),
        net_result: Number(match?.net_result ?? 0),
      });
    }
    return result;
  });


export interface OpenInvoiceDTO {
  invoice_id: string;
  account_id: string;
  account_name: string;
  reference_month: string; // YYYY-MM-01
  closing_date: string; // YYYY-MM-DD
  due_date: string; // YYYY-MM-DD
  total_amount: string; // numeric(14,2)
  /** True quando a data atual já passou do closing_date → atenção. */
  past_closing: boolean;
}

export const getOpenCreditCardInvoices = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from("credit_card_invoices")
      .select(
        `id, account_id, reference_month, closing_date, due_date,
         accounts:account_id ( name )`,
      )
      .eq("status", "open")
      .order("due_date", { ascending: true });

    if (error) throw new Error(error.message);

    const invoiceIds = (data ?? []).map((r) => (r as { id: string }).id);
    // Total real: soma de despesas atreladas à fatura menos pagamentos (perna credit).
    const totals = new Map<string, number>();
    if (invoiceIds.length > 0) {
      const { data: expenseRows } = await sb
        .from("transactions")
        .select("invoice_id, amount")
        .in("invoice_id", invoiceIds)
        .eq("kind", "expense");
      for (const r of (expenseRows ?? []) as Array<{ invoice_id: string; amount: string }>) {
        totals.set(r.invoice_id, (totals.get(r.invoice_id) ?? 0) + Number(r.amount));
      }
      const { data: paymentRows } = await sb
        .from("transactions")
        .select("paid_invoice_id, amount, type")
        .in("paid_invoice_id", invoiceIds)
        .eq("kind", "invoice_payment")
        .eq("type", "credit");
      for (const r of (paymentRows ?? []) as Array<{
        paid_invoice_id: string;
        amount: string;
      }>) {
        totals.set(r.paid_invoice_id, (totals.get(r.paid_invoice_id) ?? 0) - Number(r.amount));
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const items: OpenInvoiceDTO[] = (data ?? []).map((r) => {
      const row = r as Record<string, unknown> & {
        accounts?: { name?: string | null } | null;
      };
      const id = row.id as string;
      const closing_date = row.closing_date as string;
      const total = Math.max(0, totals.get(id) ?? 0);
      return {
        invoice_id: id,
        account_id: row.account_id as string,
        account_name: row.accounts?.name ?? "Cartão",
        reference_month: row.reference_month as string,
        closing_date,
        due_date: row.due_date as string,
        total_amount: total.toFixed(2),
        past_closing: today > closing_date,
      };
    });
    return items;
  });

// -----------------------------------------------------------------------------
// getCategoryBreakdown — donut "para onde foi meu dinheiro" no Dashboard
// Consome a view monthly_dre_by_category + enriquece com icon/color da categoria
// -----------------------------------------------------------------------------

export interface CategoryBreakdownDTO {
  category_id: string;
  category_name: string;
  total_amount: number;
  transactions_count: number;
  icon: string | null;
  color: string | null;
}

export const getCategoryBreakdown = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const raw = input as { month?: string; kind?: "income" | "expense" } | undefined;
    return {
      month:
        typeof raw?.month === "string" && /^\d{4}-\d{2}$/.test(raw.month)
          ? raw.month
          : new Date().toISOString().slice(0, 7),
      kind: raw?.kind === "income" ? ("income" as const) : ("expense" as const),
    };
  })
  .handler(async ({ data }): Promise<CategoryBreakdownDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const referenceMonth = `${data.month}-01`;

    const { data: rows, error } = await sb
      .from("monthly_dre_by_category")
      .select("category_id, category_name, total_amount, transactions_count")
      .eq("reference_month", referenceMonth)
      .eq("kind", data.kind)
      .order("total_amount", { ascending: false });

    if (error) throw new Error(error.message);
    if (!rows?.length) return [];

    // Enriquece com icon/color das categorias (uma query em lote)
    const catIds = rows.map((r) => r.category_id);
    const { data: cats } = await sb
      .from("categories")
      .select("id, icon, color")
      .in("id", catIds);

    const catMap = new Map((cats ?? []).map((c) => [c.id, c]));

    return rows.map((r) => ({
      category_id: r.category_id,
      category_name: r.category_name,
      total_amount: Number(r.total_amount),
      transactions_count: Number(r.transactions_count),
      icon: catMap.get(r.category_id)?.icon ?? null,
      color: catMap.get(r.category_id)?.color ?? null,
    }));
  });
