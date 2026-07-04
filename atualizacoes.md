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

**Status:** não enviado ao GitHub ainda (aguardando confirmação do usuário para push).
