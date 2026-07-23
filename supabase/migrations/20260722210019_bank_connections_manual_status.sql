-- =============================================================================
-- Migration 0020 — bank_connections: status 'MANUAL'
-- =============================================================================
-- Contexto: a tela /open-finance (migration 0018) foi desenhada assumindo
-- integração real com Pluggy/Belvo, mas o projeto não tem credenciais nem
-- Edge Functions dessa integração ainda — o fluxo "conectar" anterior
-- sempre falhava silenciosamente. Em vez de manter um botão que finge
-- sincronizar automaticamente, a tela passa a oferecer um cadastro MANUAL
-- de instituição (só o nome, sem sync automático), deixando 'OUTDATED' /
-- 'UPDATED' / 'LOGIN_ERROR' reservados para quando a integração real
-- existir.
-- =============================================================================

alter table public.bank_connections drop constraint if exists bank_connections_status_check;
alter table public.bank_connections
  add constraint bank_connections_status_check
  check (status in ('MANUAL','OUTDATED','UPDATED','LOGIN_ERROR'));

alter table public.bank_connections alter column status set default 'MANUAL';

-- =============================================================================
-- FIM Migration 0020
-- =============================================================================
