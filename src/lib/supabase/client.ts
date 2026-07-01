/**
 * Cliente Supabase do NAVEGADOR (browser-only).
 *
 * Usar somente em componentes React, hooks de cliente, event handlers e
 * subscriptions de realtime. RLS aplica-se como o usuário autenticado.
 *
 * Sincroniza o access_token em um cookie `gerentefina-auth` para que os
 * server functions do TanStack Start possam identificar o usuário via SSR.
 */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export const AUTH_COOKIE = "gerentefina-auth";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Sync JWT access token → cookie readable by server functions.
if (typeof window !== "undefined") {
  const writeCookie = (token: string | null) => {
    const base = `${AUTH_COOKIE}=`;
    if (!token) {
      document.cookie = `${base}; Path=/; Max-Age=0; SameSite=Lax`;
    } else {
      // 1 dia — o autoRefreshToken renova antes de expirar.
      document.cookie = `${base}${encodeURIComponent(token)}; Path=/; Max-Age=86400; SameSite=Lax`;
    }
  };

  // Sincroniza estado inicial.
  void supabase.auth.getSession().then(({ data }) => {
    writeCookie(data.session?.access_token ?? null);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    writeCookie(session?.access_token ?? null);
  });
}
