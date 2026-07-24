-- =============================================================================
-- Migration 0023 — Corrige ambiguidade de coluna em pay_loan_installment
-- Projeto: Gerente Fina
-- =============================================================================
-- Achado via teste real contra o banco (não só tsc/lint) logo após aplicar a
-- migration 0022: a primeira invocação de `pay_loan_installment` falhava com
--   ERROR: 42702: column reference "installments_paid" is ambiguous
-- Causa: `installments_paid` é ao mesmo tempo uma coluna real de
-- `public.loans` E o nome de uma coluna de saída do `RETURNS TABLE` da
-- função — dentro do corpo PL/pgSQL, um `select installments_paid from
-- public.loans` sem qualificação vira ambíguo entre as duas.
--
-- Fix: qualifica toda referência a colunas de `loans`/`transactions` com
-- alias (`l`/`t`) dentro do corpo da função. Sem mudança de assinatura, de
-- comportamento esperado, nem dos GRANTs (revoke de public/anon/authenticated
-- mantido, disciplina das migrations 0019/0021).
--
-- Verificado após esta correção: pagamento normal, idempotência (mesma
-- chave não duplica), transição para paid_off ao quitar a última parcela, e
-- rejeição de pagamento em empréstimo já quitado — todos testados
-- diretamente contra o banco (dados de teste inseridos e removidos na mesma
-- sessão, sem deixar resíduo).
-- =============================================================================

create or replace function public.pay_loan_installment(
  _loan_id          uuid,
  _category_id      uuid,
  _amount           numeric(14,2),
  _occurred_on      date,
  _description      text,
  _notes            text default null,
  _idempotency_key  text default null
)
returns table (
  transaction_id     uuid,
  installments_paid  int,
  loan_status        text,
  was_duplicate      boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id            uuid;
  v_account_id         uuid;
  v_installments_count int;
  v_installments_paid  int;
  v_status             loan_status;
  v_existing_tx        uuid;
  v_new_tx             uuid;
  v_new_paid           int;
  v_new_status         loan_status;
begin
  select l.user_id, l.account_id, l.installments_count, l.installments_paid, l.status
    into v_user_id, v_account_id, v_installments_count, v_installments_paid, v_status
    from public.loans l
   where l.id = _loan_id
   for update;

  if v_user_id is null then
    raise exception 'Empréstimo não encontrado.' using errcode = 'P0001';
  end if;

  if v_status <> 'active' then
    raise exception 'Este empréstimo não está ativo (status atual: %).', v_status
      using errcode = 'P0001';
  end if;

  if _idempotency_key is not null then
    select t.id into v_existing_tx
      from public.transactions t
     where t.loan_id = _loan_id
       and t.external_id = _idempotency_key
     limit 1;

    if v_existing_tx is not null then
      select l.installments_paid, l.status into v_new_paid, v_new_status
        from public.loans l where l.id = _loan_id;
      return query select v_existing_tx, v_new_paid, v_new_status::text, true;
      return;
    end if;
  end if;

  if v_installments_paid >= v_installments_count then
    raise exception 'Empréstimo já está totalmente quitado.' using errcode = 'P0001';
  end if;

  insert into public.transactions (
    user_id, account_id, category_id, kind, type, amount, occurred_on,
    description, notes, loan_id, external_id, source
  ) values (
    v_user_id, v_account_id, _category_id, 'expense', 'debit', _amount, _occurred_on,
    _description, _notes, _loan_id, _idempotency_key, 'manual'
  ) returning id into v_new_tx;

  v_new_paid := v_installments_paid + 1;
  v_new_status := case when v_new_paid >= v_installments_count then 'paid_off' else v_status end;

  update public.loans l
     set installments_paid = v_new_paid,
         status = v_new_status
   where l.id = _loan_id;

  return query select v_new_tx, v_new_paid, v_new_status::text, false;
end;
$$;

revoke execute on function public.pay_loan_installment(
  uuid, uuid, numeric, date, text, text, text
) from public, anon, authenticated;

-- =============================================================================
-- FIM Migration 0023
-- =============================================================================
