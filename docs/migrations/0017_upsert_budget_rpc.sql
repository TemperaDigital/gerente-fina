-- =============================================================================
-- Migration 0017 — RPC upsert_budget (corrige bug de "Definir teto mensal")
--
-- budgets_user_cat_month_unique (migration 0006) é um índice único de
-- EXPRESSÃO — coalesce(reference_month, date '1900-01-01') — para tratar
-- NULL (teto recorrente) como um valor único por categoria, em vez de
-- permitir múltiplas linhas NULL (comportamento padrão de unique constraint
-- com NULL). O client supabase-js só sabe montar `ON CONFLICT` a partir de
-- uma lista simples de colunas — não consegue direcionar para um índice de
-- expressão — por isso `.upsert({...}, { onConflict: "user_id,category_id,
-- reference_month" })` sempre falhava com "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- Esta RPC faz o INSERT ... ON CONFLICT diretamente em SQL, onde apontar
-- para um índice de expressão é suportado nativamente pelo Postgres.
-- =============================================================================

create or replace function public.upsert_budget(
  _user_id         uuid,
  _category_id     uuid,
  _amount          numeric(14,2),
  _reference_month date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.budgets (user_id, category_id, amount, reference_month)
  values (_user_id, _category_id, _amount, _reference_month)
  on conflict (user_id, category_id, (coalesce(reference_month, date '1900-01-01')))
  do update set amount = excluded.amount, updated_at = now();
end;
$$;

grant execute on function public.upsert_budget(uuid, uuid, numeric, date) to authenticated;
