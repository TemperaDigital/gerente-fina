/**
 * Resolve o usuário ativo do sistema (modo monousuário).
 *
 * Enquanto o fluxo de auth não está plugado, garantimos que SEMPRE exista
 * pelo menos o usuário de testes "primopobre@gmail.com" no auth.users do
 * Supabase. Se ninguém estiver cadastrado, criamos o seed e usamos seu id.
 *
 * SERVER ONLY — usa service_role via getSupabaseAdmin().
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const SEED_EMAIL = "primopobre@gmail.com";
const SEED_PASSWORD = "PrimoPobre#2026!Seed";

let cachedUserId: string | null = null;

export async function resolveActiveUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const { getSupabaseAdmin } = await import("./client.server");
  const sb = getSupabaseAdmin();

  // 1) procura qualquer usuário existente
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (error) throw new Error(`Falha ao listar usuários: ${error.message}`);

  // 1a) prioriza o seed se existir
  const seed = data.users?.find((u) => u.email?.toLowerCase() === SEED_EMAIL);
  if (seed) {
    cachedUserId = seed.id;
    return seed.id;
  }

  // 1b) usa qualquer outro usuário já criado
  const any = data.users?.[0];
  if (any) {
    cachedUserId = any.id;
    return any.id;
  }

  // 2) cria o seed primopobre
  cachedUserId = await createSeedUser(sb);
  return cachedUserId;
}

async function createSeedUser(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Primo Pobre (Teste)", seed: true },
  });
  if (error || !data.user) {
    throw new Error(
      `Falha ao criar usuário seed (${SEED_EMAIL}): ${error?.message ?? "sem dados"}`,
    );
  }
  return data.user.id;
}
