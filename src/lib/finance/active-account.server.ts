/**
 * Resolve a conta ativa padrão do usuário — SERVER ONLY.
 *
 * Fonte única da verdade usada pelo Chat IA e pelo Importador CSV para
 * garantir que ambos operem sobre a mesma conta quando o usuário não
 * seleciona explicitamente uma alternativa.
 *
 * Regra: prioriza bank/cash sobre credit_card, ordenado por created_at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActiveAccount {
  id: string;
  name: string;
  type: "cash" | "bank" | "credit_card";
}

export async function resolveActiveAccount(
  sb: SupabaseClient,
  userId: string,
): Promise<ActiveAccount> {
  const { data, error } = await sb
    .from("accounts")
    .select("id, name, type, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Falha ao listar contas: ${error.message}`);

  const list = (data ?? []) as ActiveAccount[];
  if (list.length === 0) {
    throw new Error(
      "Nenhuma conta ativa cadastrada. Cadastre uma conta em /accounts antes de lançar transações.",
    );
  }

  const preferred = list.find((a) => a.type === "bank" || a.type === "cash");
  return preferred ?? list[0];
}

export async function accountBelongsToUser(
  sb: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("id", accountId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`Falha ao validar conta: ${error.message}`);
  return !!data;
}
