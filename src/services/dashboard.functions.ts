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
