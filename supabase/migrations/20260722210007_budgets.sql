-- =============================================================================
-- Migration 0006 — Budgets (Tetos de gastos por categoria)
-- Constituição: Sem materialização de saldos; o consumo é derivado em tempo
-- real cruzando com `transactions`. RLS por auth.uid().
-- =============================================================================

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  amount        numeric(14,2) not null check (amount > 0),
  -- NULL = teto recorrente para todos os meses; preenchido = teto pontual
  reference_month date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint budgets_reference_month_first_day
    check (reference_month is null or extract(day from reference_month) = 1)
);

create unique index budgets_user_cat_month_unique
  on public.budgets (user_id, category_id, coalesce(reference_month, date '1900-01-01'));

grant select, insert, update, delete on public.budgets to authenticated;
grant all on public.budgets to service_role;

alter table public.budgets enable row level security;

create policy "budgets_select_own" on public.budgets
  for select to authenticated using (auth.uid() = user_id);
create policy "budgets_insert_own" on public.budgets
  for insert to authenticated with check (auth.uid() = user_id);
create policy "budgets_update_own" on public.budgets
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets_delete_own" on public.budgets
  for delete to authenticated using (auth.uid() = user_id);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.tg_set_updated_at();
