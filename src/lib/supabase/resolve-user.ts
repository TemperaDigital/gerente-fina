/**
 * Resolve o ID do usuário autenticado da requisição atual.
 *
 * SERVER ONLY — deve ser chamado dentro de `.handler()` de uma server
 * function (contexto de request do TanStack Start).
 *
 * Estratégia:
 *   1. Lê o cookie `gerentefina-auth` (JWT access_token) sincronizado
 *      pelo cliente via `onAuthStateChange` em `src/lib/supabase/client.ts`.
 *   2. Valida o token com `supabaseAdmin.auth.getUser(token)` — re-verifica
 *      com o Auth server, não confia no client.
 *   3. Retorna `user.id`. Se ausente ou inválido, lança "UNAUTHENTICATED".
 *
 * NÃO usa mais o seed `primopobre@gmail.com`. Auth real é obrigatória.
 */
import { getCookie } from "@tanstack/react-start/server";

export const AUTH_COOKIE = "gerentefina-auth";

export async function resolveActiveUserId(): Promise<string> {
  const token = getCookie(AUTH_COOKIE);
  if (!token) {
    throw new Error("UNAUTHENTICATED");
  }
  const { getSupabaseAdmin } = await import("./client.server");
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error("UNAUTHENTICATED");
  }
  return data.user.id;
}
