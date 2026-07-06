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

---

## 15. Descarte de pagamento sem fatura + Conversão segura de tipo de lançamento

- **Parte 1 — Descarte:** cada linha de "Pagamento(s) de Fatura
  Detectado(s)" no importador ganhou um botão de lixeira para descartar a
  linha por completo do lote (sem fatura disponível, não vira lançamento
  comum — vira nada).
- **Parte 2 — Conversão estrutural:** nova ação "Converter lançamento..."
  em `/transactions/edit/$id`, separada da retificação/edição já existente.
  Desfaz a estrutura antiga (parcelamento via `installment_items`,
  recorrência, transferência ou pagamento de fatura) e recria com o novo
  `kind`, tudo atomicamente via RPC nova `convert_transaction_entry`
  (migration 0013).
- **Pausa por ambiguidade de schema (guardrail seguido à risca):** parei e
  usei `AskUserQuestion` ao encontrar 2 divergências entre o schema
  assumido e o real — (a) não existe `installment_purchase_id` em
  `transactions`, o vínculo é indireto via `installment_items.transaction_id`;
  (b) a migration 0011 (`pay_credit_card_invoice`) não estava versionada no
  repo. Usuário confirmou usar a estrutura real e colou o SQL completo da
  migration 0011, revelando que a idempotência mora em
  `transactions.external_id` (índice único parcial), não em tabela própria.

**Arquivos criados:**
- `docs/migrations/0013_convert_transaction_entry.sql`

**Arquivos alterados:**
- `src/services/transactions.functions.ts` (`convertTransactionEntry`, `getTransactionById` estendido)
- `src/routes/_app.transactions.edit.$id.tsx`
- `src/routes/_app.import.tsx` (botão de descarte)

**Commit:** `6c165f7`. **Migração 0013 aplicada no Supabase** (confirmado pelo usuário).

---

## 16. Importador reconhece parcelamento e assinatura recorrente

- Regra-mestra: nunca criar parcelamento ou recorrência novos sem antes
  tentar casar com uma estrutura já existente — evita duplicidade contábil.
- **Parcelamento:** ao detectar "Parcela X/Y", busca `installment_purchases`
  compatível (mesma conta, mesma quantidade de parcelas, descrição
  normalizada via `derivePattern`). Achou → oferece "Vincular parcelamento
  existente". Não achou e é a 1ª parcela (1/Y, Y≥2) → oferece "Criar novo
  parcelamento". Não achou e é parcela do meio (ex.: 8/10) → nenhuma ação,
  mantém texto simples (nunca reconstrói histórico).
- **Recorrência:** achou `recurrences` compatível → vincula em silêncio (sem
  UI, o materializador já cobre meses futuros). Não achou mas parece
  assinatura (categoria "assinatura" OU descrição+valor repetidos em meses
  anteriores) → oferece "Converter em recorrência mensal".
- Nova função pura `estimateInstallmentSeries` (direção oposta à divisão de
  total existente em `createTransactionEntry`: aqui parte-se de UMA parcela
  conhecida para estimar a série).
- Correções feitas antes de rodar `tsc`: heurística de "categoria parece
  assinatura" só pode rodar DEPOIS da categoria final ser resolvida (regra
  do usuário > regra aprendida > IA), então foi movida para o passo 4;
  guarda para hint "1/1" (não é parcelamento real); correlação de linhas
  pós-insert em lote feita por `dedup_hash` (chave única) em vez de
  posição no array, por segurança.
- Mental-test confirmado: CSV do Nubank com "8/10", "12/12", "7/7" nunca
  oferece "criar novo parcelamento" (só ofertas de vínculo ou nada).

**Arquivos criados:**
- `src/lib/finance/installment-split.ts` + `.test.ts`

**Arquivos alterados:**
- `src/lib/supabase/import.functions.ts`
- `src/routes/_app.import.tsx`

**Commit:** `aef9fcf` (parte do trabalho já havia sido auto-commitada pela ferramenta do usuário em `972f43a`/`dce5901`, com mensagens placeholder — não reescrevi esse histórico).

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 64/64 · eslint sem erros reais (só ruído pré-existente de `prettier/prettier`).

---

## 17. Exportar/Imprimir Lançamentos com filtros de período e tipo de conta

- Botão "Exportar / Imprimir" na tela de Lançamentos abre diálogo com
  filtros PRÓPRIOS (independentes dos já aplicados na tela): período
  (todos/mês específico/intervalo de datas) e "Tipo de Conta"
  (cartão/conta/todos) — renomeado de "Conta" para não confundir com o
  filtro de conta específica já existente na tela.
- Botão "Importar" adicionado ao lado, apenas um link para `/import` (sem
  mecanismo de import paralelo).
