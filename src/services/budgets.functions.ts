/**
 * Server Functions — Budgets (Tetos de gastos por categoria).
 * Consumo derivado em tempo real cruzando transactions kind='expense'.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import { toCents, fromCents, safePercent } from "@/lib/finance/money";

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
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export const listBudgets = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => Input.parse(i ?? {}))
  .handler(async ({ data }): Promise<BudgetDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const now = new Date();
    const month =
      data.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const [y, m] = month.split("-").map(Number);
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data: budgets, error } = await sb
      .from("budgets")
      .select(
        `id, category_id, amount, reference_month,
               categories:category_id ( name, icon )`,
      )
      .eq("user_id", userId)
      .or(`reference_month.is.null,reference_month.eq.${first}`);
    if (error) throw new Error(error.message);

    const catIds = Array.from(new Set((budgets ?? []).map((b) => b.category_id as string)));
    const spentMap = new Map<string, number>(); // cents
    if (catIds.length > 0) {
      const { data: tx } = await sb
        .from("transactions")
        .select("category_id, amount")
        .eq("user_id", userId)
        .eq("kind", "expense")
        .in("category_id", catIds)
        .gte("occurred_on", first)
        .lte("occurred_on", last);
      const spentByCat = new Map<string, bigint>();
      for (const t of (tx ?? []) as Array<{
        category_id: string | null;
        amount: string;
      }>) {
        if (!t.category_id) continue;
        const prev = spentByCat.get(t.category_id) ?? 0n;
        spentByCat.set(t.category_id, prev + toCents(t.amount));
      }
      for (const [k, v] of spentByCat) spentMap.set(k, Number(v));
    }

    return (
      (budgets ?? []) as unknown as Array<{
        id: string;
        category_id: string;
        amount: string;
        reference_month: string | null;
        categories?: { name?: string | null; icon?: string | null } | null;
      }>
    ).map((b) => {
      const amountCents = toCents(b.amount);
      const spentCents = BigInt(spentMap.get(b.category_id) ?? 0);
      const remainingCents = amountCents - spentCents;
      const percent = safePercent(fromCents(spentCents), fromCents(amountCents));
      return {
        id: b.id,
        category_id: b.category_id,
        category_name: b.categories?.name ?? null,
        category_icon: b.categories?.icon ?? null,
        amount: b.amount,
        reference_month: b.reference_month,
        spent: fromCents(spentCents),
        remaining: fromCents(remainingCents),
        percent: Math.round(percent),
      };
    });
  });

const UpsertInput = z.object({
  category_id: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  reference_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .nullable(),
});

export const upsertBudget = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => UpsertInput.parse(i))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const ref = data.reference_month ? `${data.reference_month}-01` : null;
    const normalized = fromCents(toCents(data.amount));
    if (toCents(normalized) <= 0n) throw new Error("Valor do orçamento deve ser maior que zero.");

    // upsert_budget não valida dono de _category_id (só grava com o
    // _user_id que a gente manda) — sem checar aqui, dava pra criar um
    // orçamento vinculado à categoria de outro usuário.
    const { data: cat, error: catErr } = await sb
      .from("categories")
      .select("id")
      .eq("id", data.category_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (catErr) throw new Error(catErr.message);
    if (!cat) throw new Error("Categoria não pertence ao usuário.");

    // budgets_user_cat_month_unique (migration 0006) é um índice de EXPRESSÃO
    // (coalesce(reference_month, ...)) — supabase-js .upsert() só sabe montar
    // ON CONFLICT com lista simples de colunas, não consegue direcionar para
    // um índice de expressão. RPC faz o INSERT ... ON CONFLICT direto em SQL
    // (migration 0017), onde isso é suportado nativamente.
    const { error } = await sb.rpc("upsert_budget", {
      _user_id: userId,
      _category_id: data.category_id,
      _amount: normalized,
      _reference_month: ref,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { error, data: deleted } = await sb
      .from("budgets")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Orçamento não encontrado ou não pertence ao usuário.");
    }
    return { ok: true };
  });
