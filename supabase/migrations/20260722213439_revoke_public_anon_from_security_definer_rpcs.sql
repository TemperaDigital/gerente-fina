-- =============================================================================
-- Migration 0021 — Revoga EXECUTE de PUBLIC, anon e authenticated nas RPCs
-- security definer (correção da migration 0019, que era incompleta)
-- =============================================================================
-- Achado: a migration 0019 revogou EXECUTE apenas de `authenticated` nas 5
-- funções abaixo. Isso NÃO fechou a brecha, por dois motivos confirmados
-- diretamente no banco de produção (paxfjesglnaxaolvpgup) via
-- information_schema.role_routine_grants:
--
--   1. As 5 funções continuam com EXECUTE concedido a `PUBLIC` — o
--      pseudo-role do Postgres do qual TODO role (inclusive `authenticated`
--      e `anon`) é membro implícito. Revogar só de `authenticated` não tem
--      efeito nenhum enquanto `PUBLIC` mantiver o grant, porque
--      `authenticated` reherda acesso via `PUBLIC` de qualquer forma.
--   2. As 5 funções também têm EXECUTE concedido explicitamente a `anon` —
--      o papel usado em requisições SEM autenticação (a anon key pública,
--      embutida em src/lib/supabase/config.ts e no bundle do navegador).
--      Ou seja, nem precisa estar logado para chamar essas RPCs.
--
-- Como todas são `security definer` (rodam com privilégios que ignoram RLS,
-- equivalentes ao service_role), o estado atual permite que QUALQUER
-- visitante não autenticado, apenas com a anon key pública do projeto:
--   - corrompa o saldo devedor de fatura de qualquer usuário
--     (pay_credit_card_invoice, informando o _paid_invoice_id da vítima);
--   - redirecione um lançamento de qualquer usuário pra conta/categoria
--     arbitrária (convert_transaction_entry);
--   - apague o parcelamento de qualquer usuário só sabendo o UUID
--     (delete_installment_purchase — nem recebe user_id);
--   - grave/sobrescreva orçamento de qualquer usuário em qualquer categoria
--     (upsert_budget);
--   - leia o saldo devedor de uma fatura de qualquer usuário por UUID
--     (refresh_invoice_outstanding — vazamento de informação).
--
-- Fix: revogar EXECUTE de PUBLIC, anon E authenticated nas 5 funções, nas
-- assinaturas exatas confirmadas via pg_get_function_identity_arguments()
-- contra o banco real (idênticas às usadas na migration 0019). O app nunca
-- chama essas funções pelo client anon key — sempre via getSupabaseAdmin()
-- (service_role, src/lib/supabase/client.server.ts), que continua
-- funcionando normalmente: o Supabase concede acesso a `service_role` por
-- padrão, independente destes grants explícitos.
--
-- Status: JÁ APLICADA manualmente no Supabase (projeto paxfjesglnaxaolvpgup)
-- em 2026-07-22, antes deste commit. Grants confirmados como removidos via
-- information_schema.role_routine_grants (só restam `postgres` e
-- `service_role` nas 5 funções).
-- =============================================================================

revoke execute on function public.pay_credit_card_invoice(
  uuid, uuid, numeric, date, text, text, text
) from public, anon, authenticated;

revoke execute on function public.convert_transaction_entry(
  uuid, text, numeric, date, text, uuid, text, uuid, uuid, uuid, text
) from public, anon, authenticated;

revoke execute on function public.delete_installment_purchase(uuid)
  from public, anon, authenticated;

revoke execute on function public.upsert_budget(uuid, uuid, numeric, date)
  from public, anon, authenticated;

revoke execute on function public.refresh_invoice_outstanding(uuid)
  from public, anon, authenticated;

-- =============================================================================
-- FIM Migration 0021
-- =============================================================================