- Nova server function `getTransactionsForExport` retorna TODAS as linhas
  do filtro (sem paginação); refatorei a lógica de enriquecimento
  (contraparte de transferência + progresso de parcela) de
  `getTransactionsList` para uma função compartilhada `enrichTransactionRows`,
  reaproveitada pelos dois endpoints.
- "Exportar CSV": monta CSV client-side e dispara download via Blob (BOM
  UTF-8 para acentuação correta em Excel).
- "Imprimir / Salvar PDF": abre uma janela dedicada (`window.open` +
  `document.write`) com HTML autocontido — fundo branco/texto preto
  independente do tema escuro do app, cabeçalho repetindo via
  `thead { display: table-header-group }`, `tr { break-inside: avoid }` e
  `window.print()` — sem instalar nenhuma lib de geração de PDF.
- Decisão de bom senso não coberta explicitamente na missão: o rodapé da
  tabela de impressão mostra o saldo do período (receitas − despesas),
  excluindo transferências e pagamentos de fatura da soma (não são
  resultado, são movimentação patrimonial).

**Arquivos criados:**
- `src/components/transactions/export-print-dialog.tsx`

**Arquivos alterados:**
- `src/services/transactions.functions.ts` (`getTransactionsForExport`, `enrichTransactionRows`)
- `src/routes/_app.transactions.index.tsx`

**Commit:** `a175e40`.

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 64/64 · eslint sem erros reais.

**Status:** enviado ao GitHub (`git push`).

---

## 18. Histórico de conversas no Chat IA

- Duas tabelas novas (migration 0014): `chat_threads` (title nullable,
  updated_at) e `chat_messages` (role user/assistant, content), RLS por
  `auth.uid()` com `user_id` duplicado em `chat_messages` — mesmo padrão
  de `installment_items` (migration 0003), evitando join na policy.
- Server functions novas em `chat.functions.ts`: `listChatThreads` (com
  prévia da última mensagem, calculada em JS a partir de uma query
  ordenada por `created_at desc`), `createChatThread`, `getChatThreadMessages`,
  `appendChatMessage`, `deleteChatThread`.
- `sendChatMessage` foi adaptada para persistir a mensagem do usuário E a
  resposta da IA a cada troca — a lógica de chamada à IA em si foi extraída
  intacta para uma função interna `computeReply` (não exportada, não é mais
  uma server function própria) e envolvida por uma camada de persistência
  que roda depois; falha ao persistir histórico não bloqueia a resposta ao
  usuário (só loga no servidor).
- UI: coluna lateral de conversas em `/chat` (lista mais recente primeiro,
  prévia de texto, data), virando `Sheet` (drawer) no mobile via botão no
  cabeçalho — mesmo componente já usado em `AccountLedgerSheet`. Nova
  conversa é criada automaticamente no primeiro envio de mensagem (usuário
  nunca precisa clicar em "Nova conversa" antes de poder mandar a primeira).
  Exclusão de thread com confirmação (`AlertDialog`, mesmo padrão de outras
  telas).
- Nenhuma ferramenta nova de IA foi adicionada (fora de escopo — Missão 9).

**Arquivos criados:**
- `docs/migrations/0014_chat_threads_and_messages.sql`

**Arquivos alterados:**
- `src/services/chat.functions.ts`
- `src/routes/_app.chat.tsx`

**Commit:** `df9c046`.

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 64/64 · eslint sem erros reais.

**Pendente:** aplicar a migration 0014 no Supabase antes de usar em produção (ainda não confirmado pelo usuário).

**Status:** enviado ao GitHub (`git push`).

---

## 19. Categorias criadas pelo Importador recebem natureza "Variável" por padrão

- A coluna `categories.nature` (enum `category_nature`, migration 0012) é
  nullable e sem default no banco. O único fluxo de auto-criação de
  categoria pelo importador é o insert direto em `commitSmartImport`
  (`new_category_name`) — não passa por `createCategory`
  (`categories.functions.ts`), então o ajuste foi feito diretamente ali.
- Insert agora sempre envia `nature: "VARIÁVEL"` (valor exato do enum,
  com acento) ao criar categoria nova. Reclassificação manual como
  "FIXA" continua disponível em `/categories`, sem nenhuma tentativa da
  IA de adivinhar a natureza (fora de escopo desta missão).
- Confirmado que `seedDefaultCategories` (fluxo separado, não tocado)
  já define `nature` a partir da árvore padrão — não precisava de ajuste.

**Arquivos alterados:**
- `src/lib/supabase/import.functions.ts`

**Commit:** `5ccec27`.

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 64/64 · eslint sem erros reais.

**Status:** enviado ao GitHub (`git push`).

