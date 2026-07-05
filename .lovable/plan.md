## Diagnóstico do estado atual

### ✅ Rotas — saudáveis
`src/routeTree.gen.ts` contém as 18 entradas esperadas, incluindo `/agendamentos` (13 ocorrências no arquivo gerado: `AppAgendamentosRoute` + `AppAgendamentosRouteImport`, registradas em `FileRoutesByFullPath`, `FileRoutesByTo`, `FileRoutesById`, `FileRouteTypes.fullPaths/to/id`, `FileRoutesByPath`, `AppRouteChildren`). Todos os 17 arquivos `.tsx` em `src/routes/` estão mapeados 1:1.

### ✅ Build de produção — passa
`bun run build` conclui com sucesso (`✓ built in 1.47s`), Nitro gera `dist/server/wrangler.json`, `.wrangler/deploy/config.json` e `dist/client/_headers`. Deploy no Cloudflare Workers está apto.

### ❌ Typecheck (`tsgo --noEmit`) — 10 erros
Violação da Cláusula Pétrea #2 do AGENTS.md ("100% limpa antes de commit"). Todos os erros são do mesmo tema: a rota `/dashboard` passou a exigir um parâmetro de busca (`search`) e vários call-sites de `<Link to="/dashboard">` / `navigate({ to: "/dashboard" })` / `redirect({ to: "/dashboard" })` não estão passando `search`.

Arquivos e linhas afetados:
- `src/components/app-shell.tsx:56, 105` — `<Link to="/dashboard">` sem `search`.
- `src/routes/_app.accounts.tsx:161` — idem.
- `src/routes/_app.credit-cards.tsx:154` — idem.
- `src/routes/index.tsx:16, 39` — `redirect`/`navigate` para `/dashboard` sem `search`.
- `src/routes/_app.dashboard.tsx:159` — `from: "/_app/dashboard"` deve ser `"/dashboard"`.
- `src/routes/_app.dashboard.tsx:209, 259` — updater passando `{ month }` isolado (schema exige `search` completo).
- `src/routes/_app.dashboard.tsx:369` — `<Link to="/transactions">` com `{ month }` mas faltando `page` (obrigatório).

Nenhum erro toca lógica de negócio; são só assinaturas de navegação desatualizadas em relação ao search-schema atual das rotas `/dashboard` e `/transactions`.

## Plano (somente ajustes de tipagem/navegação, zero lógica)

1. **Ler** os search-schemas de `_app.dashboard.tsx` e `_app.transactions.index.tsx` para descobrir o shape/default exato exigido (`month`, `page`, etc.).
2. **`src/routes/index.tsx`** — adicionar `search: { month: <default>, ... }` no `redirect` e no `navigate` para `/dashboard`.
3. **`src/components/app-shell.tsx`** (linhas 56 e 105) — passar `search={{ ... }}` no `<Link to="/dashboard">` ou usar `search={(prev) => prev}` se quisermos preservar o atual.
4. **`src/routes/_app.accounts.tsx:161`** e **`_app.credit-cards.tsx:154`** — mesma correção do item 3.
5. **`src/routes/_app.dashboard.tsx`**:
   - linha 159: trocar `from: "/_app/dashboard"` por `from: "/dashboard"`.
   - linhas 209 e 259: usar updater funcional `search: (prev) => ({ ...prev, month: novo })` para satisfazer o schema completo.
   - linha 369: no `<Link to="/transactions">`, incluir `page: 1` junto de `month`.
6. **Revalidar**: rodar `bunx tsgo --noEmit` (deve ficar 0 erros) e `bun run build` (deve continuar passando).

## Observações
- Build/deploy não estão bloqueados hoje (Vite/Nitro ignoram erros de tipo), mas o gate de qualidade do projeto sim.
- Nada em `services/*`, migrations, RLS, ou motores de invoice/parcelamento será tocado.
