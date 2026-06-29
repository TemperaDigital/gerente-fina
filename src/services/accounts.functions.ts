/**
 * Server Functions — Accounts (CRUD patrimonial).
 *
 * Lê saldo derivado da VIEW `account_balances`. Escreve na tabela única
 * `accounts` (cash | bank | credit_card). Cartão exige closing_day,
 * due_day e credit_limit_cents (BIGINT em centavos — §3 da Constituição).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

export type AccountType = "cash" | "bank" | "credit_card";

export interface AccountWithBalanceDTO {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  color: string | null;
  icon: string | null;
  credit_limit_cents: number | null;
  closing_day: number | null;
  due_day: number | null;
  archived_at: string | null;
  balance: string; // numeric(14,2) — saldo derivado
  transactions_count: number;
  last_movement_on: string | null;
  created_at: string;
}


// ---------------------------------------------------------------------------
// listAccounts
// ---------------------------------------------------------------------------
const ListInput = z.object({
  type: z.enum(["cash", "bank", "credit_card"]).optional(),
  include_archived: z.boolean().default(false),
});

export const listAccounts = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ListInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<AccountWithBalanceDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    let q = sb
      .from("accounts")
      .select(
        "id, name, type, institution, color, icon, credit_limit_cents, closing_day, due_day, archived_at, created_at",
      )
      .order("name", { ascending: true });
    if (data.type) q = q.eq("type", data.type);
    if (!data.include_archived) q = q.is("archived_at", null);

    const { data: accts, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (accts ?? []).map((a) => a.id);
    const balanceMap = new Map<
      string,
      { balance: string; count: number; last: string | null }
    >();
    if (ids.length > 0) {
      const { data: bals, error: bErr } = await sb
        .from("account_balances")
        .select("account_id, balance, transactions_count, last_movement_on")
        .in("account_id", ids);
      if (bErr) throw new Error(bErr.message);
      for (const b of (bals ?? []) as Array<{
        account_id: string;
        balance: string;
        transactions_count: number;
        last_movement_on: string | null;
      }>) {
        balanceMap.set(b.account_id, {
          balance: b.balance ?? "0.00",
          count: b.transactions_count ?? 0,
          last: b.last_movement_on,
        });
      }
    }

    return (accts ?? []).map((a) => {
      const b = balanceMap.get(a.id);
      return {
        id: a.id,
        name: a.name,
        type: a.type as AccountType,
        institution: a.institution,
        color: a.color,
        icon: a.icon,
        credit_limit_cents: a.credit_limit_cents,
        closing_day: a.closing_day,
        due_day: a.due_day,
        archived_at: a.archived_at,
        balance: b?.balance ?? "0.00",
        transactions_count: b?.count ?? 0,
        last_movement_on: b?.last ?? null,
        created_at: a.created_at,
      };
    });
  });

// ---------------------------------------------------------------------------
// createAccount / updateAccount / archiveAccount
// ---------------------------------------------------------------------------
const day = z.number().int().min(1).max(31);

const CreateInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(["cash", "bank", "credit_card"]),
    institution: z.string().trim().max(80).optional().nullable(),
    color: z.string().trim().max(20).optional().nullable(),
    icon: z.string().optional().nullable(),
    credit_limit_cents: z.number().int().nonnegative().optional().nullable(),
    closing_day: day.optional().nullable(),
    due_day: day.optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "credit_card") {
      if (!v.closing_day || !v.due_day || v.credit_limit_cents == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Cartão exige limite, dia de fechamento e dia de vencimento.",
        });
      }
    } else {
      if (v.closing_day || v.due_day || v.credit_limit_cents != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Apenas cartões podem ter limite/fechamento/vencimento.",
        });
      }
    }
  });

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: row, error } = await sb
      .from("accounts")
      .insert({
        user_id: userId,
        name: data.name,
        type: data.type,
        institution: data.institution ?? null,
        color: data.color ?? null,
        icon: data.icon ?? null,
        credit_limit_cents: data.credit_limit_cents ?? null,
        closing_day: data.closing_day ?? null,
        due_day: data.due_day ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const UpdateInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    institution: z.string().trim().max(80).optional().nullable(),
    color: z.string().trim().max(20).optional().nullable(),
    icon: z.string().optional().nullable(),
    credit_limit_cents: z.number().int().nonnegative().optional().nullable(),
    closing_day: day.optional().nullable(),
    due_day: day.optional().nullable(),
  });

export const updateAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const { error } = await sb
      .from("accounts")
      .update({
        name: data.name,
        institution: data.institution ?? null,
        color: data.color ?? null,
        icon: data.icon ?? null,
        credit_limit_cents: data.credit_limit_cents ?? null,
        closing_day: data.closing_day ?? null,
        due_day: data.due_day ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from("accounts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
