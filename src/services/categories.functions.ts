/**
 * Server Functions — Categories (CRUD).
 * Suporta subcategorias via parent_id. Sem limites em `icon` (Base64 Constituição §4).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import { DEFAULT_CATEGORY_TREE } from "@/lib/finance/default-categories";

export type CategoryNature = "FIXA" | "VARIÁVEL";

export interface CategoryDTO {
  id: string;
  name: string;
  kind: "income" | "expense";
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  nature: CategoryNature | null;
  archived_at: string | null;
}


export const listCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<CategoryDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("categories")
      .select("id, name, kind, parent_id, icon, color, nature, archived_at")
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
  nature: z.enum(["FIXA", "VARIÁVEL"]).optional().nullable(),
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
        nature: data.nature ?? null,
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
        nature: data.nature ?? null,
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

// ---------------------------------------------------------------------------
// seedDefaultCategories — popula o plano de contas padrão (DEFAULT_CATEGORY_TREE)
// para o usuário ativo. Idempotente: casa por (kind, nome) case-insensitive
// tanto no nível raiz quanto por subcategoria dentro do pai — rodar de novo
// nunca duplica, só preenche o que ainda falta.
// ---------------------------------------------------------------------------
export const seedDefaultCategories = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ created: number; skipped: number }> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: existing, error: exErr } = await sb
      .from("categories")
      .select("id, parent_id, name, kind")
      .is("archived_at", null);
    if (exErr) throw new Error(exErr.message);

    const existingRows = (existing ?? []) as Array<{
      id: string;
      parent_id: string | null;
      name: string;
      kind: string;
    }>;

    let created = 0;
    let skipped = 0;

    for (const group of DEFAULT_CATEGORY_TREE) {
      let parentId: string;
      const existingParent = existingRows.find(
        (c) =>
          c.parent_id === null &&
          c.kind === group.kind &&
          c.name.toLowerCase() === group.name.toLowerCase(),
      );

      if (existingParent) {
        parentId = existingParent.id;
        skipped++;
      } else {
        const { data: createdParent, error: cErr } = await sb
          .from("categories")
          .insert({
            user_id: userId,
            name: group.name,
            kind: group.kind,
            nature: group.nature,
            icon: group.icon,
          })
          .select("id")
          .single();
        if (cErr) throw new Error(`Falha ao criar "${group.name}": ${cErr.message}`);
        parentId = createdParent.id;
        existingRows.push({ id: parentId, parent_id: null, name: group.name, kind: group.kind });
        created++;
      }

      const childNameSet = new Set(
        existingRows
          .filter((c) => c.parent_id === parentId)
          .map((c) => c.name.toLowerCase()),
      );

      for (const childName of group.children) {
        if (childNameSet.has(childName.toLowerCase())) {
          skipped++;
          continue;
        }
        const { error: chErr } = await sb.from("categories").insert({
          user_id: userId,
          name: childName,
          kind: group.kind,
          nature: group.nature,
          parent_id: parentId,
        });
        if (chErr) throw new Error(`Falha ao criar "${childName}": ${chErr.message}`);
        childNameSet.add(childName.toLowerCase());
        created++;
      }
    }

    return { created, skipped };
  });
