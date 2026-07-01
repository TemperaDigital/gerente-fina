
# Virada de Produção — Gerente FINA

Ciclo único com typecheck limpo e `vite build` verde. Remove o usuário semente (`primopobre@gmail.com`) e liga o sistema à sessão real do Supabase Auth.

---

## 1. Autenticação Real e Proteção de Rotas

### 1.1 Substituir `resolveActiveUserId`
- Reescrever `src/lib/supabase/resolve-user.ts` para:
  - Ler o cookie `sb-<project>-auth-token` via `getCookie` do `@tanstack/react-start/server`.
  - Validar o token com `supabaseAdmin.auth.getUser(token)` (não confia no client).
  - Retornar `user.id`. Se ausente ou inválido, `throw new Error("UNAUTHENTICATED")`.
  - Remover totalmente o fallback do seed `primopobre@gmail.com` e o `createSeedUser`.
- Todas as server functions que já usam `resolveActiveUserId()` continuam funcionando — apenas passam a exigir sessão.

### 1.2 Cliente Supabase no browser
- Ajustar `src/lib/supabase/client.ts` para persistir sessão em `localStorage` **e** espelhar em cookie (`sb-<ref>-auth-token`) para que o SSR leia — usar `storage: cookieStorage` via helper local ou registrar `onAuthStateChange` que sincroniza `document.cookie`.

### 1.3 Rotas de auth (Shadcn/UI, pt-BR)
- Criar:
  - `src/routes/login.tsx` — email + senha, botão "Entrar", link p/ cadastro e "Esqueci a senha".
  - `src/routes/signup.tsx` — email + senha + confirmação. `emailRedirectTo: window.location.origin`.
  - `src/routes/forgot-password.tsx` — `resetPasswordForEmail` com `redirectTo: origin + /reset-password`.
  - `src/routes/reset-password.tsx` — detecta `type=recovery`, chama `updateUser({ password })`.
- Todas rotas públicas (fora de proteção), com `head()` próprio em pt-BR.

### 1.4 Guarda global
- Criar layout pathless `src/routes/_app.tsx` com `beforeLoad` que chama `supabase.auth.getSession()`; se ausente → `redirect({ to: "/login" })`. `ssr: false`.
- Mover as rotas internas (`dashboard`, `transactions*`, `accounts`, `credit-cards`, `categories`, `installments`, `budgets`, `forecast`, `settings`, `chat`, `import`, `open-finance`) para nomes prefixados `_app.<rota>.tsx` (renomear arquivos preservando conteúdo).
- Rota `/` (index) permanece pública e redireciona para `/dashboard` quando logado, `/login` quando não.

### 1.5 Onboarding blank-state
- Novo componente `src/components/onboarding/first-account-modal.tsx` (Shadcn `Dialog`).
- No `_app.tsx` (após auth), disparar `useQuery` que checa `accounts.count` + `categories.count`. Se ambos 0, abrir modal convidando a cadastrar a primeira conta (link para `/accounts`).

---

## 2. Refinamento do `/forecast`

### 2.1 Controles de Horizonte
- Adicionar `ToggleGroup` (Shadcn) com opções 30/60/90 dias no cabeçalho. Estado local `horizon`, invalidar `queryKey: ["forecast", horizon]`.
- `getForecast({ data: { days } })` já aceita param — apenas passar dinamicamente.

### 2.2 Estados da tela
- Loading: skeleton de KPIs + gráfico (usar `Skeleton` do Shadcn), enquanto `isFetching`.
- Empty state: se `result.points.length === 0` **ou** `Number(result.avg_daily_expense) === 0` com <30 dias de histórico → card "Histórico insuficiente" (mín. 30 dias de despesas para calcular média móvel).
- Sinalizar no backend: adicionar campo `has_sufficient_history: boolean` em `ForecastResultDTO` (true se >=30 dias com transações debit).

---

## 3. Blindagem do Restore + Auditoria Durável

### 3.1 Migration nova
- `docs/migrations/0007_audit_log.sql`:
  ```sql
  CREATE TABLE public.audit_log (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    action text not null,           -- 'backup.export' | 'backup.restore' | 'backup.restore.failed'
    payload jsonb not null default '{}',
    created_at timestamptz not null default now()
  );
  GRANT SELECT, INSERT ON public.audit_log TO authenticated;
  GRANT ALL ON public.audit_log TO service_role;
  ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "own audit" ON public.audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());
  CREATE POLICY "insert own audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  ```

### 3.2 Validação Zod financeira ultra estrita
- Em `backup.functions.ts`:
  - Criar `MoneySchema` = `z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/)` (compatível `numeric(14,2)`).
  - `TransactionSchema.amount` = `MoneySchema` (aceita string OR number, transformando number com `.toFixed(2)`).
  - `AccountSchema.credit_limit` = mesma regra, nullable.
  - Validar totais: rejeitar payloads com `transactions.length > 50000`.

### 3.3 Persistência de auditoria
- Substituir `console.info("[AUDIT] ...")` por `supabaseAdmin.from("audit_log").insert({ user_id, action, payload })`.
- Envolver `restoreBackup` em try/catch: em falha, gravar `backup.restore.failed` com `error.message` no payload e re-lançar.

### 3.4 UI de progresso no Restore
- Em `src/routes/settings.tsx`:
  - Estado local `restoreState: 'idle' | 'reading' | 'validating' | 'uploading' | 'done' | 'error'`.
  - Renderizar `<Progress>` (Shadcn) + label textual durante etapas.
  - Ao concluir, exibir toast Sonner com contagens (`accounts_upserted`, etc.).

---

## Técnico

- **Renomeações**: usar `mv` para prefixar rotas internas com `_app.`. Regenerar `routeTree.gen.ts` automaticamente pelo plugin Vite.
- **Cookie SSR**: chave = `sb-${SUPABASE_PROJECT_ID}-auth-token`. Ler `SUPABASE_PROJECT_ID` de env (já disponível).
- **Sem seed**: remover `SEED_EMAIL`, `SEED_PASSWORD`, `createSeedUser`, `cachedUserId`.
- **Type-safety**: manter `resolveActiveUserId(): Promise<string>` — quem chama já espera string, e o throw propaga.
- **Compat numeric(14,2)**: `MoneySchema` garante formato exato antes do upsert.
- **Build**: `bun run build` deve terminar em exit 0. `tsgo --noEmit` limpo.

---

Confirma para eu executar? É um ciclo grande (≈15 arquivos criados/editados + 1 migration SQL para você aplicar no Supabase).