---

## 20. Agente de Chat com Ferramentas — criar, consultar, corrigir, relatórios

- **Defeito corrigido:** o chat antigo (`resolveActiveAccount` + primeira
  categoria da lista) criava lançamentos sozinho ao receber algo como
  "gastei 25 hoje", escolhendo conta e categoria sem perguntar nada —
  contrariava a regra de nunca decidir por conta própria um dado que só o
  usuário sabe. Confirmado lendo o código antigo antes de alterar.
- Substituído por um agente multi-turno com tool calling (mesmo padrão
  HTTP de `classifyBatchWithAI`, mas SEM `tool_choice` forçado — o modelo
  pode responder texto, perguntar, ou chamar uma ferramenta).
- **Ferramentas:** `create_transaction` (reaproveita `createTransactionEntry`
  — nenhuma lógica de hash/dedup/atomicidade duplicada; nunca inventa
  `account_id`/`category_id`; categoria nova criada com `nature: "VARIÁVEL"`,
  mesma regra da Missão 11), `query_transactions_summary`,
  `get_income_expense_report` (lê as views `monthly_dre`/
  `monthly_dre_by_category`, já existentes desde a migration 0004),
  `get_installments_report` (parcelas restantes + comprometimento por mês,
  sem estimar renda), `find_transaction_candidates` (reaproveita
  `normalizePattern` de `rules.functions.ts` para casar descrição
  aproximada, tolerante a acento) e `delete_transaction` (exige
  `confirmed: true` — bloqueado em CÓDIGO, não só pedido no prompt).
