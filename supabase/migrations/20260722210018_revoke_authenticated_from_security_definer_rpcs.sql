-- =============================================================================
-- Migration 0019 — Revoga EXECUTE de `authenticated` nas RPCs security definer
-- =============================================================================
-- Achado da Missão 30 (auditoria de isolamento entre usuários): as 5 funções
-- abaixo são `security definer` (rodam com privilégios que ignoram RLS,
-- iguais ao service_role) e foram criadas com `grant execute ... to
-- authenticated`. Isso significa que QUALQUER usuário autenticado deste
-- projeto pode chamá-las direto pela REST API do Supabase
-- (POST /rest/v1/rpc/<função>, com a anon key pública + o próprio JWT),
-- contornando 100% das checagens de dono que só existem na camada
-- TypeScript (src/services/transactions.functions.ts,
-- installments.functions.ts, budgets.functions.ts) — o comentário em
-- transactions.functions.ts (linhas ~1306-1310) já documentava essa
-- limitação das RPCs, mas o GRANT deixava a porta aberta mesmo assim.
--
-- Concretamente, sem esta migration, um usuário autenticado qualquer podia:
--   - "pagar"/corromper o saldo devedor de uma fatura de OUTRO usuário
--     (pay_credit_card_invoice, informando o _paid_invoice_id da vítima);
--   - redirecionar um lançamento de OUTRO usuário pra conta/categoria
--     arbitrária (convert_transaction_entry);
--   - apagar o parcelamento de OUTRO usuário só sabendo o UUID
--     (delete_installment_purchase nem recebe user_id);
--   - gravar/sobrescrever orçamento de OUTRO usuário em qualquer categoria
--     (upsert_budget);
--   - ler o saldo devedor de uma fatura de OUTRO usuário por UUID
--     (refresh_invoice_outstanding — vazamento de informação, não escrita).
--
-- Fix: revogar EXECUTE de `authenticated`. O app nunca chama essas funções
-- pelo client anon key — sempre via getSupabaseAdmin() (service_role,
-- src/lib/supabase/client.server.ts), que continua funcionando normalmente:
-- o Supabase concede acesso a `service_role` por padrão, independente deste
-- grant explícito (confirmado pelo padrão já usado em todas as chamadas
-- .rpc(...) do projeto, nenhuma delas passa pelo client anon key).
-- =============================================================================

revoke execute on function public.pay_credit_card_invoice(
  uuid, uuid, numeric, date, text, text, text
) from authenticated;

revoke execute on function public.convert_transaction_entry(
  uuid, text, numeric, date, text, uuid, text, uuid, uuid, uuid, text
) from authenticated;

revoke execute on function public.delete_installment_purchase(uuid) from authenticated;

revoke execute on function public.upsert_budget(uuid, uuid, numeric, date) from authenticated;

revoke execute on function public.refresh_invoice_outstanding(uuid) from authenticated;

-- =============================================================================
-- FIM Migration 0019
-- =============================================================================
