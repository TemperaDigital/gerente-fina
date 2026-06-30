# Refactoring de Infraestrutura — Ciclo de Consolidação

## 1. Fiação de Orçamentos (/budgets) ao Supabase

**Arquivo:** `src/routes/budgets.tsx`

- Substituir os arrays estáticos `INITIAL_BUDGETS` / `INITIAL_GOALS` por consumo real via TanStack Query:
  - `listBudgets` (já existe em `src/services/budgets.functions.ts`) → traz `amount`, `spent`, `remaining`, `percent`, `category_name` por mês de referência.
  - Adicionar `selectMonth` na URL (validateSearch) para filtrar o mês exibido.
- Modal "Definir Limite" passa a chamar `upsertBudget` (já existe), com select de categorias vindo de `listCategories` (lookup só de `kind='expense'`).
- Botão de remover linha → `deleteBudget`.
- Após mutações: `queryClient.invalidateQueries({ queryKey: ["budgets"] })` + `router.invalidate()`.
- **Metas de Poupança:** sem tabela no banco hoje. Manter o bloco escondido atrás de um aviso "Em breve" (ou remover temporariamente da UI) — não inventaremos tabela nova neste ciclo. Documentar como pendência (seção 6).

## 2. Dashboard (/dashboard) — Saldos reais + Orçamentos

**Arquivo:** `src/routes/dashboard.tsx`

- A leitura de `account_balances` já está cabeada via `getDashboardSummary`. Apenas auditar e garantir que:
  - Loader usa `ensureQueryData` (já usa) e componente usa `useSuspenseQuery` (já usa) — confirmar `defaultPreloadStaleTime: 0`.
  - Empty-state elegante quando `accounts.length === 0`.
- **Novo widget "Orçamentos do Mês":** card glassmorphism listando top 5 orçamentos com barra de progresso (consumido vs limite). Consome `listBudgets({ month })` — mesma query do /budgets para reuso de cache. Vincula `percent` direto à largura da barra; cores: verde < 70%, âmbar < 100%, vermelho ≥ 100%.

## 3. Blindagem Matemática — `toCents` + agregadores

**Novo arquivo:** `src/lib/finance/money.ts` (helper centralizado)

```text
toCents(value): bigint      // aceita string|number, normaliza vírgula/ponto,
                             // strip de R$, sinal, retorna BigInt em centavos
fromCents(cents): string    // numeric(14,2) string para persistência
addAmounts(...a): string    // soma segura, delega para cents
sumAmounts(list, pick?): string
safePercent(spent, limit): number  // 0–100, trata limit=0/null
```

**Pontos de uso a refatorar:**
- `src/services/dashboard.functions.ts` → substituir `toCents`/`addAmount` locais por import central.
- `src/services/budgets.functions.ts` → usar `toCents` (hoje usa `Math.round(Number(x)*100)` — vulnerável a 0.1+0.2).
- `src/routes/transactions.new.tsx` (form de lançamento) → ao montar o payload, normalizar valor via `toCents` antes de enviar como string.
- `src/lib/finance/invoice-due.ts` / `neutrals.ts` → revisar imports.
- Validar guards de null em: somatório de saldos (`balance ?? "0.00"`), progresso de parcelas (divisão por zero) e `safePercent` em barras de orçamento.

## 4. Tipagens de rotas — `routeTree.gen.ts`

- Arquivo é auto-gerado. Estratégia: `rm -f src/routeTree.gen.ts` na sessão, deixar Vite plugin regenerar e validar que `transactions.index.tsx` resolve `/transactions` e `transactions.new.tsx` resolve `/transactions/new`.
- Conferir grep: `grep "transactions" src/routeTree.gen.ts` após regeneração.

## 5. CI Check — TypeScript

- `tsgo --noEmit` deve sair limpo.
- Caçar `any` introduzidos no `budgets.tsx` refactor.
- Build de produção (`vite build`) opcional para validar empacotamento dos chunks SSR/worker.

---

## 6. Diagnóstico final & Pendências para 100% funcional

Ao fim do ciclo, entrego um relatório separado cobrindo:

**Implementado / Saudável**
- Schema completo (migrations 0001→0006), VIEWs account_balances / monthly_dre, trigger de faturas.
- Rotas operacionais: dashboard, transactions (index/new/edit), accounts, credit-cards, categories, settings, installments, budgets, forecast.
- Server functions: dashboard, transactions, accounts, categories, recurrences, invoices, installments, budgets, forecast, lookups, invoice-projection.
- Auth seed monousuário (primopobre).

**Faltando / Mockado (a destacar como TODO no relatório)**
- **Autenticação real:** /auth não existe; toda persistência hoje opera com seed user via service_role. RLS está ativo mas não autenticando ninguém. → Plugar `_authenticated` layout + tela de login (Supabase magic link/OAuth).
- **/chat (Gerente Fina IA):** rota existe, mas integração com Lovable AI Gateway (Whisper + Chat completion) ainda não foi cabeada.
- **/import (CSV/OFX):** UI existe, parser real e fila de conciliação contra `transactions` precisam ser plugados.
- **/open-finance (Pluggy):** placeholder; falta integração OAuth + Edge Function de sync assíncrona.
- **/forecast:** algoritmo preditivo real (média móvel / contas recorrentes projetadas).
- **Metas de poupança** (`goals`): tabela + CRUD + UI.
- **Backup/Restore/Exportação** em /settings: handlers reais (download JSON/CSV, restore com validação).
- **Exclusão de conta** com dupla confirmação real (Supabase auth admin).
- **Mobile polish:** auditar tabelas em /transactions, /installments e /credit-cards (hoje algumas quebram <640px).
- **Toasts em PT-BR**: auditar mensagens espalhadas para conformidade com a Constituição.
- **Testes**: zero cobertura — sugerir vitest mínimo para `src/lib/finance/*`.

---

## Ordem de execução (build mode)

1. Criar `src/lib/finance/money.ts`.
2. Refatorar `dashboard.functions.ts` e `budgets.functions.ts` para usar o helper.
3. Refatorar `src/routes/budgets.tsx` (real-data + modal funcional + ocultar metas).
4. Adicionar widget de Orçamentos em `src/routes/dashboard.tsx`.
5. Normalizar payload de `transactions.new.tsx` via `toCents`.
6. `rm src/routeTree.gen.ts` → restart dev.
7. `tsgo --noEmit` (CI gate).
8. Entregar relatório do item 6.
