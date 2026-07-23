-- =============================================================================
-- Migration 0015 — Exclusão atômica de parcelamento (Missão 12)
--
-- Apaga o cabeçalho installment_purchases E qualquer transaction ainda
-- vinculada a ele via installment_items.transaction_id — mesma disciplina
-- de pay_credit_card_invoice/convert_transaction_entry: tudo em uma única
-- função de banco, uma única transação SQL.
--
-- installment_purchases → installment_items já tem ON DELETE CASCADE (migration
-- 0003), então apagar o cabeçalho remove as parcelas sozinho; o que a cascade
-- NÃO faz é remover as transactions ainda vinculadas (installment_items.
-- transaction_id → transactions é ON DELETE SET NULL, na direção oposta) —
-- por isso apagamos as transactions primeiro, explicitamente, aqui.
--
-- Nota de escopo (Missão 12): `loans` (empréstimos/financiamentos/consórcios)
-- NÃO têm nenhuma coluna de vínculo com `transactions` (nem loan_id, nem
-- recurrence_id) — são uma tabela independente, sem função de criação/edição
-- no app hoje (só listLoans, leitura). Por isso não existe RPC equivalente
-- para loans: a exclusão de um loan é um DELETE simples de uma linha, sem
-- nenhuma transaction para arrastar junto.
-- =============================================================================

create or replace function public.delete_installment_purchase(_purchase_id uuid)
returns table (deleted_transactions int)
language plpgsql
security definer
set search_path = public
as $$
declare
  _deleted_count int;
begin
  with linked as (
    select transaction_id
    from public.installment_items
    where purchase_id = _purchase_id
      and transaction_id is not null
  ),
  removed as (
    delete from public.transactions
    where id in (select transaction_id from linked)
    returning id
  )
  select count(*) into _deleted_count from removed;

  delete from public.installment_purchases where id = _purchase_id;

  return query select _deleted_count;
end;
$$;

grant execute on function public.delete_installment_purchase(uuid) to authenticated;
