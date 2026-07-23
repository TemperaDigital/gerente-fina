-- =============================================================================
-- Migration 0002 — Categories + Transactions (núcleo contábil)
-- Projeto: Gerente Fina (Beta) — Soberania Contábil-Gerencial Monousuário
-- =============================================================================
-- Constituição aplicada:
--   §2  Modularidade: categorias e transações vivem em tabelas próprias.
--   §3  Sem saldo materializado. `amount numeric(14,2)` sempre positivo;
--       sinal vem de `type` (debit|credit).
--   §3  Expurgo de fluxos neutros: `transfer` e `invoice_payment` NUNCA
--       têm categoria — barrado por CHECK.
--   §3  Transferências geram DUAS linhas vinculadas pelo mesmo `transfer_id`
--       (debit na origem + credit no destino), permitindo agregação pura
--       por `account_id`.
--   §3  Escudo antiduplicidade: `dedup_hash` UNIQUE parcial por usuário.
--   §4  RLS estrita por `auth.uid()`. GRANTs sem `anon`.
-- =============================================================================

-- ENUM auxiliar — natureza da categoria
create type public.category_kind as enum ('income','expense');
-- (categorias para fluxos neutros NÃO existem)

-- =============================================================================
-- TABELA: categories
-- =============================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references public.categories(id) on delete cascade,
  name        text not null,
  kind        public.category_kind not null,
  color       text,
  icon        text,                       -- sem .max() — aceita Base64 longo
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index categories_user_id_idx
  on public.categories (user_id) where archived_at is null;

create index categories_parent_id_idx
  on public.categories (parent_id) where archived_at is null;

create unique index categories_unique_root_name
  on public.categories (user_id, lower(name))
  where parent_id is null and archived_at is null;

create unique index categories_unique_child_name
  on public.categories (user_id, parent_id, lower(name))
  where parent_id is not null and archived_at is null;

grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;

alter table public.categories enable row level security;

create policy "categories_select_own"
  on public.categories for select to authenticated
  using (auth.uid() = user_id);

create policy "categories_insert_own"
  on public.categories for insert to authenticated
  with check (auth.uid() = user_id);

create policy "categories_update_own"
  on public.categories for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "categories_delete_own"
  on public.categories for delete to authenticated
  using (auth.uid() = user_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.tg_set_updated_at();

-- Trigger: valida hierarquia (mesmo user, mesmo kind, profundidade máxima 1)
create or replace function public.tg_categories_validate_parent()
returns trigger language plpgsql as $$
declare
  parent_record public.categories%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into parent_record from public.categories where id = new.parent_id;

  if parent_record.id is null then
    raise exception 'parent category % not found', new.parent_id;
  end if;
  if parent_record.user_id <> new.user_id then
    raise exception 'parent category belongs to another user';
  end if;
  if parent_record.kind <> new.kind then
    raise exception 'subcategory kind (%) must match parent kind (%)',
      new.kind, parent_record.kind;
  end if;
  if parent_record.parent_id is not null then
    raise exception 'category nesting limited to 1 level (no sub-subcategories)';
  end if;

  return new;
end;
$$;

create trigger categories_validate_parent
  before insert or update on public.categories
  for each row execute function public.tg_categories_validate_parent();


-- =============================================================================
-- TABELA: transactions  (núcleo contábil)
-- =============================================================================
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete restrict,
  category_id  uuid          references public.categories(id) on delete set null,

  kind         public.transaction_kind not null,
  type         public.transaction_type not null,
  amount       numeric(14,2) not null check (amount > 0),

  occurred_on  date not null,
  posted_at    timestamptz,

  description  text not null,
  notes        text,
  external_id  text,                 -- id da Pluggy/OFX (sync)

  -- Amarrações sistêmicas. FKs reais adicionadas em migrations futuras
  -- (0003 recurrences, 0004 credit_card_invoices) via ALTER TABLE.
  transfer_id       uuid,            -- agrupa as 2 pernas de uma transferência
  recurrence_id     uuid,            -- → recurrences(id)
  invoice_id        uuid,            -- compra que entra na fatura
  paid_invoice_id   uuid,            -- fatura quitada por este lançamento

  -- Escudo antiduplicidade (SHA-256 calculado no app)
  dedup_hash   text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- ---------------------------------------------------------------------------
  -- INTEGRIDADE CONTÁBIL — CHECKS
  -- ---------------------------------------------------------------------------
  constraint transactions_real_flow_requires_category check (
    kind not in ('income','expense') or (
      category_id is not null
      and transfer_id is null
      and paid_invoice_id is null
    )
  ),
  constraint transactions_neutral_flow_forbids_category check (
    kind not in ('transfer','invoice_payment') or category_id is null
  ),
  constraint transactions_transfer_requires_group check (
    kind <> 'transfer' or transfer_id is not null
  ),
  constraint transactions_invoice_payment_requires_target check (
    kind <> 'invoice_payment' or paid_invoice_id is not null
  ),
  constraint transactions_income_is_credit check (kind <> 'income' or type = 'credit'),
  constraint transactions_expense_is_debit check (kind <> 'expense' or type = 'debit')
);

-- ÍNDICES
create index transactions_user_occurred_idx
  on public.transactions (user_id, occurred_on desc);

create index transactions_account_occurred_idx
  on public.transactions (account_id, occurred_on desc);

create index transactions_category_idx
  on public.transactions (category_id) where category_id is not null;

create index transactions_transfer_group_idx
  on public.transactions (transfer_id) where transfer_id is not null;

create index transactions_invoice_idx
  on public.transactions (invoice_id) where invoice_id is not null;

create index transactions_paid_invoice_idx
  on public.transactions (paid_invoice_id) where paid_invoice_id is not null;

create index transactions_recurrence_idx
  on public.transactions (recurrence_id) where recurrence_id is not null;

-- Escudo antiduplicidade — UNIQUE parcial por usuário
create unique index transactions_dedup_hash_unique
  on public.transactions (user_id, dedup_hash)
  where dedup_hash is not null;

-- GRANTS
grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;

-- RLS
alter table public.transactions enable row level security;

create policy "transactions_select_own"
  on public.transactions for select to authenticated
  using (auth.uid() = user_id);

create policy "transactions_insert_own"
  on public.transactions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "transactions_update_own"
  on public.transactions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transactions_delete_own"
  on public.transactions for delete to authenticated
  using (auth.uid() = user_id);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.tg_set_updated_at();

-- =============================================================================
-- FIM Migration 0002
-- Próximas migrations previstas:
--   0003 — recurrences (+ FK transactions.recurrence_id)
--   0004 — credit_card_invoices (+ FKs invoice_id, paid_invoice_id)
--   0005 — VIEWS de saldo e resultado mensal com expurgo neutro
-- =============================================================================
