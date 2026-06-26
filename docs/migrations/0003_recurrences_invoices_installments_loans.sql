-- =============================================================================
-- Migration 0003 — Estruturas de longo prazo
--   recurrences | credit_card_invoices | installment_purchases
--   installment_items | loans
-- + ALTER TABLE finalizando FKs de transactions (recurrence_id, invoice_id,
--   paid_invoice_id) que foram deixadas pendentes em 0002 para evitar
--   dependência cíclica.
-- =============================================================================
-- Constituição aplicada:
--   §2  Modularidade — cada conceito em sua tabela própria, fortemente tipada.
--   §3  Cálculo do meio do mês fica no app (src/lib/finance/invoice-due.ts);
--       o banco apenas armazena `closing_date` e `due_date` já calculados.
--   §3  Sem saldo materializado — `total_amount` em invoices é DERIVADO
--       (atualizado por trigger futura quando a fatura fecha).
--   §4  RLS por `auth.uid()` em TUDO. GRANTs sem `anon`.
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
create type public.recurrence_frequency as enum ('daily','weekly','monthly','yearly');
create type public.invoice_status       as enum ('open','closed','paid','overdue');
create type public.installment_status   as enum ('active','completed','cancelled');
create type public.loan_kind            as enum ('personal','financing','consortium');
create type public.loan_status          as enum ('active','paid_off','defaulted','cancelled');


-- =============================================================================
-- TABELA: recurrences
-- =============================================================================
create table public.recurrences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      uuid not null references public.accounts(id) on delete restrict,
  category_id     uuid not null references public.categories(id) on delete restrict,

  kind            public.transaction_kind not null,
  type            public.transaction_type not null,
  amount          numeric(14,2) not null check (amount > 0),
  description     text not null,

  frequency       public.recurrence_frequency not null,
  interval_count  int not null default 1 check (interval_count >= 1),
  day_of_month    int check (day_of_month between 1 and 31),

  start_on        date not null,
  end_on          date,
  next_run_on     date not null,

  active          boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint recurrences_kind_real_only check (kind in ('income','expense')),
  constraint recurrences_income_is_credit check (kind <> 'income'  or type = 'credit'),
  constraint recurrences_expense_is_debit check (kind <> 'expense' or type = 'debit'),
  constraint recurrences_end_after_start  check (end_on is null or end_on >= start_on)
);

create index recurrences_user_active_idx
  on public.recurrences (user_id, next_run_on) where active = true;

grant select, insert, update, delete on public.recurrences to authenticated;
grant all on public.recurrences to service_role;

alter table public.recurrences enable row level security;

create policy "recurrences_select_own" on public.recurrences
  for select to authenticated using (auth.uid() = user_id);
create policy "recurrences_insert_own" on public.recurrences
  for insert to authenticated with check (auth.uid() = user_id);
create policy "recurrences_update_own" on public.recurrences
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurrences_delete_own" on public.recurrences
  for delete to authenticated using (auth.uid() = user_id);

create trigger recurrences_set_updated_at
  before update on public.recurrences
  for each row execute function public.tg_set_updated_at();


-- =============================================================================
-- TABELA: credit_card_invoices
-- =============================================================================
create table public.credit_card_invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  account_id       uuid not null references public.accounts(id) on delete restrict,

  reference_month  date not null,                  -- sempre dia 1 do mês de referência
  closing_date     date not null,
  due_date         date not null,

  status           public.invoice_status not null default 'open',
  total_amount     numeric(14,2) not null default 0 check (total_amount >= 0),
  paid_at          timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint invoices_reference_month_is_first_day
    check (extract(day from reference_month) = 1),
  constraint invoices_due_after_closing_or_equal
    check (due_date >= closing_date)
);

create unique index invoices_account_month_unique
  on public.credit_card_invoices (account_id, reference_month);

create index invoices_user_status_idx
  on public.credit_card_invoices (user_id, status, due_date);

grant select, insert, update, delete on public.credit_card_invoices to authenticated;
grant all on public.credit_card_invoices to service_role;

alter table public.credit_card_invoices enable row level security;

create policy "invoices_select_own" on public.credit_card_invoices
  for select to authenticated using (auth.uid() = user_id);
create policy "invoices_insert_own" on public.credit_card_invoices
  for insert to authenticated with check (auth.uid() = user_id);
create policy "invoices_update_own" on public.credit_card_invoices
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "invoices_delete_own" on public.credit_card_invoices
  for delete to authenticated using (auth.uid() = user_id);

create trigger invoices_set_updated_at
  before update on public.credit_card_invoices
  for each row execute function public.tg_set_updated_at();

-- Trigger: garante que a conta vinculada é do tipo cartão de crédito
create or replace function public.tg_invoice_account_must_be_credit_card()
returns trigger language plpgsql as $$
declare
  acc_type public.account_type;
begin
  select type into acc_type from public.accounts where id = new.account_id;
  if acc_type is null then
    raise exception 'account % not found', new.account_id;
  end if;
  if acc_type <> 'credit_card' then
    raise exception 'invoice account must be of type credit_card (got %)', acc_type;
  end if;
  return new;
end;
$$;

create trigger invoices_account_type_check
  before insert or update of account_id on public.credit_card_invoices
  for each row execute function public.tg_invoice_account_must_be_credit_card();


