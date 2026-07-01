-- =============================================================================
-- Migration 0005 — Automação de Faturas de Cartão de Crédito
-- Projeto: Gerente Fina (Beta)
-- =============================================================================
-- Constituição aplicada:
--   §3  Regra do meio do mês (due_day vs closing_day) implementada no banco
--       para garantir consistência em TODA via de inserção (manual, import,
--       Pluggy, recorrência). Zero confiança em camadas externas.
--   §3  `total_amount` continua DERIVADO — esta migration só amarra a
--       transação à fatura correta e cria a fatura on-demand. O cálculo do
--       total quando a fatura fecha vive em migration futura.
--
-- Comportamento:
--   BEFORE INSERT on public.transactions:
--     1. Detecta se account.type = 'credit_card'.
--     2. Calcula o ciclo de fechamento da transação:
--          - se day(occurred_on) <= closing_day → fecha no MÊS da transação
--          - caso contrário                     → fecha no MÊS SEGUINTE
--     3. Calcula reference_month (mês civil de vencimento):
--          - se due_day  >  closing_day → MESMO mês civil do fechamento
--          - se due_day <=  closing_day → mês civil SEGUINTE ao fechamento
--     4. UPSERT idempotente na credit_card_invoices (status 'open' se nova).
--     5. Injeta NEW.invoice_id apontando para a fatura encontrada/criada.
--
--   Não interfere em pagamentos de fatura (kind='invoice_payment') nem em
--   transferências — esses não devem entrar em fatura.
-- =============================================================================

create or replace function public.tg_attach_credit_card_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account        public.accounts%rowtype;
  v_closing_month  date;
  v_reference_month date;
  v_closing_date   date;
  v_due_date       date;
  v_eff_close_day  smallint;
  v_eff_due_day    smallint;
  v_invoice_id     uuid;
begin
  -- 0) Só interessam lançamentos de despesa/receita em cartão.
  --    `invoice_payment` e `transfer` NÃO geram fatura.
  if new.kind in ('invoice_payment', 'transfer') then
    return new;
  end if;

  -- Respeita invoice_id já fornecido (ex.: importação reconciliada).
  if new.invoice_id is not null then
    return new;
  end if;

  select * into v_account from public.accounts where id = new.account_id;
  if not found or v_account.type <> 'credit_card' then
    return new;
  end if;

  -- Sanidade: cartão sem dias configurados não pode amarrar fatura.
  if v_account.closing_day is null or v_account.due_day is null then
    return new;
  end if;

  -- 1) Ciclo de fechamento da transação
  v_closing_month := date_trunc('month', new.occurred_on)::date;
  if extract(day from new.occurred_on)::smallint > v_account.closing_day then
    v_closing_month := (v_closing_month + interval '1 month')::date;
  end if;

  -- 2) reference_month conforme regra do meio do mês
  if v_account.due_day > v_account.closing_day then
    v_reference_month := v_closing_month;
  else
    v_reference_month := (v_closing_month + interval '1 month')::date;
  end if;

  -- 3) Datas exatas, respeitando meses curtos (least vs último dia do mês)
  v_eff_close_day := least(
    v_account.closing_day,
    extract(day from (v_closing_month + interval '1 month - 1 day'))::smallint
  );
  v_eff_due_day := least(
    v_account.due_day,
    extract(day from (v_reference_month + interval '1 month - 1 day'))::smallint
  );
  v_closing_date := v_closing_month + make_interval(days => v_eff_close_day - 1);
  v_due_date     := v_reference_month + make_interval(days => v_eff_due_day - 1);

  -- 4) UPSERT idempotente — usa unique (account_id, reference_month) da 0003
  insert into public.credit_card_invoices (
    user_id, account_id, reference_month,
    closing_date, due_date, status, total_amount
  )
  values (
    v_account.user_id, v_account.id, v_reference_month,
    v_closing_date, v_due_date, 'open', 0
  )
  on conflict (account_id, reference_month) do update
    set updated_at = now()  -- toca a linha pra devolver id no RETURNING
  returning id into v_invoice_id;

  -- Se a fatura já existia e o ON CONFLICT não devolveu (fallback defensivo):
  if v_invoice_id is null then
    select id into v_invoice_id
      from public.credit_card_invoices
      where account_id = v_account.id
        and reference_month = v_reference_month;
  end if;

  new.invoice_id := v_invoice_id;
  return new;
end;
$$;

drop trigger if exists transactions_attach_invoice on public.transactions;
create trigger transactions_attach_invoice
  before insert on public.transactions
  for each row execute function public.tg_attach_credit_card_invoice();

-- =============================================================================
-- FIM Migration 0005
-- Próximas:
--   0006 — Função RPC `create_transfer(...)` atômica (2 linhas / 1 transfer_id)
--   0007 — Trigger de fechamento de fatura (status → 'closed' + total_amount)
-- =============================================================================

-- Adicionando a rota /dashboard ao mapa canônico para consistência
-- com a implementação do AppShell.
--
-- /dashboard (Painel Principal): Tela inicial após o login, apresentando
-- um resumo das finanças do usuário.
