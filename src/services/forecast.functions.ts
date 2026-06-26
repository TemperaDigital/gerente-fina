/**
 * Server Functions — Forecast (projeção simples de fluxo de caixa).
 * Baseia-se em recorrências ativas e parcelas futuras (installment_items
 * ainda sem transaction_id). Sem ML — soma determinística por dia.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface ForecastPointDTO {
  date: string; // YYYY-MM-DD
  income: string;
  expense: string;
  net: string;
  cumulative: string;
}

const Input = z.object({
  days: z.number().int().min(7).max(180).default(60),
});

function fmt(cents: number): string {
  const neg = cents < 0;
  const a = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

function addDay(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setUTCDate(nd.getUTCDate() + n);
  return nd;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const getForecast = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => Input.parse(i ?? {}))
  .handler(async ({ data }): Promise<ForecastPointDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const horizon = addDay(today, data.days);

    // 1) Saldo atual consolidado (cents)
    const { data: bals } = await sb
      .from("account_balances")
      .select("balance");
    let cumulativeCents = 0;
    for (const b of (bals ?? []) as Array<{ balance: string }>) {
      cumulativeCents += Math.round(Number(b.balance ?? 0) * 100);
    }

    // 2) Recorrências ativas
    const { data: recs } = await sb
      .from("recurrences")
      .select(
        "kind, amount, frequency, interval_count, day_of_month, start_on, end_on, next_run_on, active",
      )
      .eq("active", true);

    // 3) Parcelas futuras pendentes (sem transaction_id ainda)
    const { data: items } = await sb
      .from("installment_items")
      .select("amount, due_date, transaction_id")
      .is("transaction_id", null)
      .gte("due_date", iso(today))
      .lte("due_date", iso(horizon));

    // bucket por dia
    const buckets = new Map<string, { inc: number; exp: number }>();
    const bump = (date: string, kind: "income" | "expense", cents: number) => {
      const b = buckets.get(date) ?? { inc: 0, exp: 0 };
      if (kind === "income") b.inc += cents;
      else b.exp += cents;
      buckets.set(date, b);
    };

    // Recorrências — iterar dia a dia até horizonte
    for (const r of (recs ?? []) as Array<{
      kind: "income" | "expense";
      amount: string;
      frequency: "daily" | "weekly" | "monthly" | "yearly";
      interval_count: number;
      day_of_month: number | null;
      start_on: string;
      end_on: string | null;
      next_run_on: string;
    }>) {
      const cents = Math.round(Number(r.amount) * 100);
      const end = r.end_on ? new Date(r.end_on + "T00:00:00Z") : horizon;
      const cap = end < horizon ? end : horizon;
      const cur = new Date(r.next_run_on + "T00:00:00Z");
      // safety cap iterations
      let i = 0;
      while (cur <= cap && i < 400) {
        if (cur >= today) bump(iso(cur), r.kind, cents);
        if (r.frequency === "daily")
          cur.setUTCDate(cur.getUTCDate() + r.interval_count);
        else if (r.frequency === "weekly")
          cur.setUTCDate(cur.getUTCDate() + 7 * r.interval_count);
        else if (r.frequency === "monthly")
          cur.setUTCMonth(cur.getUTCMonth() + r.interval_count);
        else cur.setUTCFullYear(cur.getUTCFullYear() + r.interval_count);
        i++;
      }
    }

    // Parcelas pendentes
    for (const it of (items ?? []) as Array<{
      amount: string;
      due_date: string;
    }>) {
      bump(it.due_date, "expense", Math.round(Number(it.amount) * 100));
    }

    // Linhas dia a dia
    const out: ForecastPointDTO[] = [];
    for (let i = 0; i <= data.days; i++) {
      const d = iso(addDay(today, i));
      const b = buckets.get(d) ?? { inc: 0, exp: 0 };
      const net = b.inc - b.exp;
      cumulativeCents += net;
      out.push({
        date: d,
        income: fmt(b.inc),
        expense: fmt(b.exp),
        net: fmt(net),
        cumulative: fmt(cumulativeCents),
      });
    }
    return out;
  });
