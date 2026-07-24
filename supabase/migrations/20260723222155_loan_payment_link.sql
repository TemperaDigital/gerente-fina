-- =============================================================================
-- Migration 0022 — Vínculo de loans com transactions + pagamento de parcela
-- Projeto: Gerente Fina
-- =============================================================================
-- Problema resolvido:
--   `loans` (empréstimos/financiamentos/consórcios) não tinha NENHUM vínculo
--   com `transactions` — `installments_paid` era um contador manual solto,
--   sem nenhuma transação real por trás. Diferente de `installment_purchases`
--   (parcelamentos de cartão), que já linka cada parcela paga via
--   `installment_items.transaction_id` (migration 0003). Não havia como
--   registrar um pagamento de empréstimo que gerasse de fato uma despesa no
--   livro-caixa e avançasse o progresso do empréstimo.
--
-- Solução (mesmo padrão de `pay_credit_card_invoice`, migration 0011):
--   - Coluna `transactions.loan_id` (nullable, `on delete set null` — mesma
--     semântica de `category_id`: apagar o empréstimo não apaga o histórico
--     real de dinheiro que já saiu, só desvincula a tag).
--   - Função `pay_loan_installment` — atômica, insere a transação (kind=
--     'expense') E incrementa `installments_paid` (virando `paid_off` quando
--     quita) na MESMA transação de banco. Idempotência via `_idempotency_key`
--     gravada em `external_id`, mesmo mecanismo da 0011 (protege contra duplo
--     clique / retry de rede).
--
-- Segurança (disciplina das migrations 0019/0021 — NÃO REPETIR o erro
-- original): a função é `security definer` mas o EXECUTE é revogado de
-- `public`, `anon` E `authenticated` já nesta mesma migration — só
-- `service_role` chama (via `getSupabaseAdmin()` em
-- `src/services/installments.functions.ts`), que valida posse do empréstimo
-- e da categoria na camada TypeScript ANTES de invocar a RPC (a função em si
-- não recebe nem valida `user_id`).
-- =============================================================================

alter table public.transactions
  add column loan_id uuid references public.loans(id) on delete set null;

alter table public.transactions
  add constraint transactions_loan_requires_expense
  check (loan_id is null or kind = 'expense');

create index transactions_loan_idx
  on public.transactions (loan_id) where loan_id is not null;

-- Idempotência: uma chave só pode aparecer 1x por empréstimo (mesmo padrão
-- de `transactions_invoice_payment_idem_idx`, migration 0011).
create unique index transactions_loan_payment_idem_idx
  on public.transactions (loan_id, external_id)
  where loan_id is not null and external_id is not null;

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
  -- Trava o empréstimo para serializar pagamentos concorrentes da MESMA
  -- linha (2 abas abertas, duplo clique bem no limite da janela de rede).
  select user_id, account_id, installments_count, installments_paid, status
    into v_user_id, v_account_id, v_installments_count, v_installments_paid, v_status
    from public.loans
   where id = _loan_id
   for update;

  if v_user_id is null then
    raise exception 'Empréstimo não encontrado.' using errcode = 'P0001';
  end if;

  if v_status <> 'active' then
    raise exception 'Este empréstimo não está ativo (status atual: %).', v_status
      using errcode = 'P0001';
  end if;

  -- Checagem de idempotência: essa chave já foi usada para este empréstimo?
  if _idempotency_key is not null then
    select id into v_existing_tx
      from public.transactions
     where loan_id = _loan_id
       and external_id = _idempotency_key
     limit 1;

    if v_existing_tx is not null then
      select installments_paid, status into v_new_paid, v_new_status
        from public.loans where id = _loan_id;
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

  update public.loans
     set installments_paid = v_new_paid,
         status = v_new_status
   where id = _loan_id;

  return query select v_new_tx, v_new_paid, v_new_status::text, false;
end;
$$;

revoke execute on function public.pay_loan_installment(
  uuid, uuid, numeric, date, text, text, text
) from public, anon, authenticated;

-- =============================================================================
-- FIM Migration 0022
-- =============================================================================
