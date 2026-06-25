/**
 * Configuração pública do Supabase (Projeto Gerente Fina).
 *
 * Estas constantes são PUBLISHABLE por design: a anon key e a URL do projeto
 * são expostas a qualquer cliente do navegador. A segurança real do dado é
 * garantida pelas RLS policies escopadas em `auth.uid()`. Nunca coloque a
 * `service_role` aqui — ela vive apenas como secret server-only
 * (`GERENTEFINA_SERVICE_ROLE_KEY`) e é lida exclusivamente em
 * `client.server.ts` dentro de handlers de server functions.
 */

export const SUPABASE_URL = "https://paxfjesglnaxaolvpgup.supabase.co";

// JWT anon key (formato clássico, compatível com supabase-js).
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheGZqZXNnbG5heGFvbHZwZ3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjE5NTMsImV4cCI6MjA5NzkzNzk1M30.K0KRPpjolKFAbdS3RsCoDQLr2VU3AEJA9NX-ADJeKnY";

// Nova publishable key (formato sb_publishable_*). Mantida como referência.
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NmbbNXW_J_GoV_lEeQzgoQ_Dc8KtI5G";

export const SUPABASE_PROJECT_REF = "paxfjesglnaxaolvpgup";
