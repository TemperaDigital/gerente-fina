-- =============================================================================
-- Migration 0013 — Conversão Estrutural de Lançamento (convert_transaction_entry)
-- Projeto: Gerente Fina
-- Status: PENDENTE DE EXECUÇÃO. Rode no SQL Editor do Supabase.
-- =============================================================================
-- Contexto:
--   /transactions/edit/$id só permite RETIFICAR atributos (valor, data,
--   descrição, conta, categoria, notas) — nunca muda `kind` nem toca em
--   estruturas (parcelamento, recorrência, transferência, pagamento de
--   fatura). Deliberado: mudar o tipo sem tratar os vínculos amarrados quebra
--   integridade contábil (parcela órfã, perna de transferência sem par,
--   saldo de fatura incorreto).
--
--   Esta migration adiciona uma ação SEPARADA e EXPLÍCITA — "Converter
--   lançamento" — que desfaz a estrutura antiga corretamente e recria o
--   lançamento com o novo kind, tudo dentro de UMA transação de banco. Se
--   qualquer parte falhar, o Postgres reverte TUDO automaticamente (uma
--   função plpgsql chamada via RPC já executa dentro da transação implícita
--   do chamador — nenhum savepoint manual necessário).
--
-- Tratamento por estrutura antiga:
--   - Parcelamento (installment_items.transaction_id aponta pra este id):
--     a FK já é `on delete set null` — apagar a transação desvincula APENAS
--     esta parcela automaticamente; as demais installment_items e o
--     cabeçalho installment_purchases permanecem intactos. Nenhum código
--     extra necessário.
--   - Recorrência (recurrence_id preenchido): `recurrences` não referencia
--     `transactions` — apagar a transação não afeta a recorrência em si.
--   - Transferência (transfer_id preenchido): transfer_id É o correlator
--     explícito das duas pernas — `delete ... where transfer_id = X` remove
--     exatamente as duas, sem ambiguidade.
--   - Pagamento de fatura (kind = 'invoice_payment'): LACUNA CONHECIDA do
--     schema — paid_invoice_id identifica a FATURA sendo paga, não o EVENTO
--     de pagamento; se a mesma fatura foi paga mais de uma vez, várias
--     linhas compartilham o mesmo paid_invoice_id. Para achar a perna irmã
--     de UM pagamento específico, casamos por (paid_invoice_id, occurred_on,
--     amount, description, type oposto, account_id diferente, id
--     diferente). Se achar exatamente 1 candidata, apaga as duas. Se achar 0
--     ou mais de 1, ABORTA com erro claro — falha visível é melhor que
--     apagar a perna errada.
--
-- Novo kind (recriação):
--   - income/expense: exige _category_id.
--   - transfer: exige _counterpart_account_id; gera novo transfer_id.
--   - invoice_payment: exige _paid_invoice_id; delega para a função já
--     existente pay_credit_card_invoice (migration 0011) — mesma
--     atomicidade/idempotência (external_id), sem duplicar aquela lógica.
-- =============================================================================

