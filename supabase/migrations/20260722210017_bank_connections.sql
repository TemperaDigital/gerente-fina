-- =============================================================================
-- Migration 0018 — bank_connections (Open Finance)
-- =============================================================================
-- Contexto (Missão 30 — auditoria de isolamento entre usuários): a tela
-- /open-finance (src/routes/_app.open-finance.tsx) já falava com esta tabela
-- desde antes desta migration, mas ela NUNCA existiu no banco (confirmado
-- via SQL Editor: information_schema.columns e pg_policies retornam 0 linhas
-- para "bank_connections") — foi criada fora do controle de versão deste
-- projeto, ou nunca chegou a ser criada de fato. Esta migration cria a
-- tabela do zero, já com RLS + policies escopadas por user_id, no mesmo
-- padrão de `budgets` (migration 0006).
--
-- A refatoração de src/routes/_app.open-finance.tsx (que passa a falar com
-- esta tabela via server function + service_role, não mais client anon key
-- direto do navegador) está no mesmo commit desta migration.
-- =============================================================================

create table public.bank_connections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  provider_item_id   text not null,
  institution_name   text not null,
  status             text not null default 'UPDATED'
                        check (status in ('OUTDATED','UPDATED','LOGIN_ERROR')),
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint bank_connections_user_item_unique unique (user_id, provider_item_id)
);

create index bank_connections_user_idx on public.bank_connections (user_id);

grant select, insert, update, delete on public.bank_connections to authenticated;
grant all on public.bank_connections to service_role;

alter table public.bank_connections enable row level security;

create policy "bank_connections_select_own" on public.bank_connections
  for select to authenticated using (auth.uid() = user_id);
create policy "bank_connections_insert_own" on public.bank_connections
  for insert to authenticated with check (auth.uid() = user_id);
create policy "bank_connections_update_own" on public.bank_connections
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bank_connections_delete_own" on public.bank_connections
  for delete to authenticated using (auth.uid() = user_id);

create trigger bank_connections_set_updated_at
  before update on public.bank_connections
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- FIM Migration 0018
-- =============================================================================
