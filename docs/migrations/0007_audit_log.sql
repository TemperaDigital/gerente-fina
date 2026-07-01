-- 0007_audit_log.sql
-- Trilha de auditoria durável para operações críticas (backup/restore/futuras).
-- Cada linha representa um evento imutável associado ao usuário autenticado.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_user_created_idx
  ON public.audit_log (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_own" ON public.audit_log;
CREATE POLICY "audit_log_select_own"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "audit_log_insert_own" ON public.audit_log;
CREATE POLICY "audit_log_insert_own"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
