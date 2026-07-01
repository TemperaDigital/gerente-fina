## Objetivo
Consolidar o ecossistema Chat + Importador com uma única fonte da verdade para a "conta ativa" e deixar o preview de duplicatas 100% responsivo antes de avançarmos para Backup/Restore.

## 1. Unificar seleção de conta (Chat & Import)

Criar helper server-side compartilhado `resolveActiveAccountId()` em `src/lib/finance/active-account.server.ts`:
- Recebe `userId` já resolvido.
- Busca a primeira conta ativa (não arquivada), priorizando `bank`/`cash` sobre `credit_card`, ordenada por `created_at`.
- Lança erro em português claro se nenhuma conta ativa existir ("Nenhuma conta ativa cadastrada. Cadastre uma conta em /accounts antes de lançar transações.").
- Cache leve por request (evita 2 queries no mesmo handler).

Refatorar `src/services/chat.functions.ts`:
- Substituir a lógica inline de resolução de conta pela chamada ao novo helper.
- Envolver o `insert` em `transactions` com timeout explícito (Promise.race 10s) e retornar mensagem amigável se estourar.
- Garantir que erros de FK/constraint virem `reply` em pt-BR (não 500 cru).

Refatorar `src/routes/import.tsx` + `src/lib/supabase/import.functions.ts`:
- Adicionar server function `getDefaultImportAccount()` que reusa o mesmo helper.
- No mount da página, pré-selecionar automaticamente a conta padrão via `useSuspenseQuery` (mantendo o Select editável para o usuário trocar).
- Validar no `commitImport` que `account_id` recebido ainda existe e pertence ao user antes do bulk insert (evita erro 23503 silencioso).

## 2. Preview do Import — responsividade das linhas duplicadas

Refatorar a `<Table>` de preview em `src/routes/import.tsx`:
- Em mobile (`< sm`): trocar `<Table>` por lista de cards empilhados. Cada card mostra status (pill), data + valor no topo, descrição em 2 linhas com `line-clamp-2`, tipo abaixo.
- Cards duplicados: borda `border-red-500/40`, fundo `bg-red-500/10`, badge "Duplicado" bem visível, sem `line-through` (ilegível em mobile — trocar por opacity-60 + tag vermelha).
- Em `sm+`: manter tabela atual, mas com `min-w-0` + `truncate` nas células de descrição e `whitespace-nowrap` na data/valor.
- Header sticky (`sticky top-0`) para longas listas.
- Contador do topo: quebrar em 2 linhas em mobile (grid `grid-cols-2 sm:flex`).

## 3. Verificação final
- Rodar `tsgo --noEmit` — precisa passar limpo.
- Rodar `bun run build` — precisa terminar com Nitro gerado.
- Se ambos verdes: sinalizar OK para iniciar módulo de Backup/Restore.

## Arquivos afetados
- **Novo:** `src/lib/finance/active-account.server.ts`
- **Editar:** `src/services/chat.functions.ts`, `src/lib/supabase/import.functions.ts`, `src/routes/import.tsx`

## Fora de escopo
- Sistema de Backup/Restore (próximo ciclo, após confirmação verde).
- Mudanças no schema do banco.
- Novas migrations.