- Prompt de sistema embute as contas/categorias reais do usuário (mesmo
  padrão de `categoryList` do importador) e as regras inegociáveis: nunca
  inventar conta/categoria, só perguntar sobre parcelamento se a conta for
  `credit_card`, nunca excluir sem confirmação explícita no turno anterior,
  nunca reportar números sem ter chamado a ferramenta correspondente.
  Preservada a regra determinística preexistente dos "temperos"
  (MariaReniele/Woshington → Alimentação // mercearia).
- Loop com teto de 6 iterações de ferramentas por mensagem (segurança
  contra loop infinito); histórico persistido (Missão 8) continua sendo
  só o texto final de cada turno — as idas e vindas internas de ferramenta
  não viram mensagens na thread.
- `ChatResponse.transaction.id` virou opcional (createTransactionEntry não
  retorna o id da transação criada nos fluxos de receita/despesa/parcela) e
  ganhou `transactionDeleted?` para a UI invalidar caches/mostrar toast
  também quando o agente exclui um lançamento.
- Ambiguidade de spec resolvida com bom senso (não travou o trabalho): a
  missão listava os campos de `create_transaction` sem
  `counterpart_account_id`/`paid_invoice_id`, mas `kind` inclui
  transfer/invoice_payment, que exigem esses campos em
  `createTransactionEntry`. Adicionei os dois como parâmetros opcionais
  (nomes já existentes, não inventados) e documentei no prompt; se
  ausentes, a própria validação de `createTransactionEntry` já devolve um
  erro claro que o agente repassa ao usuário — sem nenhuma lógica extra.

**Arquivos alterados:**
- `src/services/chat.functions.ts`
- `src/routes/_app.chat.tsx`

**Commits:** `f88360c` (agente + ferramentas), `e1b0202` (UI reage à exclusão).

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 64/64 · eslint sem erros reais.

**Pendente:** não foi possível testar a chamada real à IA neste ambiente (sem `LOVABLE_API_KEY`/rede de saída no sandbox) — peço que teste manualmente o caso do defeito relatado ("gastei 25 hoje" sem contexto deve gerar uma pergunta sobre a conta, nunca criar sozinho).

**Status:** enviado ao GitHub (`git push`).

---

## 21. Sincronizar exclusão entre Lançamentos e as 4 estruturas de /installments

- **Investigação de schema (feita antes de qualquer código, como pedido):**
  achado real e documentado no código — `installment_purchases`/
  `installment_items` TÊM vínculo de fato com `transactions`
  (`installment_items.transaction_id`, `ON DELETE SET NULL`), mas `loans`
  (empréstimos/financiamentos/consórcios) NÃO têm nenhuma coluna de vínculo
  com `transactions` — nem `loan_id`, nem reaproveitamento de
  `recurrence_id` — e não existe nenhuma função de criação/pagamento para
  `loans` no app hoje, só `listLoans` (leitura). Ou seja: a Parte 1 da
  missão (avisar/sincronizar ao excluir um lançamento vinculado) só se
  aplica de fato a parcelamentos — para `loans` não há o que sincronizar,
  porque não há vínculo nenhum a quebrar.
- **Parte 1:** `getTransactionDeleteImpact` avisa, antes de excluir um
  lançamento comum, se ele é uma parcela vinculada a `installment_purchases`
  (mostra descrição da compra e "X/Y"). Se for a ÚLTIMA parcela ainda
  vinculada, oferece um checkbox "excluir também o parcelamento inteiro".
  Nova RPC atômica `delete_installment_purchase` (migration 0015, mesma
  disciplina de `pay_credit_card_invoice`) apaga o cabeçalho E qualquer
  transaction ainda vinculada numa única transação de banco.
- **Parte 2:** ícone de excluir em TODOS os 4 tipos de card em
  `/installments`. Parcelamento chama a mesma RPC atômica (informa quantos
  lançamentos foram removidos junto); `loans` usa um `DELETE` simples
  (`deleteLoan`) — sem RPC, porque não há nada para arrastar.
- Escopo mantido enxuto de propósito: a fila de conciliação (`DiscardButton`
  em `ReviewQueue`) não foi alterada — o pedido era especificamente sobre o
  botão de excluir da tela de Lançamentos (`TransactionRow`), que também
  cobre `/accounts` e `/credit-cards` via `AccountLedgerSheet` (mesmo
  componente reaproveitado).

**Arquivos criados:**
- `docs/migrations/0015_delete_installment_purchase.sql`

**Arquivos alterados:**
- `src/services/transactions.functions.ts` (`getTransactionDeleteImpact`)
- `src/services/installments.functions.ts` (`deleteInstallmentPurchase`, `deleteLoan`)
- `src/components/transactions/list-ui.tsx`
- `src/routes/_app.transactions.index.tsx`
- `src/routes/_app.installments.tsx`

**Commits:** `1f50310` (Parte 1), `dc14001` (Parte 2).

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 64/64 · eslint sem erros reais.

**Status:** enviado ao GitHub (`git push`).

---

## 22. Contas a Vencer — /agendamentos + widget no Dashboard (correção de comportamento por tipo de conta)

- Mission recebida como correção urgente a uma "Missão 7" que, na
  investigação, não existia ainda no código de forma alguma (nem tela, nem
  widget, nem distinção de conta no motor) — reportado ao usuário antes de
  codar; ele optou por terminar a Missão 12 primeiro e só depois seguir com
  esta.
- **Parte 1 (schema/motor):** `materializeDueRecurrences` agora NUNCA
  materializa sozinho recorrências de conta bank/cash — só credit_card
  continua automática. Nova frequência `'once'` (migration 0016,
  `ALTER TYPE ... ADD VALUE`) para ocorrência única; `computeNextRun` lança
  erro de propósito se chamada para `'once'`, `occurrencesUntil` trata como
  caso especial. Testes novos (`recurrence-schedule.test.ts`, 9 casos).
  Novo `scheduled-items.functions.ts`: `listScheduledItems` (leitura) e
  `confirmScheduledItem` ("Marcar como pago/recebido" — cria o lançamento
  real via `createTransactionEntry` e avança a partir da data
  ORIGINALMENTE agendada, não da data real de confirmação, evitando
  arrastar o calendário por atrasos pontuais).
  `createTransactionEntry` ganhou campo aditivo opcional
  `link_recurrence_id` (vincula a uma recorrência JÁ EXISTENTE, distinto de
  `recurrence` que cria uma nova — necessário porque a função original não
  tinha como vincular a uma recorrência existente).
- **Parte 2 (tela):** `/agendamentos` lista agendamentos ativos agrupados
  em Atrasados/Próximos 30 dias/Mais adiante. CRUD completo
  (create/update/delete) com um único campo de data no formulário
  representando `next_run_on` — `day_of_month` é sempre derivado dela, não
  é campo separado (simplificação deliberada, não coberta explicitamente
  na missão). Ação por item conforme tipo de conta. Exclusão não apaga
  lançamentos já materializados (`recurrence_id` é `ON DELETE SET NULL`).
  Link adicionado ao menu.
- **Parte 3 (widget):** "Contas a Vencer" no Dashboard, reaproveitando
  `listScheduledItems` com a MESMA query key da tela `/agendamentos`
  (invalidação compartilhada automática), filtrado para 30 dias +
  atrasados, até 5 itens, sem ação de confirmar (só lembrete).
- **Nota técnica sobre `routeTree.gen.ts`:** uma regeneração via `vite
  build` local introduziu um bloco de augmentação de tipos ausente do
  arquivo committado, que quebrou o typecheck de várias rotas
  pré-existentes — revertido; apliquei manualmente só o trecho aditivo da
  rota nova, no mesmo formato mecânico do gerador.

**Arquivos criados:**
- `docs/migrations/0016_recurrence_once.sql`
- `src/lib/finance/recurrence-schedule.test.ts`
- `src/services/scheduled-items.functions.ts`
- `src/routes/_app.agendamentos.tsx`

**Arquivos alterados:**
- `src/lib/finance/recurrence-schedule.ts`
- `src/services/recurrence-materializer.functions.ts`
- `src/services/transactions.functions.ts` (`link_recurrence_id`)
- `src/components/app-shell.tsx`
- `src/routeTree.gen.ts`
- `src/routes/_app.dashboard.tsx`

**Commits:** `01c29fb` (Parte 1), `08afdc5` (Parte 2), `2c7acbe` (auto-commit da ferramenta do usuário, capturou parte do trabalho da Parte 3 em andamento), `738c9af` (Parte 3, finalização).

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 73/73 · eslint sem erros reais.

**Status:** enviado ao GitHub (`git push`).

---

## 23. Exportação e tela de Lançamentos ganham colunas de Fatura e Natureza

- Pedido do usuário a partir de um exemplo de CSV exportado (6 colunas):
  acrescentar "Fatura" (mês de referência da fatura de cartão) e "Tipo de
  Despesa" (Fixa/Variável), totalizando 8 colunas no CSV/impressão — e
  exibir a mesma informação na tela de Lançamentos.
- "Fatura": `transactions.invoice_id` já é preenchido automaticamente pelo
  trigger `tg_attach_credit_card_invoice` (migration 0005) para despesas em
  cartão — só precisei juntar com `credit_card_invoices.reference_month` e
  formatar como MM/AAAA. "Tipo de Despesa": `categories.nature`
  (Fixa/Variável, migration 0012).
- `enrichTransactionRows` (compartilhada por `getTransactionsList` e
  `getTransactionsForExport` desde a Missão 10) ganhou uma query em lote
  para o mês de fatura, além de incluir `nature` no join de categorias já
  existente — sem duplicar lógica entre listagem paginada e exportação.
- Tela de Lançamentos: badge "Fat. MM/AAAA" quando aplicável, e
  "(Fixa/Variável)" ao lado do nome da categoria na linha.

**Arquivos alterados:**
- `src/services/transactions.functions.ts`
- `src/components/transactions/export-print-dialog.tsx`
- `src/components/transactions/list-ui.tsx`

**Commit:** `d41c222`.

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 73/73 · eslint sem erros reais.

**Status:** enviado ao GitHub (`git push`).

---

## 24. Seleção múltipla e exclusão em lote na tela de Lançamentos

- Cada linha ganhou um checkbox de seleção; barra de "Selecionar todos" (a
  seleção é relativa à página atual — reseta ao trocar de página, para não
  arrastar uma seleção de itens que não estão mais visíveis) aparece acima
  da lista, com botão "Excluir selecionados" quando há pelo menos 1 item
  marcado.
- Confirmação via `AlertDialog` avisa que parcelas de cartão porventura
  incluídas no lote voltam a "não paga" (mesmo comportamento já
  estabelecido na exclusão individual da Missão 12) — o parcelamento em si
  não é excluído.
- Nova server function `bulkDiscardTransactions`: um único
  `DELETE ... WHERE id IN (...)` em vez de N chamadas separadas.
- Seleção é opcional via prop `onBulkDelete` em `TransactionsTable` — sem
  essa prop (outros usos do componente, como o drill-down de `/accounts` e
  `/credit-cards` via `AccountLedgerSheet`), nenhuma checkbox aparece.

**Arquivos alterados:**
- `src/services/transactions.functions.ts`
- `src/components/transactions/list-ui.tsx`
- `src/routes/_app.transactions.index.tsx`

**Commit:** `dfbfad0`.

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 73/73 · eslint sem erros reais.

**Status:** não enviado ao GitHub ainda (aguardando confirmação do usuário para push).

---

## 25. KPIs do Dashboard em regime de caixa + card "Disponível para Variáveis"

- Os 3 KPIs do topo (Receitas, Despesas, Resultado líquido) usavam
  `monthly_dre` — regime de COMPETÊNCIA, incluindo compras no cartão do mês
  corrente mesmo que o dinheiro só saia da conta no mês seguinte (pagamento
  da fatura). Passaram a usar uma nova leitura em REGIME DE CAIXA: só conta
  dinheiro que de fato entrou/saiu de contas `bank`/`cash` no período.
- Nova server function `getCashBasisSummary` (`src/services/dashboard.functions.ts`):
  - **Receitas (caixa):** `kind='income'` em contas bank/cash.
  - **Despesas (caixa):** `kind='expense'` em contas bank/cash **+** a perna
    débito de `kind='invoice_payment'` em contas bank/cash (o pagamento de
    fatura saindo da conta corrente). Despesas em cartão (`credit_card`) NÃO
    entram — só entram quando a fatura é paga, no mês do pagamento.
  - **Despesas Fixas (caixa):** subconjunto de Despesas (caixa) cuja
    categoria tem `nature='FIXA'` (migration 0012) — automaticamente exclui
    `invoice_payment` (categoria sempre nula por CHECK).
  - **Disponível para Variáveis** = Receitas (caixa) − Compromissos, onde
    Compromissos = Despesas Fixas (caixa) + parcelas de cartão com
    vencimento no período ainda não postadas (`installment_items` com
    `transaction_id` nulo — mesma convenção já usada em `getForecast`) +
    recorrências de despesa em contas bank/cash com vencimento no período
    ainda não materializadas (`recurrences` ativas — as de cartão já são
    materializadas automaticamente pelo motor e viram `transaction` real).
  - **Empréstimos/financiamentos/consórcios (`loans`) ficam de fora do
    cálculo de Compromissos** — mesmo achado da Missão 12: `loans` não tem
    nenhum vínculo com `transactions` no schema atual, então não há como
    saber com confiança o vencimento de cada parcela por mês. Em vez de
    inventar uma aproximação, o DTO devolve um array `caveats` com essa
    limitação documentada, exibido como nota no rodapé dos KPIs e no
    `title` do card.
- Dashboard (`_app.dashboard.tsx`): os 4 cards de KPI continuam em uma
  grade `sm:grid-cols-2 lg:grid-cols-4` — removido o card solto "Saldo
  Consolidado" (informação já existe, mais correta, por conta individual no
  `AccountsWidget`) e no lugar entrou "Disponível p/ Variáveis", com
  destaque visual forte (fundo/anel vermelho + ícone de alerta) quando
  negativo — sinal de que o usuário já comprometeu mais do que vai receber.
