/**
 * Cliente Supabase do NAVEGADOR (browser-only).
 *
 * Usar somente em componentes React, hooks de cliente, event handlers e
 * subscriptions de realtime. RLS aplica-se como o usuário autenticado.
 */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
