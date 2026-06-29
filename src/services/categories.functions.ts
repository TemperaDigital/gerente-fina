/**
 * Server Functions — Categories (CRUD).
 * Suporta subcategorias via parent_id. Sem limites em `icon` (Base64 Constituição §4).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

export interface CategoryDTO {
  id: string;
  name: string;
  kind: "income" | "expense";
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  archived_at: string | null;
}


export const listCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<CategoryDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("categories")
      .select("id, name, kind, parent_id, icon, color, archived_at")
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CategoryDTO[];
  },
);

const CreateInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["income", "expense"]),
  parent_id: z.string().uuid().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().trim().max(20).optional().nullable(),
});

export const createCategory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { data: row, error } = await sb
      .from("categories")
      .insert({
        user_id: userId,
        name: data.name,
        kind: data.kind,
        parent_id: data.parent_id ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const UpdateInput = CreateInput.extend({ id: z.string().uuid() });

export const updateCategory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from("categories")
      .update({
        name: data.name,
        kind: data.kind,
        parent_id: data.parent_id ?? null,
        icon: data.icon ?? null,
        color: data.color ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveCategory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from("categories")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
