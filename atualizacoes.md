# Atualizações — Histórico de Solicitações e Execuções

Registro de todas as missões recebidas e executadas nesta sessão, em ordem
cronológica, com os arquivos criados/alterados em cada uma.

---

## 1. Plugar regras de classificação no importador (Parte 2)

- Integrei o módulo `rules.functions.ts` (já existente) ao importador
  inteligente: regras aprendidas do usuário passaram a resolver descrições
  conhecidas ANTES de acionar a IA, com precedência tempero > regra
  aprendida > IA.
- `classifyAndCheckImport`: carrega as regras do usuário, casa por
  normalização de descrição + `kind`, e exclui as linhas resolvidas do lote
  enviado à IA (economia de tokens).
- `commitSmartImport`: passou a chamar `learnClassificationRules` de forma
  best-effort (nunca derruba a importação) após gravar os lançamentos.

**Arquivos alterados:**
- `src/lib/supabase/import.functions.ts`

---

## 2. Adicionar seção de regras de classificação em `/settings` (Parte 3)

- O componente `RulesManagerSection` foi solicitado como já existente, mas
  não estava no repositório — criei do zero.
- Painel self-contained: lista regras (`listClassificationRules`), exibe
  padrão/categoria/uso, permite excluir (`deleteClassificationRule`) com
  confirmação via `AlertDialog`.
- Plugado na tela de Configurações, entre o bloco de Backup/Exportação e a
  seção de Sessão/Logout.

**Arquivos criados:**
- `src/components/settings/rules-manager-section.tsx`

**Arquivos alterados:**
- `src/routes/_app.settings.tsx`

---

## 3. Auto-materializar recorrências ao abrir o Dashboard

- Adicionado `useEffect` no Dashboard que chama `materializeDueRecurrences`
  uma vez por montagem (guardado por `useRef` contra o StrictMode).
- Se `created > 0`: invalida as queries do dashboard e mostra toast
  informativo. Se `created === 0`: silencioso. Falha na chamada é logada no
  console e nunca quebra o carregamento da página.

**Arquivos alterados:**
- `src/routes/_app.dashboard.tsx`

---

## 4. Remover arquivo órfão duplicado

- Identificado `src/components/dashboard/_app.dashboard.tsx` como cópia
  antiga/órfã da rota real (`src/routes/_app.dashboard.tsx`), sem nenhuma
  importação apontando para ele.
- Removido via `git rm`. Eliminou 3 erros de TypeScript duplicados que esse
  arquivo órfão gerava.

**Arquivos removidos:**
- `src/components/dashboard/_app.dashboard.tsx`

---

## 5. Commit e push do trabalho acumulado

- Criado commit único reunindo os itens 1–4 (importador com IA, regras de
  classificação, ícones/cores de categorias, automações do dashboard):
  commit `792e6e3`.
- Posteriormente, a pedido do usuário, o commit foi enviado ao repositório
  remoto (`git push`) — branch `feat/clean-link-routes`.

---

## 6. Consolidar pagamento de fatura para usar a RPC atômica

- Substituído o bloco manual de `invoice_payment` em `createTransactionEntry`
  (dois inserts + delete de compensação + recálculo em JS) por uma única
  chamada RPC a `pay_credit_card_invoice` (migration 0011, dual-leg e
  idempotente).
- Adicionado campo opcional `idempotency_key` ao input.
- `CreateTransactionResultDTO` estendido com `invoice_id`, `outstanding`,
  `invoice_status`, `was_duplicate`.

**Arquivos alterados:**
- `src/services/transactions.functions.ts`

---

## 7. Importador Universal — Fase B (CSV genérico)

- Novo pipeline para reconhecer CSV de qualquer banco (não só
  Data/Descricao/Valor): detecção de schema via IA (1 chamada por arquivo),
  aplicada deterministicamente linha a linha depois.
- Funções puras de parsing de data/valor/parcelamento, com detecção de
  separador decimal BR vs. internacional por regex (sem IA).
- CSVs com colunas já conhecidas continuam no caminho rápido, sem IA.

**Arquivos criados:**
- `src/lib/finance/csv-mapping.ts`
- `src/lib/supabase/csv-schema.functions.ts`

**Arquivos alterados:**
- `src/routes/_app.import.tsx`

**Commit:** `e2757dd`

---

## 8. Importador Universal — Fase C (PDF)

- Antes de instalar qualquer dependência, pesquisei e comparei 3
  bibliotecas de extração de PDF (unpdf, pdf-parse v2, pdfjs-dist puro) e
  perguntei ao usuário — `unpdf` escolhida por não trazer binário nativo
  (evita o `@napi-rs/canvas` do pdf-parse) e por ser adequada a ambientes
  serverless.
