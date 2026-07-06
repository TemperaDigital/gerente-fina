/**
 * Server Functions — Lookups (contas e categorias) para filtros e formulários.
 * Headless. Retorna DTOs serializáveis com campos mínimos para UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

export interface AccountLookupDTO {
  id: string;
  name: string;
  type: "cash" | "bank" | "credit_card";
  closing_day: number | null;
  due_day: number | null;
}

export interface CategoryLookupDTO {
  id: string;
  name: string;
  kind: "income" | "expense";
  parent_id: string | null;
  icon: string | null;
  color: string | null;
}

export const getAccountsLookup = createServerFn({ method: "GET" }).handler(async () => {
  const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
  const sb = getSupabaseAdmin();
  const userId = await resolveActiveUserId();
  const { data, error } = await sb
    .from("accounts")
    .select("id, name, type, closing_day, due_day")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountLookupDTO[];
});

export const getCategoriesLookup = createServerFn({ method: "GET" }).handler(async () => {
  const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
  const sb = getSupabaseAdmin();
  const userId = await resolveActiveUserId();
  const { data, error } = await sb
    .from("categories")
    .select("id, name, kind, parent_id, icon, color")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryLookupDTO[];
});
