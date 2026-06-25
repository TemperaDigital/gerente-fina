/**
 * Cliente Supabase ADMIN (service_role) — SERVER ONLY.
 *
 * O sufixo `.server.ts` faz o bundler do TanStack Start barrar este módulo
 * em qualquer caminho de import alcançável pelo cliente. Importe APENAS
 * dentro de `.handler()` de server functions via `await import(...)`, e
 * apenas para operações verdadeiramente privilegiadas (Auth Admin, grants,
 * jobs de manutenção, webhooks verificados).
 *
 * NUNCA use como cliente padrão de leitura/escrita do app — para isso,
 * server functions devem usar `requireSupabaseAuth` (RLS como o usuário).
 */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

const serviceRoleKey = process.env.GERENTEFINA_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error(
    "GERENTEFINA_SERVICE_ROLE_KEY ausente. Configure o secret no painel da Lovable.",
  );
}

export const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
