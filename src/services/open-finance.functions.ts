/**
 * Server Functions — Open Finance (conexões bancárias).
 *
 * Substitui o acesso direto ao Supabase pelo client anon key no navegador
 * (achado da Missão 30 — auditoria de isolamento entre usuários) pelo mesmo
 * padrão do resto do app: createServerFn + service_role + checagem de
 * user_id. `bank_connections` tem RLS própria (migration 0018) como defesa
 * em profundidade, mas a proteção real — como em toda outra tabela deste
 * projeto — é o filtro explícito abaixo, já que `getSupabaseAdmin()` ignora
 * RLS por completo.
 *
 * Sem credenciais Pluggy/Belvo ainda (Missão 31) — toda conexão criada por
 * aqui é `status: "MANUAL"` (cadastro de referência, sem sincronização
 * automática). `OUTDATED`/`UPDATED`/`LOGIN_ERROR` ficam reservados pro dia
 * em que uma integração real existir; `createBankConnection` não aceita
 * esses valores do cliente de propósito.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

export type BankConnectionStatus = "MANUAL" | "OUTDATED" | "UPDATED" | "LOGIN_ERROR";

export interface BankConnectionDTO {
  id: string;
  provider_item_id: string;
  institution_name: string;
  status: BankConnectionStatus;
  last_synced_at: string | null;
}

export const listBankConnections = createServerFn({ method: "GET" }).handler(
  async (): Promise<BankConnectionDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data, error } = await sb
      .from("bank_connections")
      .select("id, provider_item_id, institution_name, status, last_synced_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as BankConnectionDTO[];
  },
);

const CreateInput = z.object({
  institution_name: z.string().trim().min(1).max(120),
});

export const createBankConnection = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: row, error } = await sb
      .from("bank_connections")
      .insert({
        user_id: userId,
        provider_item_id: `manual_${crypto.randomUUID()}`,
        institution_name: data.institution_name,
        status: "MANUAL",
        last_synced_at: null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const disconnectBankConnection = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { error, data: deleted } = await sb
      .from("bank_connections")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Conexão não encontrada ou não pertence ao usuário.");
    }
    return { ok: true };
  });