- Extração de texto no servidor; IA extrai lançamentos + data-âncora
  (vencimento/fechamento); o ANO de cada lançamento (que aparece sem ano no
  PDF, ex. "02/08") é calculado deterministicamente, ancorado nessa data.
- Suporte a PDF protegido por senha: owner password abre transparente; user
  password aciona prompt na UI com retry; senha nunca é persistida (limpa a
  cada tentativa).
- Testei localmente com PDFs gerados via LibreOffice (extração real,
  cenários de senha, virada de ano) — a extração real pela IA sobre PDF de
  banco de verdade ficou pendente de teste no ambiente Lovable (sem
  `LOVABLE_API_KEY` neste ambiente local).
- Endurecimento posterior: timeout de 30s na chamada à IA e mensagens
  específicas para limite de requisições/créditos esgotados.
- Criado roteiro de teste manual em pt-BR para o usuário validar no preview
  da Lovable.

**Arquivos criados:**
- `src/lib/finance/pdf-statement.ts`
- `src/lib/supabase/pdf-statement.functions.ts`
- `docs/PDF_IMPORT_TEST_SCRIPT.md`

**Arquivos alterados:**
- `src/routes/_app.import.tsx`
- `.gitignore` (pasta `test-fixtures/`)

**Dependência instalada:** `unpdf`

**Commits:** `62f4118`, `0d7df40`

---

## 9. Correção contábil — Pagamento de fatura no Importador

- Diagnóstico validado com o usuário (contador): pagamento de fatura
  detectado no importador estava sendo tratado como lançamento comum de
  Receita/Despesa — errado em partidas dobradas, já que é uma liquidação.
- Linhas de pagamento passaram a ser isoladas numa seção própria
  ("Pagamento(s) de Fatura Detectado(s)"), fora da tabela normal, exigindo
  conta de origem (nunca sugerida — o extrato não informa) e fatura sendo
  quitada (sugerida por heurística, sempre editável).
- Heurística de sugestão de fatura: maior `due_date` ≤ data do pagamento,
  entre faturas `open`/`closed`, empate prioriza `closed`.
- Confirmação: linhas normais continuam por `commitSmartImport`; pagamentos
  viram chamadas independentes a `createTransactionEntry(kind:
  "invoice_payment")` via `Promise.allSettled` (uma falha não derruba as
  demais).
- `idempotency_key` determinístico (derivado de fatura+conta+data+valor) em
  vez de aleatório — reimportar o mesmo arquivo não duplica o pagamento.

**Arquivos criados:**
- `src/lib/finance/invoice-payment-match.ts`

**Arquivos alterados:**
- `src/services/invoices.functions.ts` (nova `listInvoicesForPayment`)
- `src/routes/_app.import.tsx`

**Commit:** `18977f6`

---

## 10. Reestruturação de categorias, natureza (Fixa/Variável) e ícones

- Nova coluna `nature` (enum `'FIXA'`/`'VARIÁVEL'`, nullable) em
  `categories`, via migration.
- Árvore padrão de 14 categorias principais e suas subcategorias (conforme
  lista fornecida), com `nature` por grupo. `kind` (Receita/Despesa) não
  havia sido especificado no pedido — inferido: `Receitas` = income; as
  demais 13 = expense (decisão sinalizada ao usuário para revisão).
- Seed implementado como server function idempotente
  (`seedDefaultCategories`), acionada por botão na tela — não via SQL puro,
  já que categorias são dados por usuário.
- 5 novos ícones lucide-react mapeados às categorias principais novas
  (`ShoppingBag`, `Shapes`, `Landmark`, `Wallet`, `ArrowLeftRight`).
- Upload de ícone customizado (.svg/.png, máx. 50 KB), validado no cliente
  antes de processar, com `toast.error` na mensagem exata solicitada e nota
  discreta de compatibilidade. Ícones customizados renderizados sempre via
  `<img src="data:...">` (nunca `innerHTML`) para não abrir brecha de XSS
  via SVG malicioso.
- Filtro por natureza (Todas/Fixa/Variável) adicionado à tela de
  gerenciamento de categorias, junto ao filtro existente de Despesa/Receita.

**Arquivos criados:**
- `docs/migrations/0012_categories_nature.sql`
- `src/lib/finance/default-categories.ts`

**Arquivos alterados:**
- `src/components/categories/icon-picker.tsx`
- `src/routes/_app.categories.tsx`
- `src/services/categories.functions.ts`

**Status:** ainda não commitado nesta sessão.

---

## 11. Criação deste arquivo

- Solicitado o registro de todas as solicitações e execuções desde o início
  dos trabalhos, em seções numeradas.

**Arquivo criado:**
- `atualizacoes.md`

---

## 12. Suite de testes unitários do motor matemático

- Verificado o ambiente: não havia test runner configurado (sem script
  `test`, sem Vitest instalado). Havia um `bun.lock`, mas o binário `bun`
  não está disponível neste ambiente — instalado e configurado **Vitest**,
  que integra nativamente com o Vite já usado pelo projeto.