create or replace function public.convert_transaction_entry(
  _transaction_id         uuid,
  _new_kind               text,
  _amount                 numeric(14,2),
  _occurred_on            date,
  _description            text,
  _account_id             uuid,
  _notes                  text default null,
  _category_id            uuid default null,
  _counterpart_account_id uuid default null,
  _paid_invoice_id        uuid default null,
  _idempotency_key        text default null
)
returns table (
  created_transaction_id  uuid,
  created_transfer_id     uuid,
  invoice_outstanding     numeric(14,2),
  invoice_status          text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid;
  v_old_kind      transaction_kind;
  v_old_type      transaction_type;
  v_old_account   uuid;
  v_old_amount    numeric(14,2);
  v_old_occurred  date;
  v_old_desc      text;
  v_transfer_id   uuid;
  v_paid_invoice  uuid;
  v_sibling_id    uuid;
  v_sibling_count int;
  v_new_type      transaction_type;
  v_new_id        uuid;
  v_new_transfer  uuid;
  v_pay           record;
begin
  if _new_kind not in ('income','expense','transfer','invoice_payment') then
    raise exception 'new_kind inválido: %', _new_kind using errcode = 'P0001';
  end if;

  -- Trava e lê o lançamento original (for update: serializa conversões
  -- concorrentes do mesmo lançamento).
  select user_id, kind, type, account_id, amount, occurred_on, description,
         transfer_id, paid_invoice_id
    into v_user_id, v_old_kind, v_old_type, v_old_account, v_old_amount,
         v_old_occurred, v_old_desc, v_transfer_id, v_paid_invoice
    from public.transactions
   where id = _transaction_id
   for update;

  if v_user_id is null then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0001';
  end if;

  -- =========================================================================
  -- 1) Desfaz a estrutura antiga
  -- =========================================================================
  if v_old_kind = 'transfer' and v_transfer_id is not null then
    delete from public.transactions where transfer_id = v_transfer_id;

  elsif v_old_kind = 'invoice_payment' and v_paid_invoice is not null then
    select count(*) into v_sibling_count
      from public.transactions
     where paid_invoice_id = v_paid_invoice
       and kind = 'invoice_payment'
       and id <> _transaction_id
       and occurred_on = v_old_occurred
       and amount = v_old_amount
       and description = v_old_desc
       and type <> v_old_type
       and account_id <> v_old_account;

    if v_sibling_count = 0 then
      raise exception 'Não foi possível localizar a perna correspondente deste pagamento de fatura — conversão abortada por segurança.' using errcode = 'P0001';
    elsif v_sibling_count > 1 then
      raise exception 'Mais de uma perna candidata encontrada para este pagamento de fatura — ambíguo, conversão abortada por segurança.' using errcode = 'P0001';
    end if;

    select id into v_sibling_id
      from public.transactions
     where paid_invoice_id = v_paid_invoice
       and kind = 'invoice_payment'
       and id <> _transaction_id
       and occurred_on = v_old_occurred
       and amount = v_old_amount
       and description = v_old_desc
       and type <> v_old_type
       and account_id <> v_old_account;

    delete from public.transactions where id in (_transaction_id, v_sibling_id);

  else
    -- Simples, parcelamento (FK cuida do unlink) ou recorrência: só apaga a própria linha.
    delete from public.transactions where id = _transaction_id;
  end if;

  -- =========================================================================
  -- 2) Recria com o novo kind
  -- =========================================================================
  if _new_kind in ('income', 'expense') then
    if _category_id is null then
      raise exception 'Categoria é obrigatória para receita/despesa.' using errcode = 'P0001';
    end if;
    v_new_type := case when _new_kind = 'income' then 'credit' else 'debit' end;

    insert into public.transactions (
      user_id, account_id, category_id, kind, type, amount, occurred_on,
      description, notes, source
    ) values (
      v_user_id, _account_id, _category_id, _new_kind::transaction_kind, v_new_type,
      _amount, _occurred_on, _description, _notes, 'manual'
    ) returning id into v_new_id;

    return query select v_new_id, null::uuid, null::numeric(14,2), null::text;

  elsif _new_kind = 'transfer' then
    if _counterpart_account_id is null then
      raise exception 'Conta de destino é obrigatória para transferência.' using errcode = 'P0001';
    end if;
    if _counterpart_account_id = _account_id then
      raise exception 'Conta de destino deve ser diferente da origem.' using errcode = 'P0001';
    end if;

    v_new_transfer := gen_random_uuid();

    insert into public.transactions (
      user_id, account_id, kind, type, amount, occurred_on, description, notes, transfer_id, source
    ) values
      (v_user_id, _account_id, 'transfer', 'debit', _amount, _occurred_on, _description, _notes, v_new_transfer, 'manual'),
      (v_user_id, _counterpart_account_id, 'transfer', 'credit', _amount, _occurred_on, _description, _notes, v_new_transfer, 'manual');

    return query select null::uuid, v_new_transfer, null::numeric(14,2), null::text;

  elsif _new_kind = 'invoice_payment' then
    if _paid_invoice_id is null then
      raise exception 'Fatura a pagar é obrigatória.' using errcode = 'P0001';
    end if;

    select * into v_pay
      from public.pay_credit_card_invoice(
        _paid_invoice_id, _account_id, _amount, _occurred_on, _description, _notes, _idempotency_key
      );

    return query select v_pay.leg_origin_id, null::uuid, v_pay.outstanding, v_pay.invoice_status;
  end if;
end;
$$;

grant execute on function public.convert_transaction_entry(
  uuid, text, numeric, date, text, uuid, text, uuid, uuid, uuid, text
) to authenticated;

-- =============================================================================
-- FIM Migration 0013
-- =============================================================================