- **Teste de sanidade (analítico, não numérico contra dado real — ver
  limitação abaixo):** pela própria fórmula da view `account_balances`
  (migration 0004), o saldo de uma conta é `Σ(credit) − Σ(debit)` de todas
  as suas transações. Somando isso só para contas bank/cash e só dentro do
  período: `income` credita, `expense` debita, a perna débito de
  `invoice_payment` debita (a perna crédito cai no cartão, fora do grupo
  bank/cash) e as duas pernas de `transfer` sempre caem dentro do próprio
  grupo bank/cash (debita numa conta, credita noutra), então se cancelam na
  soma agregada. Logo, `Δ saldo(bank/cash)` no período é algebricamente
  igual a `income_cash − expense_cash`, ou seja, a `net_cash` retornado —
  não é uma aproximação, é a mesma soma vista de dois jeitos.
  **Limitação:** não havia credencial de `service_role`
  (`GERENTEFINA_SERVICE_ROLE_KEY`) disponível neste ambiente de execução
  para rodar essa conferência contra dados reais do Supabase — recomenda-se
  rodar manualmente uma vez em produção (comparar `net_cash` do card com a
  variação real do saldo somado das contas bank/cash no mês) antes de
  confiar cegamente no card em decisões financeiras.

**Arquivos alterados:**
- `src/services/dashboard.functions.ts`
- `src/routes/_app.dashboard.tsx`

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 73/73 · eslint sem erros reais (fora do ruído pré-existente de CRLF/prettier no resto do repo).

