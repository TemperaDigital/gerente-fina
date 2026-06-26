/**
 * Server Functions — Recurrences (CRUD básico + toggle ativo).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface RecurrenceDTO {
  id: string;
  account_id: string;
  account_name: string | null;
  category_id: string;
  category_name: string | null;
  kind: "income" | "expense";
  type: "credit" | "debit";
  amount: string;
  description: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval_count: number;
  day_of_month: number | null;
  start_on: string;
  end_on: string | null;
  next_run_on: string;
  active: boolean;
}

let cachedUserId: string | null = null;
async function resolveUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error(error.message);
  const u = data.users?.[0];
  if (!u) throw new Error("Nenhum usuário.");
  cachedUserId = u.id;
  return u.id;
}

export const listRecurrences = createServerFn({ method: "GET" }).handler(
  async (): Promise<RecurrenceDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("recurrences")
      .select(
        `id, account_id, category_id, kind, type, amount, description,
         frequency, interval_count, day_of_month, start_on, end_on, next_run_on, active,
         accounts:account_id ( name ),
         categories:category_id ( name )`,
      )
      .order("next_run_on", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Array<RecurrenceDTO & {
      accounts?: { name?: string | null } | null;
      categories?: { name?: string | null } | null;
    }>).map((r) => ({
      ...r,
      account_name: r.accounts?.name ?? null,
      category_name: r.categories?.name ?? null,
    }));
  },
);

const CreateInput = z.object({
  account_id: z.string().uuid(),
  category_id: z.string().uuid(),
  kind: z.enum(["income", "expense"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  description: z.string().trim().min(1).max(240),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval_count: z.number().int().min(1).max(60).default(1),
  day_of_month: z.number().int().min(1).max(31).optional().nullable(),
  start_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const createRecurrence = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveUserId();
    const type = data.kind === "income" ? "credit" : "debit";
    const { error } = await sb.from("recurrences").insert({
      user_id: userId,
      account_id: data.account_id,
      category_id: data.category_id,
      kind: data.kind,
      type,
      amount: data.amount,
      description: data.description,
      frequency: data.frequency,
      interval_count: data.interval_count,
      day_of_month: data.day_of_month ?? null,
      start_on: data.start_on,
      end_on: data.end_on ?? null,
      next_run_on: data.start_on,
      active: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleRecurrenceActive = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from("recurrences")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRecurrence = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("recurrences").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
