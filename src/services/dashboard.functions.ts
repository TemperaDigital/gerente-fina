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

/** Soma duas strings `numeric(14,2)` em precisão decimal exata. */
function addAmount(a: string, b: string): string {
  const toCents = (s: string): bigint => {
    const [i, f = ""] = s.replace(/^\+/, "").split(".");
    const frac = (f + "00").slice(0, 2);
    const neg = i.startsWith("-");
    const intAbs = neg ? i.slice(1) : i;
    const cents = BigInt(intAbs) * 100n + BigInt(frac);
    return neg ? -cents : cents;
  };
  const cents = toCents(a) + toCents(b);
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? "-" : ""}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, "0")}`;
}

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
      (acc, a) => addAmount(acc, a.balance ?? "0.00"),
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
// getOpenCreditCardInvoices — widget de cartões no Dashboard
// -----------------------------------------------------------------------------

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
        `id, account_id, reference_month, closing_date, due_date, total_amount,
         accounts:account_id ( name )`,
      )
      .eq("status", "open")
      .order("due_date", { ascending: true });

    if (error) throw new Error(error.message);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const items: OpenInvoiceDTO[] = (data ?? []).map((r) => {
      const row = r as Record<string, unknown> & {
        accounts?: { name?: string | null } | null;
      };
      const closing_date = row.closing_date as string;
      return {
        invoice_id: row.id as string,
        account_id: row.account_id as string,
        account_name: row.accounts?.name ?? "Cartão",
        reference_month: row.reference_month as string,
        closing_date,
        due_date: row.due_date as string,
        total_amount: (row.total_amount as string) ?? "0.00",
        past_closing: today > closing_date,
      };
    });
    return items;
  });
