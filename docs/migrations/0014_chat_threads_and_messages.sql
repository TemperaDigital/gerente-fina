-- =============================================================================
-- Migration 0014 — Histórico de conversas do Chat IA
-- (chat_threads + chat_messages)
--
-- Cada thread agrupa mensagens em ordem cronológica. `user_id` é duplicado
-- em chat_messages (mesmo padrão de installment_items na migration 0003)
-- para manter as policies de RLS simples, sem depender de join com a
-- tabela pai. Nenhuma materialização de saldo aqui — é só histórico de UI.
-- =============================================================================

create table public.chat_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Nulo até que um resumo (gerado pela IA, fora do escopo desta migration)
  -- seja atribuído; a UI usa a prévia da última mensagem enquanto isso.
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index chat_threads_user_updated_idx
  on public.chat_threads (user_id, updated_at desc);

grant select, insert, update, delete on public.chat_threads to authenticated;
grant all on public.chat_threads to service_role;

alter table public.chat_threads enable row level security;

create policy "chat_threads_select_own" on public.chat_threads
  for select to authenticated using (auth.uid() = user_id);
create policy "chat_threads_insert_own" on public.chat_threads
  for insert to authenticated with check (auth.uid() = user_id);
create policy "chat_threads_update_own" on public.chat_threads
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "chat_threads_delete_own" on public.chat_threads
  for delete to authenticated using (auth.uid() = user_id);

create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute function public.tg_set_updated_at();


create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  thread_id   uuid not null references public.chat_threads(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at);

grant select, insert, delete on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;

alter table public.chat_messages enable row level security;

create policy "chat_messages_select_own" on public.chat_messages
  for select to authenticated using (auth.uid() = user_id);
create policy "chat_messages_insert_own" on public.chat_messages
  for insert to authenticated with check (auth.uid() = user_id);
create policy "chat_messages_delete_own" on public.chat_messages
  for delete to authenticated using (auth.uid() = user_id);

-- Sem policy/grant de update: mensagens são imutáveis após gravadas.
