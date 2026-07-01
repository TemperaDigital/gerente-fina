/**
 * Server Functions — Forecast (Motor Preditivo Real).
 *
 * Algoritmo:
 *   1. Saldo consolidado atual = SUM(account_balances.balance)
 *   2. Média Móvel Diária de despesas = SUM(transactions expense últimos 90d) / 90
 *   3. Parcelas em aberto = installment_items sem transaction_id, com due_date futuro
 *   4. Projeção: para cada dia D nos próximos 90 dias:
 *        saldo(D) = saldo(D-1) - daily_burn - sum(parcelas vencendo em D)
 *
 * Toda aritmética em BigInt de centavos (money.ts); saída em string numeric(14,2).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addAmounts, fromCents, toCents } from "@/lib/finance/money";

const HORIZON_DAYS = 90;
const HISTORY_DAYS = 90;

export interface ForecastPointDTO {
  date: string; // YYYY-MM-DD
  daily_burn: string;
  installments_due: string;
  net_change: string;
  projected_balance: string;
}

export interface ForecastResultDTO {
  current_balance: string;
  avg_daily_expense: string;
  total_installments_pending: string;
  final_projected_balance: string;
  days_of_runway: number | null;
  points: ForecastPointDTO[];
}

const Input = z
  .object({
    days: z.number().int().min(30).max(180).default(HORIZON_DAYS),
  })
  .optional();

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

export const getForecast = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<ForecastResultDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const horizon = data?.days ?? HORIZON_DAYS;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const historyStart = addDays(today, -HISTORY_DAYS);
    const horizonEnd = addDays(today, horizon);

    // 1) Saldo consolidado atual
    const { data: balances, error: balErr } = await sb
      .from("account_balances")
      .select("balance");
    if (balErr) throw new Error(`account_balances: ${balErr.message}`);
    let currentBalance = "0.00";
    for (const b of (balances ?? []) as Array<{ balance: string | null }>) {
      currentBalance = addAmounts(currentBalance, b.balance ?? "0.00");
    }

    // 2) Histórico de despesas (últimos 90 dias) → média móvel diária
    const { data: hist, error: histErr } = await sb
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .eq("kind", "expense")
      .gte("occurred_on", iso(historyStart))
      .lt("occurred_on", iso(today));
    if (histErr) throw new Error(`transactions history: ${histErr.message}`);

    let totalExpenseCents = 0n;
    for (const r of (hist ?? []) as Array<{ amount: string }>) {
      totalExpenseCents += toCents(r.amount);
    }
    const dailyBurnCents = totalExpenseCents / BigInt(HISTORY_DAYS);
    const avgDailyExpense = fromCents(dailyBurnCents);

    // 3) Parcelas em aberto (sem transaction_id) no horizonte
    const { data: items, error: itemsErr } = await sb
      .from("installment_items")
      .select("amount, due_date")
      .eq("user_id", userId)
      .is("transaction_id", null)
      .gte("due_date", iso(today))
      .lte("due_date", iso(horizonEnd));
    if (itemsErr) throw new Error(`installment_items: ${itemsErr.message}`);

    const installmentsByDay = new Map<string, bigint>();
    let totalPendingCents = 0n;
    for (const it of (items ?? []) as Array<{ amount: string; due_date: string }>) {
      const c = toCents(it.amount);
      totalPendingCents += c;
      installmentsByDay.set(
        it.due_date,
        (installmentsByDay.get(it.due_date) ?? 0n) + c,
      );
    }

    // 4) Projeção dia a dia
    let runningCents = toCents(currentBalance);
    const points: ForecastPointDTO[] = [];
    let daysOfRunway: number | null = null;

    for (let i = 1; i <= horizon; i++) {
      const d = addDays(today, i);
      const dateStr = iso(d);
      const instCents = installmentsByDay.get(dateStr) ?? 0n;
      const changeCents = -(dailyBurnCents + instCents);
      runningCents += changeCents;

      if (daysOfRunway === null && runningCents < 0n) daysOfRunway = i;

      points.push({
        date: dateStr,
        daily_burn: fromCents(dailyBurnCents),
        installments_due: fromCents(instCents),
        net_change: fromCents(changeCents),
        projected_balance: fromCents(runningCents),
      });
    }

    return {
      current_balance: currentBalance,
      avg_daily_expense: avgDailyExpense,
      total_installments_pending: fromCents(totalPendingCents),
      final_projected_balance: fromCents(runningCents),
      days_of_runway: daysOfRunway,
      points,
    };
  });
