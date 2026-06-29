/**
 * Server Functions — Budgets (Tetos de gastos por categoria).
 * Consumo derivado em tempo real cruzando transactions kind='expense'.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

export interface BudgetDTO {
  id: string;
  category_id: string;
  category_name: string | null;
  category_icon: string | null;
  amount: string;
  reference_month: string | null;
  spent: string;
  remaining: string;
  percent: number;
}


const Input = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const listBudgets = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => Input.parse(i ?? {}))
  .handler(async ({ data }): Promise<BudgetDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const now = new Date();
    const month = data.month ??
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const [y, m] = month.split("-").map(Number);
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data: budgets, error } = await sb
      .from("budgets")
      .select(`id, category_id, amount, reference_month,
               categories:category_id ( name, icon )`)
      .or(`reference_month.is.null,reference_month.eq.${first}`);
    if (error) throw new Error(error.message);

    const catIds = Array.from(
      new Set((budgets ?? []).map((b) => b.category_id as string)),
    );
    const spentMap = new Map<string, number>(); // cents
    if (catIds.length > 0) {
      const { data: tx } = await sb
        .from("transactions")
        .select("category_id, amount")
        .eq("kind", "expense")
        .in("category_id", catIds)
        .gte("occurred_on", first)
        .lte("occurred_on", last);
      for (const t of (tx ?? []) as Array<{
        category_id: string | null;
        amount: string;
      }>) {
        if (!t.category_id) continue;
        const prev = spentMap.get(t.category_id) ?? 0;
        spentMap.set(t.category_id, prev + Math.round(Number(t.amount) * 100));
      }
    }

    return ((budgets ?? []) as unknown as Array<{
      id: string;
      category_id: string;
      amount: string;
      reference_month: string | null;
      categories?: { name?: string | null; icon?: string | null } | null;
    }>).map((b) => {
      const amountCents = Math.round(Number(b.amount) * 100);
      const spentCents = spentMap.get(b.category_id) ?? 0;
      const remainingCents = amountCents - spentCents;
      const percent = amountCents > 0
        ? Math.min(100, Math.round((spentCents / amountCents) * 100))
        : 0;
      return {
        id: b.id,
        category_id: b.category_id,
        category_name: b.categories?.name ?? null,
        category_icon: b.categories?.icon ?? null,
        amount: b.amount,
        reference_month: b.reference_month,
        spent: (spentCents / 100).toFixed(2),
        remaining: (remainingCents / 100).toFixed(2),
        percent,
      };
    });
  });

const UpsertInput = z.object({
  category_id: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  reference_month: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
});

export const upsertBudget = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => UpsertInput.parse(i))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const ref = data.reference_month ? `${data.reference_month}-01` : null;
    const { error } = await sb.from("budgets").upsert(
      {
        user_id: userId,
        category_id: data.category_id,
        amount: data.amount,
        reference_month: ref,
      },
      { onConflict: "user_id,category_id,reference_month" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("budgets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
