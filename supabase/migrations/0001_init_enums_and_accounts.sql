-- =============================================================================
-- DRAFT — Migration 0001 — Enums + tabela `accounts` unificada
-- Projeto: Gerente Fina (Beta) — Soberania Contábil-Gerencial Monousuário
-- =============================================================================
-- ⚠️  RASCUNHO PARA APROVAÇÃO. Não será aplicado até confirmação explícita.
--     Ao aprovar, o conteúdo abaixo será materializado em
--     `supabase/migrations/0001_init_enums_and_accounts.sql` e executado no
--     Supabase do projeto (paxfjesglnaxaolvpgup).
--
-- Esta migration estabelece o vocabulário tipado do domínio e a primeira
-- tabela física: `accounts`, que unifica caixa, conta bancária e cartão de
-- crédito num único schema (Constituição §2 — modularidade) com RLS
-- escopada estritamente em `auth.uid()` (Constituição §4).
--
-- PROIBIDO armazenar saldo calculado nesta tabela (Constituição §3).
-- O saldo é sempre derivado por agregação SQL das transações em tempo real.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------
create type public.account_type as enum (
  'cash',          -- dinheiro em espécie / carteira
  'bank',          -- conta corrente, conta poupança, conta digital
  'credit_card'    -- cartão de crédito (fatura)
);

create type public.transaction_type as enum (
  'debit',         -- saída de valor da conta
  'credit'         -- entrada de valor na conta
);

create type public.transaction_kind as enum (
  'income',           -- receita real (salário, venda, rendimento)
  'expense',          -- despesa real (compra, conta, serviço)
  'transfer',         -- transferência entre contas próprias (NEUTRO)
  'invoice_payment'   -- pagamento de fatura de cartão (NEUTRO)
);

-- -----------------------------------------------------------------------------
-- TABELA: accounts
-- -----------------------------------------------------------------------------
create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  type          public.account_type not null,
  institution   text,
  color         text,
  icon          text,                       -- sem .max() — aceita Base64 longo
  credit_limit_cents bigint,
  closing_day        smallint check (closing_day between 1 and 31),
  due_day            smallint check (due_day between 1 and 31),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Cartão DEVE ter closing/due/limit; cash/bank NÃO PODEM ter.
  constraint accounts_credit_card_fields check (
    (type = 'credit_card' and closing_day is not null and due_day is not null and credit_limit_cents is not null)
    or
    (type <> 'credit_card' and closing_day is null and due_day is null and credit_limit_cents is null)
  )
);

create index accounts_user_id_idx on public.accounts (user_id) where archived_at is null;
create unique index accounts_user_name_unique on public.accounts (user_id, lower(name)) where archived_at is null;

-- -----------------------------------------------------------------------------
-- GRANTS (sem `anon` — todo dado é privado do usuário autenticado)
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.accounts to authenticated;
grant all on public.accounts to service_role;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.accounts enable row level security;

create policy "accounts_select_own"
  on public.accounts for select to authenticated
  using (auth.uid() = user_id);

create policy "accounts_insert_own"
  on public.accounts for insert to authenticated
  with check (auth.uid() = user_id);

create policy "accounts_update_own"
  on public.accounts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "accounts_delete_own"
  on public.accounts for delete to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- TRIGGER: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.tg_set_updated_at();
