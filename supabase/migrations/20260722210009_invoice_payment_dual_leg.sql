-- =============================================================================
-- Migration 0008 — Pagamento de Fatura Dupla Perna + Total Real
-- Projeto: Gerente Fina
-- =============================================================================
-- Constituição aplicada:
--   §3  Todo pagamento de fatura é uma OPERAÇÃO DE DUAS PERNAS:
--          - Perna 1 (origem): kind='invoice_payment', type='debit'
--            na conta corrente/dinheiro escolhida.
--          - Perna 2 (cartão):  kind='invoice_payment', type='credit'
--            na conta do cartão, abatendo o saldo devedor.
--       Ambas compartilham `paid_invoice_id` (amarração + auditoria).
--   §3  `credit_card_invoices.total_amount` deixa de ser um contador cego —
--       passa a representar o SALDO DEVEDOR REMANESCENTE da fatura
--       (despesas atreladas − créditos de pagamento). Zerou → status='paid'.
--   §3  Categoria continua NULA em pagamentos (barrada por CHECK). A UI
--       exibe rótulo fixo "Fatura de cartões" (informativo, não persistido).
--
-- ATENÇÃO: A lógica atômica está implementada em
--   src/services/transactions.functions.ts (createTransactionEntry, branch
--   invoice_payment). Este arquivo documenta as invariantes de banco.
-- =============================================================================

-- Reconciliação idempotente do saldo devedor de UMA fatura.
create or replace function public.refresh_invoice_outstanding(_invoice_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense  numeric(14,2);
  v_paid     numeric(14,2);
  v_outstanding numeric(14,2);
begin
  select coalesce(sum(amount), 0)::numeric(14,2) into v_expense
    from public.transactions
   where invoice_id = _invoice_id and kind = 'expense';

  select coalesce(sum(amount), 0)::numeric(14,2) into v_paid
    from public.transactions
   where paid_invoice_id = _invoice_id
     and kind = 'invoice_payment'
     and type = 'credit';

  v_outstanding := greatest(v_expense - v_paid, 0);

  update public.credit_card_invoices
     set total_amount = v_outstanding,
         status = case when v_outstanding <= 0.005 then 'paid'::invoice_status
                       else status end,
         paid_at = case when v_outstanding <= 0.005 then coalesce(paid_at, now())
                        else null end,
         updated_at = now()
   where id = _invoice_id;

  return v_outstanding;
end;
$$;

grant execute on function public.refresh_invoice_outstanding(uuid) to authenticated;

-- Trigger — sempre que uma transação atrelada a fatura for inserida/removida,
-- o saldo devedor da fatura é recomputado.
create or replace function public.tg_transactions_refresh_invoice_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.invoice_id is not null then
      perform public.refresh_invoice_outstanding(old.invoice_id);
    end if;
    if old.paid_invoice_id is not null then
      perform public.refresh_invoice_outstanding(old.paid_invoice_id);
    end if;
    return old;
  end if;

  if new.invoice_id is not null then
    perform public.refresh_invoice_outstanding(new.invoice_id);
  end if;
  if new.paid_invoice_id is not null then
    perform public.refresh_invoice_outstanding(new.paid_invoice_id);
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_refresh_invoice_total on public.transactions;
create trigger transactions_refresh_invoice_total
  after insert or update or delete on public.transactions
  for each row execute function public.tg_transactions_refresh_invoice_total();

-- =============================================================================
-- FIM Migration 0008
-- =============================================================================