**Status:** commitado (`e7657b6`, direto na branch `main` por outra sessão/ferramenta — trazido para este branch via fast-forward antes da correção abaixo).

---

## 26. Correção final — card "Saldo do Mês" (substitui a Missão 25/"Disponível para Variáveis")

- **Achado de infraestrutura antes de codar:** a Missão 25 acima (commit
  `e7657b6`) havia sido feita diretamente na branch `main`, fora deste
  branch de trabalho (`feat/clean-link-routes`) — provavelmente por outra
  sessão/ferramenta rodando em paralelo. Confirmado via `git fetch` que não
  havia divergência real (meu branch é ancestral direto de `main`, só
  faltava esse 1 commit) — trouxe com `git merge origin/main --ff-only`
  (fast-forward puro, sem conflito) antes de aplicar a correção.
- Card renomeado para **"Saldo do Mês"**, com fórmula substituída por
  completo: Receitas − Custo Fixo − Custo Variável − Fatura de Cartões
  (paga) − Agendamentos pendentes do período — todos em regime de caixa
  (`account.type IN ('bank','cash')`).
- **Removida por completo** a inclusão de parcelas de `installment_purchases`
  (de qualquer vencimento) do cálculo — parcela de cartão só afeta a conta
  corrente quando a fatura é paga (já capturado em "Fatura de Cartões
  paga"); contá-la também duplicaria/anteciparia a despesa.
- Nova conta explícita "Fatura de Cartões (paga)" (perna débito de
  `invoice_payment` em bank/cash), antes só embutida dentro de "Despesas
  (caixa)" sem aparecer separadamente.
- Empréstimos/financiamentos/consórcios continuam de fora (mesmo achado da
  Missão 12 — `loans` não tem vínculo com `transactions`), documentado nos
  `caveats`.
- Categorias com `nature` nula (legado anterior à migration 0012, sem
  backfill) entram em "Custo Variável" por padrão — garante que Custo Fixo
  + Custo Variável + Fatura paga somem exatamente "Despesas (caixa)" (item
  de composição pedido pelo usuário), por construção do código, não por
  coincidência.
- Aritmética extraída para função pura `computeMonthlyBalance`
  (`src/lib/finance/cash-basis.ts`) e testada: propriedade de sanidade
  (agendamentos pendentes nunca tornam o saldo mais otimista, já que
  `amount > 0` é constraint da tabela `recurrences`) e casos de
  regressão/composição.
- Card redesenhado no Dashboard: 5 componentes visíveis lado a lado + saldo
  final em destaque (vermelho quando negativo). KPIs de Receitas/Despesas/
  Resultado voltaram a um grid de 3 colunas (o card de saldo agora é largo,
  abaixo deles, com espaço para a composição).
- **Não foi possível validar contra dados reais do Supabase neste ambiente**
  (sem `service_role` configurada) — recomendo o mesmo teste manual já
  sinalizado na Missão 25: escolher um mês onde as despesas de fato
  superaram as receitas e confirmar que "Saldo do Mês" aparece negativo.

**Arquivos criados:**
- `src/lib/finance/cash-basis.ts`
- `src/lib/finance/cash-basis.test.ts`

**Arquivos alterados:**
- `src/services/dashboard.functions.ts`
- `src/routes/_app.dashboard.tsx`

**Commit:** `2dd0e9c`.

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 77/77 · eslint sem erros reais.

**Status:** enviado ao GitHub (`git push`), já mesclado em `main` via PR.

---

## 27. Ajuste de rótulos no card "Saldo do Mês"

- "Custo Fixo" → "Despesas Fixas"; "Custo Variável" → "Despesas Variáveis".
  Pedido pontual do usuário depois de testar a Missão 26 — só rótulo, sem
  mudança de fórmula/cálculo.

**Arquivos alterados:**
- `src/routes/_app.dashboard.tsx`

**Commit:** `3a4e3f7`.

**Status:** enviado ao GitHub (`git push`).

---

## 28. Cabeçalho do Dashboard com localização, data por extenso e clima

- Nova barra compacta acima do título "Visão Geral": data completa (dia da
  semana, dia, mês, ano em pt-BR), cidade e condições climáticas do dia.
- 100% client-side, sem secret/backend novo: geolocalização via
  `navigator.geolocation` (permissão do navegador), cidade via reverse
  geocoding gratuito e sem chave (BigDataCloud), clima via Open-Meteo
  (gratuito, sem chave, CORS liberado para uso direto do browser).
- Cache de 20 minutos em `sessionStorage` para não repetir a consulta a
  cada navegação/troca de mês. Falha silenciosa em qualquer etapa
  (permissão negada, geolocalização indisponível, API fora do ar) — a data
  continua aparecendo sozinha, nunca bloqueia nem quebra o Dashboard.
- Sem CSP configurada no projeto que precisasse de ajuste para liberar os
  dois domínios externos novos (confirmado antes de codar).

**Arquivos criados:**
- `src/components/dashboard/location-weather-bar.tsx`

**Arquivos alterados:**
- `src/routes/_app.dashboard.tsx`

**Commit:** `b703b40`.

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 77/77 · eslint sem erros reais.

**Status:** não enviado ao GitHub ainda (aguardando confirmação do usuário para push).

---

## 29. Correção de isolamento de dados entre usuários (auditoria completa de segurança)

**Origem:** dois bugs relatados pelo usuário — erro de "ON CONFLICT" ao
salvar orçamento em `/budgets`, e `Falha ao criar "Açougue": parent category
belongs to another user` ao clicar em "Importar categorias padrão" em
`/categories`. A investigação do segundo revelou que o app tem múltiplos
usuários reais cadastrados (confirmado pelo usuário: "é intencional, mais
de uma pessoa usa o app") — o que tornou a causa raiz muito mais séria do
que um bug pontual: **quase todo o backend lia/gravava dados sem filtrar
pelo usuário ativo**, confiando apenas no service-role client do Supabase
(que ignora RLS por completo). RLS existe no banco mas nunca foi a camada
de proteção real — quem protege é o código TypeScript, e ele tinha buracos
sistemáticos.

**Bug 1 — orçamento não salva:** `budgets_user_cat_month_unique` é um
índice único de EXPRESSÃO (`coalesce(reference_month, ...)`), que
`supabase-js .upsert({onConflict})` não consegue direcionar (só aceita
lista simples de colunas). Corrigido com uma RPC nova (`upsert_budget`,
migration 0017) que faz o `INSERT ... ON CONFLICT` direto em SQL.

**Bug 2 — categorias padrão:** `seedDefaultCategories` buscava a categoria
"pai" já existente sem filtrar por `user_id` — podia achar o pai de OUTRO
usuário, e o trigger do banco corretamente rejeitava o `INSERT` da
subcategoria nova. Corrigido com `.eq("user_id", userId)`.

**Auditoria completa — dois tipos de buraco encontrados e fechados em
praticamente todo `src/services/*.functions.ts` e `src/lib/supabase/
*.functions.ts`:**

1. **Leitura sem filtro:** consultas (`SELECT`/`UPDATE`/`DELETE`) que não
   restringiam por `.eq("user_id", userId)`, permitindo ver, editar ou
   apagar dado de outro usuário. Afetava praticamente toda tela: contas,
   categorias, lançamentos, orçamentos, faturas, parcelamentos, empréstimos,
   agendamentos, chat IA, dashboard, previsão. Alguns updates (`updateAccount`,
   `archiveAccount`, `updateCategory`, `archiveCategory`) não tinham
   NENHUMA checagem de dono — qualquer usuário autenticado podia renomear ou
   arquivar conta/categoria de outra pessoa só sabendo o UUID.
2. **Escrita com FK não validada (mais grave):** vários formulários
   gravam um lançamento/orçamento/recorrência do PRÓPRIO usuário mas com
   `account_id`/`category_id`/`recurrence_id` escolhido pelo cliente sem
   checar se aquele id pertence a ele. Como a view `account_balances` soma
   por `account_id` sem checar dono da transação, isso permitia CORROMPER
   o saldo da conta de outra pessoa lançando uma "transação sua" apontando
   pra conta alheia. Corrigido em `createTransactionEntry`,
   `updateTransactionEntry`, `convertTransactionEntry`, `createScheduledItem`,
   `updateScheduledItem`, `upsertBudget`, `commitImport`/`commitSmartImport`
   (categoria e recorrência vindas do importador) e `learnClassificationRules`.
3. **`restoreBackup` (achado à parte, o mais sério):** o restore de backup
   fazia `upsert({onConflict:"id"})` com ids vindos direto do arquivo JSON
   enviado pelo usuário — um arquivo adulterado com o UUID de uma conta/
   categoria/transação de OUTRO usuário sobrescreveria silenciosamente
   aquela linha, inclusive trocando o dono (`user_id`) dela para o
   atacante. Corrigido com uma checagem prévia que aborta a restauração
   inteira se qualquer id do arquivo já pertencer a outro usuário.
4. **Chat IA:** `sendChatMessage` gravava mensagem numa `thread_id`
   informada pelo cliente sem checar se a conversa era dele — permitia
   injetar mensagem em conversa alheia. Corrigido movendo a checagem de
   dono para dentro do helper compartilhado `persistChatMessage`.

**Arquivos criados:**
- `docs/migrations/0017_upsert_budget_rpc.sql`

**Arquivos alterados:**
- `src/services/budgets.functions.ts`, `categories.functions.ts`,
  `accounts.functions.ts`, `lookups.functions.ts`, `chat.functions.ts`,
  `invoices.functions.ts`, `invoice-projection.functions.ts`,
  `installments.functions.ts`, `forecast.functions.ts`,
  `dashboard.functions.ts`, `scheduled-items.functions.ts`,
  `transactions.functions.ts`, `recurrence-materializer.functions.ts`,
  `backup.functions.ts`
- `src/lib/supabase/import.functions.ts`, `rules.functions.ts`

**Verificação:** `npx tsc --noEmit` limpo · `npm test` 77/77 · `eslint --fix`
sem erros novos (os poucos `no-explicit-any` remanescentes são débito de
lint pré-existente, não introduzidos por esta missão).

**Pendências conhecidas:** `src/services/recurrences.functions.ts` não foi
tocado — confirmado que não é importado em lugar nenhum (código morto,
substituído pela Missão 7), candidato a remoção futura. A migration 0017
(RPC nova) precisa ser aplicada manualmente no Supabase antes do deploy,
como as anteriores.

**Status:** aguardando confirmação do usuário para commit/push.
