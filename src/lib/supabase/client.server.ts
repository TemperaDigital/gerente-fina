/**
 * Cliente Supabase ADMIN (service_role) — SERVER ONLY.
 *
 * O sufixo `.server.ts` faz o bundler do TanStack Start barrar este módulo
 * em qualquer caminho de import alcançável pelo cliente. Importe APENAS
 * dentro de `.handler()` de server functions via `await import(...)`.
 *
 * `getSupabaseAdmin()` é lazy — a checagem do secret só roda no servidor
 * em runtime de request, nunca em build/SSR de módulo.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const serviceRoleKey = process.env.GERENTEFINA_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "GERENTEFINA_SERVICE_ROLE_KEY ausente. Configure o secret no painel da Lovable.",
    );
  }
  cached = createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
