-- =============================================================================
-- Migration 0004 — VIEWs de Saldo por Conta e DRE Mensal
-- Projeto: Gerente Fina (Beta)
-- =============================================================================
-- Constituição aplicada:
--   §3  Saldos NUNCA materializados — derivados em tempo real via agregação.
--   §3  Expurgo de fluxos neutros (transfer, invoice_payment) do DRE.
--       Eles APARECEM em saldos por conta (movem patrimônio), mas NÃO entram
--       em Receita/Despesa.
--   §4  RLS herdada das tabelas-base via `security_invoker = true` (Postgres 15+).
--       Sem isso, VIEWs rodariam com privilégios do owner e furariam RLS.
-- =============================================================================

-- =============================================================================
-- VIEW: account_balances
-- Saldo corrente por conta. Inclui TODOS os kinds (income, expense, transfer,
-- invoice_payment) — saldo é movimentação patrimonial, não resultado.
-- Convenção de sinais: credit soma, debit subtrai.
-- =============================================================================
create or replace view public.account_balances
with (security_invoker = true) as
select
  a.id                                                       as account_id,
  a.user_id                                                  as user_id,
  a.name                                                     as account_name,
  a.type                                                     as account_type,
  coalesce(sum(
    case t.type
      when 'credit' then  t.amount
      when 'debit'  then -t.amount
    end
  ), 0)::numeric(14,2)                                       as balance,
  count(t.id)                                                as transactions_count,
  max(t.occurred_on)                                         as last_movement_on
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id, a.user_id, a.name, a.type;

grant select on public.account_balances to authenticated;
grant all    on public.account_balances to service_role;


-- =============================================================================
-- VIEW: monthly_dre
-- Demonstrativo de Resultado mensal POR usuário, com EXPURGO RIGOROSO
-- de fluxos neutros (transfer e invoice_payment).
-- Agrupa pelo mês de `occurred_on` (regime de competência).
-- =============================================================================
create or replace view public.monthly_dre
with (security_invoker = true) as
select
  t.user_id                                                  as user_id,
  date_trunc('month', t.occurred_on)::date                   as reference_month,
  sum(case when t.kind = 'income'  then t.amount else 0 end)::numeric(14,2) as income,
  sum(case when t.kind = 'expense' then t.amount else 0 end)::numeric(14,2) as expense,
  (
    sum(case when t.kind = 'income'  then t.amount else 0 end)
    - sum(case when t.kind = 'expense' then t.amount else 0 end)
  )::numeric(14,2)                                           as net_result,
  count(*) filter (where t.kind = 'income')                  as income_count,
  count(*) filter (where t.kind = 'expense')                 as expense_count
from public.transactions t
where t.kind in ('income','expense')   -- expurgo §3
group by t.user_id, date_trunc('month', t.occurred_on);

grant select on public.monthly_dre to authenticated;
grant all    on public.monthly_dre to service_role;


-- =============================================================================
-- VIEW: monthly_dre_by_category
-- Desdobramento do DRE por categoria (para gráficos de pizza / drill-down).
-- Mesma regra de expurgo. Inclui categoria pai para hierarquia de 1 nível.
-- =============================================================================
create or replace view public.monthly_dre_by_category
with (security_invoker = true) as
select
  t.user_id                                                  as user_id,
  date_trunc('month', t.occurred_on)::date                   as reference_month,
  t.kind                                                     as kind,
  c.id                                                       as category_id,
  c.name                                                     as category_name,
  c.parent_id                                                as parent_category_id,
  sum(t.amount)::numeric(14,2)                               as total_amount,
  count(*)                                                   as transactions_count
from public.transactions t
join public.categories  c on c.id = t.category_id
where t.kind in ('income','expense')
group by t.user_id, date_trunc('month', t.occurred_on), t.kind, c.id, c.name, c.parent_id;

grant select on public.monthly_dre_by_category to authenticated;
grant all    on public.monthly_dre_by_category to service_role;

-- =============================================================================
-- FIM Migration 0004
-- Próximas migrations previstas:
--   0005 — Triggers de fechamento de fatura (status closed → total_amount)
--   0006 — Função RPC para inserir transferência atômica (2 linhas, mesmo transfer_id)
-- =============================================================================
