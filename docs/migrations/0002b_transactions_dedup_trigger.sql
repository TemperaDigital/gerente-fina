-- =============================================================================
-- Migration 0002b — Coluna `source` + Trigger condicional de `dedup_hash`
-- Projeto: Gerente Fina (Beta)
-- =============================================================================
-- Constituição aplicada:
--   §3  Escudo antiduplicidade — SOMENTE para lançamentos de importação
--       automática (`source IN ('import','pluggy')`).
--   §3  Lançamentos manuais NUNCA recebem hash → podem duplicar livremente
--       no banco; a UI exibe apenas toast de aviso.
--   §4  Validação de bordas (Zod) continua na aplicação; aqui isolamos
--       garantia no banco.
-- =============================================================================

create extension if not exists pgcrypto;

-- ENUM: origem do lançamento
create type public.transaction_source as enum (
  'manual',
  'import',
  'pluggy',
  'recurrence',
  'installment',
  'invoice_close'
);

-- Nova coluna na tabela transactions
alter table public.transactions
  add column source public.transaction_source not null default 'manual';

create index transactions_source_idx
  on public.transactions (source);

-- =============================================================================
-- FUNÇÃO: tg_transactions_autohash
-- Calcula `dedup_hash` somente quando `source IN ('import','pluggy')` e o
-- campo ainda está NULL. Mantém manuais sempre com hash NULL.
-- =============================================================================
create or replace function public.tg_transactions_autohash()
returns trigger
language plpgsql
as $$
declare
  canonical text;
begin
  -- Manuais e demais origens automáticas não importadas: nunca tocam o hash.
  if new.source not in ('import','pluggy') then
    new.dedup_hash := null;
    return new;
  end if;

  -- Se quem inseriu já forneceu um hash, respeita.
  if new.dedup_hash is not null then
    return new;
  end if;

  canonical := concat_ws(
    '|',
    new.user_id::text,
    new.account_id::text,
    to_char(new.occurred_on, 'YYYY-MM-DD'),
    -- Normaliza para 2 casas decimais (mesma regra do helper TS normalizeAmount)
    to_char(new.amount, 'FM999999999999990.00'),
    new.type::text,
    lower(regexp_replace(trim(coalesce(new.description, '')), '\s+', ' ', 'g'))
  );

  new.dedup_hash := encode(digest(canonical, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger transactions_autohash
  before insert or update of source, account_id, occurred_on, amount, type, description, dedup_hash
  on public.transactions
  for each row
  execute function public.tg_transactions_autohash();

-- =============================================================================
-- FIM Migration 0002b
-- =============================================================================