- Config de teste isolada (`vitest.config.ts`) que NÃO importa
  `vite.config.ts` da aplicação (evita qualquer interferência dos plugins de
  build/SSR do TanStack Start/Nitro) — só replica o alias `@/` do
  `tsconfig.json`, já que os módulos testados são funções puras sem
  dependência de React/servidor/Supabase.
- Testes exaustivos para os 3 arquivos pedidos, incluindo casos de estresse
  contábil (valores negativos/saldo devedor, entradas nulas/vazias/strings
  maliciosas, bug clássico de ponto flutuante 0.1+0.2, anos bissextos,
  meses de 28/29/30/31 dias, virada de ano, empates determinísticos):
  - `money.ts` — `toCents`, `fromCents`, `addAmounts`, `sumAmounts`,
    `safePercent`, `isNegativeAmount`, `normalizeAmount`.
  - `invoice-due.ts` — `computeInvoiceDueDate`, incluindo clamps de fim de
    mês e validação de entrada fora de 1..31.
  - `invoice-payment-match.ts` — `suggestInvoiceForPayment`, incluindo
    exclusão de status `paid`/`overdue` e não-mutação do array de entrada.
- Suite executada localmente (`npm test`): **60/60 testes passando**.

**Arquivos criados:**
- `vitest.config.ts`
- `src/lib/finance/money.test.ts`
- `src/lib/finance/invoice-due.test.ts`
- `src/lib/finance/invoice-payment-match.test.ts`

**Arquivos alterados:**
- `package.json` (scripts `test` e `test:watch`)

**Dependência instalada:** `vitest` (dev dependency)

**Status:** não commitado.

---

## 13. Fixa "legenda com marcador colorido" do donut de categorias

- Pedido assumia que a legenda do donut ainda usava um marcador circular
  colorido — na verdade já usava `CategoryIcon` (ícone real, não um ponto de
  cor), então nada foi alterado nessa parte; avisei o usuário disso.
- Corrigido um bug real de flexbox encontrado na revisão: faltava `min-w-0`
  no `<span>` do nome da categoria (item flex com `truncate`) — sem isso,
  nomes longos podiam estourar a linha em vez de cortar com reticências.
  Propagado `min-w-0` em cascata e adicionado `tabular-nums` nas colunas de
  percentual/valor para não oscilarem horizontalmente.

**Arquivos alterados:**
- `src/components/dashboard/category-donut.tsx`

**Commit:** `6a1a2dd` (push feito a pedido do usuário)

---

## 14. Drill-down de extrato/fatura em /accounts e /credit-cards

- **Segregação estrita:** `/accounts` agora filtra contas tipo `credit_card`
  da listagem e do formulário de criação (`AccountForm` ganhou a prop
  `allowedTypes`, restringindo as pílulas de tipo exibidas); removida a
  lógica morta de redirecionar para `/credit-cards` ao criar cartão por lá,
  já que não é mais possível. `/credit-cards` já era exclusiva de cartões —
  só precisou do drill-down novo.
- **Painel lateral (Sheet) de drill-down:** clicar em qualquer card (conta
  ou cartão) abre um `Sheet` com o extrato daquele ativo:
  - Conta corrente/dinheiro: seletor de mês (mesmo padrão visual do
    Dashboard) + `TransactionsTable` reaproveitada de `/transactions`
    (mesmo componente, mesmos botões de editar/excluir) sobre
    `getTransactionsList`.
  - Cartão de crédito: dropdown de fatura (mês de referência) + Badge
    "Fatura Paga" (emerald) quando `status === 'paid'`, sobre
    `getInvoiceDetail` (já existia, resolve dropdown + linhas em uma
    chamada). Linhas com botões explícitos de editar (rota
    `/transactions/edit/$id`) e excluir (`discardTransaction`).
  - Nenhuma lógica de gravação nova: edição e exclusão reaproveitam 100%
    os serviços já existentes.
  - Ao fechar o painel, invalida `accounts`/`dashboard`/`invoices` como
    segurança extra além da invalidação já disparada por cada exclusão.
- `GlassCard` (componente compartilhado do Dashboard) ganhou suporte a
  props nativas de `div` (`role`, `tabIndex`, `onClick`, `onKeyDown` etc.)
  para viabilizar os cards clicáveis — mudança aditiva, não quebra nenhum
  uso existente.

**Arquivos criados:**
- `src/components/accounts/account-ledger-sheet.tsx`

**Arquivos alterados:**
- `src/routes/_app.accounts.tsx`
- `src/routes/_app.credit-cards.tsx`
- `src/components/accounts/account-form.tsx`
- `src/components/dashboard/primitives.tsx`

**Status:** não commitado.