-- =============================================================================
-- TABELA: installment_purchases  (cabeçalho de compra parcelada)
-- =============================================================================
create table public.installment_purchases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  account_id          uuid not null references public.accounts(id) on delete restrict,
  category_id         uuid references public.categories(id) on delete set null,

  description         text not null,
  total_amount        numeric(14,2) not null check (total_amount > 0),
  installments_count  int not null check (installments_count between 1 and 360),
  first_invoice_id    uuid references public.credit_card_invoices(id) on delete set null,
  purchased_on        date not null,

  status              public.installment_status not null default 'active',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index installment_purchases_user_idx
  on public.installment_purchases (user_id, purchased_on desc);

grant select, insert, update, delete on public.installment_purchases to authenticated;
grant all on public.installment_purchases to service_role;

alter table public.installment_purchases enable row level security;

create policy "installment_purchases_select_own" on public.installment_purchases
  for select to authenticated using (auth.uid() = user_id);
create policy "installment_purchases_insert_own" on public.installment_purchases
  for insert to authenticated with check (auth.uid() = user_id);
create policy "installment_purchases_update_own" on public.installment_purchases
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "installment_purchases_delete_own" on public.installment_purchases
  for delete to authenticated using (auth.uid() = user_id);

create trigger installment_purchases_set_updated_at
  before update on public.installment_purchases
  for each row execute function public.tg_set_updated_at();


-- =============================================================================
-- TABELA: installment_items  (parcelas individuais)
-- =============================================================================
create table public.installment_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  purchase_id         uuid not null references public.installment_purchases(id) on delete cascade,
  invoice_id          uuid references public.credit_card_invoices(id) on delete set null,
  transaction_id      uuid references public.transactions(id) on delete set null,

  installment_number  int not null check (installment_number >= 1),
  amount              numeric(14,2) not null check (amount > 0),
  due_date            date not null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index installment_items_purchase_number_unique
  on public.installment_items (purchase_id, installment_number);

create index installment_items_invoice_idx
  on public.installment_items (invoice_id) where invoice_id is not null;

grant select, insert, update, delete on public.installment_items to authenticated;
grant all on public.installment_items to service_role;

alter table public.installment_items enable row level security;

create policy "installment_items_select_own" on public.installment_items
  for select to authenticated using (auth.uid() = user_id);
create policy "installment_items_insert_own" on public.installment_items
  for insert to authenticated with check (auth.uid() = user_id);
create policy "installment_items_update_own" on public.installment_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "installment_items_delete_own" on public.installment_items
  for delete to authenticated using (auth.uid() = user_id);

create trigger installment_items_set_updated_at
  before update on public.installment_items
  for each row execute function public.tg_set_updated_at();


-- =============================================================================
-- TABELA: loans  (empréstimos, financiamentos e consórcios)
-- =============================================================================
create table public.loans (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  account_id           uuid not null references public.accounts(id) on delete restrict,

  kind                 public.loan_kind not null,
  description          text not null,
  principal_amount     numeric(14,2) not null check (principal_amount > 0),
  interest_rate        numeric(8,4) check (interest_rate is null or interest_rate >= 0),

  installments_count   int not null check (installments_count between 1 and 600),
  installments_paid    int not null default 0 check (installments_paid >= 0),
  monthly_due_day      int not null check (monthly_due_day between 1 and 31),

  start_on             date not null,
  status               public.loan_status not null default 'active',

  -- Somente relevante para consórcios
  is_contemplated      boolean not null default false,
  contemplated_at      date,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint loans_installments_paid_lte_count
    check (installments_paid <= installments_count),
  constraint loans_contemplated_only_for_consortium
    check (kind = 'consortium' or is_contemplated = false),
  constraint loans_contemplated_at_requires_flag
    check (contemplated_at is null or is_contemplated = true)
);

create index loans_user_status_idx
  on public.loans (user_id, status);

grant select, insert, update, delete on public.loans to authenticated;
grant all on public.loans to service_role;

alter table public.loans enable row level security;

create policy "loans_select_own" on public.loans
  for select to authenticated using (auth.uid() = user_id);
create policy "loans_insert_own" on public.loans
  for insert to authenticated with check (auth.uid() = user_id);
create policy "loans_update_own" on public.loans
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "loans_delete_own" on public.loans
  for delete to authenticated using (auth.uid() = user_id);

create trigger loans_set_updated_at
  before update on public.loans
  for each row execute function public.tg_set_updated_at();


-- =============================================================================
-- ALTER TABLE: fechamento das FKs pendentes em transactions
-- =============================================================================
alter table public.transactions
  add constraint transactions_recurrence_fk
  foreign key (recurrence_id) references public.recurrences(id) on delete set null;

alter table public.transactions
  add constraint transactions_invoice_fk
  foreign key (invoice_id) references public.credit_card_invoices(id) on delete set null;

alter table public.transactions
  add constraint transactions_paid_invoice_fk
  foreign key (paid_invoice_id) references public.credit_card_invoices(id) on delete restrict;

-- =============================================================================
-- FIM Migration 0003
-- Próximas migrations previstas:
--   0004 — VIEWS de saldo por conta e DRE mensal (com expurgo de neutros)
--   0005 — Triggers de fechamento de fatura (status closed → total_amount)
-- =============================================================================
