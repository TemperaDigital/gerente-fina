-- =============================================================================
-- Migration 0011 — Pagamento de fatura ATÔMICO via RPC + idempotência real
-- Projeto: Gerente Fina
-- =============================================================================
-- Status: PENDENTE DE EXECUÇÃO. Rode no SQL Editor do Supabase.
--
-- Problema resolvido:
--   O código da aplicação fazia 2 inserts separados (perna origem + perna
--   cartão) via REST, e se o 2º falhasse, tentava "desfazer" o 1º com um
--   DELETE manual — isso não é atomicidade real (falha de rede exatamente
--   entre as duas chamadas deixa uma perna órfã). Além disso, o app
--   recalculava o saldo da fatura em JavaScript, DUPLICANDO o trabalho que
--   o trigger da migration 0008 (tg_transactions_refresh_invoice_total) já
--   faz sozinho — duas fontes de verdade para o mesmo número.
--
-- Solução:
--   Uma única função Postgres (`pay_credit_card_invoice`) que insere as duas
--   pernas dentro da MESMA transação de banco — ou as duas entram, ou
--   nenhuma entra, garantido pelo próprio Postgres. O trigger de 0008
--   continua recalculando o saldo automaticamente após cada insert; a
--   função só LÊ o resultado final para devolver ao chamador. Fonte de
--   verdade única.
--
-- Idempotência:
--   O chamador (frontend) gera uma chave única por tentativa de pagamento
--   (ex: crypto.randomUUID()) e a envia como `_idempotency_key`. Ela é
--   gravada em `transactions.external_id` (coluna já existente, livre).
--   Um índice único garante que a MESMA chave nunca gera 2 pares de pernas —
--   se o usuário clicar 2x ou a operação for reenviada por retry de rede, a
--   segunda chamada detecta a chave já usada e devolve o resultado já
--   existente em vez de pagar a fatura de novo.
-- =============================================================================

-- Índice de idempotência: uma chave só pode aparecer 1x por fatura.
create unique index if not exists transactions_invoice_payment_idem_idx
  on public.transactions (paid_invoice_id, external_id)
  where kind = 'invoice_payment' and external_id is not null;

create or replace function public.pay_credit_card_invoice(
  _paid_invoice_id     uuid,
  _source_account_id   uuid,
  _amount              numeric(14,2),
  _occurred_on         date,
  _description         text,
  _notes               text default null,
  _idempotency_key     text default null
)
returns table (
  leg_origin_id   uuid,
  leg_card_id     uuid,
  outstanding     numeric(14,2),
  invoice_status  text,
  was_duplicate   boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id         uuid;
  v_card_account_id uuid;
  v_existing_leg    uuid;
  v_leg_origin      uuid;
  v_leg_card        uuid;
  v_outstanding     numeric(14,2);
  v_status          invoice_status;
begin
  -- Trava a fatura para serializar pagamentos concorrentes da MESMA fatura
  -- (2 abas abertas, duplo clique bem no limite da janela de rede).
  select account_id, user_id into v_card_account_id, v_user_id
    from public.credit_card_invoices
   where id = _paid_invoice_id
   for update;

  if v_card_account_id is null then
    raise exception 'Fatura não encontrada.' using errcode = 'P0001';
  end if;

  if v_card_account_id = _source_account_id then
    raise exception 'A conta de origem não pode ser o próprio cartão.' using errcode = 'P0001';
  end if;

  -- Checagem de idempotência: essa chave já foi usada para esta fatura?
  if _idempotency_key is not null then
    select id into v_existing_leg
      from public.transactions
     where paid_invoice_id = _paid_invoice_id
       and external_id = _idempotency_key
       and kind = 'invoice_payment'
     limit 1;

    if v_existing_leg is not null then
      -- Já foi pago com essa chave: devolve o estado atual sem pagar de novo.
      select total_amount, status into v_outstanding, v_status
        from public.credit_card_invoices where id = _paid_invoice_id;

      return query select v_existing_leg, v_existing_leg, v_outstanding, v_status::text, true;
      return;
    end if;
  end if;

  -- Perna 1 — débito na conta de origem (saída de dinheiro).
  insert into public.transactions (
    user_id, account_id, kind, type, amount, occurred_on,
    description, notes, paid_invoice_id, external_id, source
  ) values (
    v_user_id, _source_account_id, 'invoice_payment', 'debit', _amount, _occurred_on,
    _description, _notes, _paid_invoice_id, _idempotency_key, 'manual'
  ) returning id into v_leg_origin;

  -- Perna 2 — crédito na conta do cartão (abate a dívida).
  -- Mesma external_id nas duas pernas: o índice de idempotência é por
  -- (paid_invoice_id, external_id), então a 2ª linha com a mesma chave só
  -- colidiria se fosse outra tentativa de pagamento — não entre as 2 pernas
  -- da MESMA tentativa, pois aqui o insert já aconteceu dentro da transação
  -- corrente (sem race possível consigo mesma).
  insert into public.transactions (
    user_id, account_id, kind, type, amount, occurred_on,
    description, notes, paid_invoice_id, source
  ) values (
    v_user_id, v_card_account_id, 'invoice_payment', 'credit', _amount, _occurred_on,
    _description, _notes, _paid_invoice_id, 'manual'
  ) returning id into v_leg_card;

  -- O trigger de 0008 já recalculou credit_card_invoices após cada insert
  -- acima. Só lemos o resultado final para devolver ao chamador.
  select total_amount, status into v_outstanding, v_status
    from public.credit_card_invoices where id = _paid_invoice_id;

  return query select v_leg_origin, v_leg_card, v_outstanding, v_status::text, false;
end;
$$;

grant execute on function public.pay_credit_card_invoice(
  uuid, uuid, numeric, date, text, text, text
) to authenticated;

-- =============================================================================
-- FIM Migration 0011
-- =============================================================================