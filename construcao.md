# Construção do Gerente FINA — Histórico Completo

Documento consolidado de tudo que foi solicitado pelo usuário e executado pela
Lovable no projeto **Gerente FINA (Beta)**, do zero até o estado atual.
Fonte: histórico das conversas + arquivos versionados em `docs/migrations/`,
`src/routes/`, `src/services/` e `atualizacoes.md`.

Idioma: pt-BR. Sem emojis. Formato: cada Missão traz a **Solicitação** do
usuário, a **Execução** da Lovable e os **Arquivos** afetados.

---

## 1. Constituição Inegociável do Projeto

- **Escopo:** Sistema de Soberania Contábil-Gerencial monousuário.
- **Idioma:** Toda a UI, toasts, modais e mensagens em pt-BR.
- **Tema:** Modo Escuro Premium (glassmorphism / estilo ZimaOS).
- **Stack:** TanStack Start (Full-stack Router + Server Functions) +
  Supabase (PostgreSQL com RLS) + Tailwind CSS + shadcn/ui.
- **Deploy:** Lovable (Cloudflare Workers) — a proposta original em
  Next.js/Vercel foi adaptada para manter compatibilidade com a plataforma,
  preservando a lógica soberana em `src/lib/finance`.
- **Banco:** Supabase externo da organização `mwtyioujdmbzlpldmriw`.
- **Cláusulas pétreas:**
  - **Expurgo Contábil:** `transfer` e `invoice_payment` NUNCA entram em
    Receitas/Despesas de dashboards e DRE.
  - **Saldos dinâmicos:** proibido persistir saldos; sempre agregar via SQL
    (`account_balances`).
  - **Meio do mês:** se `due_day > closing_day`, a fatura vence no MESMO
    mês do fechamento.
  - **RLS obrigatório** em toda tabela `public.*`.
  - **Proibido** `confirm()`, `alert()`, `prompt()` nativos — apenas
    AlertDialog/Dialog do shadcn.
  - **Nomes reais das colunas:** `transactions.kind`,
    `transactions.occurred_on`, view `account_balances`.
  - **Aritmética monetária:** sempre via `toCents`/`fromCents`
    (`src/lib/finance/money.ts`) usando BigInt.

---

## 2. Infraestrutura Base

- `src/lib/supabase/` — clientes SSR (`client.ts`) e admin
  (`client.server.ts`), configuração e resolução de usuário ativo.
- `src/lib/finance/` — lógica pura em TypeScript (money, neutrals,
  invoice-due, recurrence-schedule, installment-split, hp12c, cash-basis,
  csv-mapping, hash, expense-breakdown, pdf-statement).
- `src/services/*.functions.ts` — Server Functions (RPC tipada) para
  contas, categorias, transações, dashboard, chat, backup, forecast,
  installments, invoices, budgets, lookups, orçamentos e conexões.
- `docs/migrations/` — SQL versionado.
- `src/routes/` — malha canônica com prefixo `_app/` para rotas protegidas.

---

## 3. Migrations SQL

| Nº    | Arquivo                                                              | Propósito                                                                  |
| ----- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0001  | `0001_init_enums_and_accounts.draft.sql`                             | Enums base + tabela unificada `accounts` com RLS por `auth.uid()`.         |
| 0002  | `0002_categories_and_transactions.sql`                               | `categories` (hierarquia via `parent_id`) e `transactions` (numeric 14,2, transferências por `transfer_id` de duas pernas). |
| 0002b | `0002b_transactions_dedup_trigger.sql`                               | Trigger condicional de deduplicação por hash SHA-256.                      |
| 0003  | `0003_recurrences_invoices_installments_loans.sql`                   | Recorrências, faturas, parcelamentos e empréstimos com colunas de amarração (`recurrence_id`, `invoice_id`, `installment_purchase_id`). |
| 0004  | `0004_views_balance_and_dre.sql`                                     | Views `account_balances` e DRE mensal com expurgo rigoroso de fluxos neutros. |
| 0005  | `0005_credit_card_invoice_trigger.sql`                               | Trigger que abre/fecha faturas de cartão automaticamente.                  |
| 0006  | `0006_budgets.sql`                                                   | Tabela de orçamentos (teto por categoria/mês) e metas.                     |
| 0007  | `0007_audit_log.sql`                                                 | Trilha de auditoria persistente para restore e ações sensíveis.            |
| 0008  | `0008_invoice_payment_dual_leg.sql`                                  | Pagamento de fatura em duas pernas (débito na conta + crédito no cartão) com trigger de reconciliação. |
| 0011  | `0011_Pagament_fatura_ATÔMICO_via_RPC_+_idempotência_real.sql`       | RPC atômica de pagamento de fatura com idempotência.                       |
| 0012  | `0012_categories_nature.sql`                                         | Coluna `nature` (`FIXA` / `VARIÁVEL`) para classificação gerencial.        |
| 0013  | `0013_convert_transaction_entry.sql`                                 | RPC para converter uma entrada de transação (tipo/kind).                   |
| 0014  | `0014_chat_threads_and_messages.sql`                                 | Threads e mensagens do Chat com IA.                                        |
| 0015  | `0015_delete_installment_purchase.sql`                               | RPC segura para exclusão de parcelamento completo.                         |
| 0016  | `0016_recurrence_once.sql`                                           | Materialização única de recorrência (idempotência).                        |
| 0017  | `0017_upsert_budget_rpc.sql`                                         | RPC de upsert de orçamentos.                                               |
| 0018  | `0018_bank_connections.sql`                                          | Tabela de conexões bancárias (Open Finance / Pluggy).                      |
| 0019  | `0019_revoke_authenticated_from_security_definer_rpcs.sql`           | Revogação de grants amplos em RPCs `SECURITY DEFINER`.                     |
| 0020  | `0020_bank_connections_manual_status.sql`                            | Status manual/simulado das conexões bancárias.                             |
| 0021  | `0021_revoke_public_anon_from_security_definer_rpcs.sql`             | Revogação adicional para `public`/`anon`.                                  |

---

## 4. Missões Executadas (cronológico)

### Missão 1 — Kick-off e fundação
**Solicitação:** Iniciar do zero adotando PRD e AGENTS.md como constituição;
Supabase externo; deploy Cloudflare/Vercel; expurgo de neutros; RLS.
**Execução:** Identificado conflito PRD (Next.js) vs plataforma
(TanStack Start); adaptação preservando a lógica soberana. Criada estrutura
`src/lib/supabase/`, `src/lib/finance/`, `docs/migrations/`, migration
`0001` (enums + accounts com RLS).
**Arquivos:** `src/lib/supabase/*`, `src/lib/finance/{neutrals,invoice-due,hash}.ts`,
`docs/migrations/0001_init_enums_and_accounts.draft.sql`, `package.json`.

### Missão 2 — Categorias e transações contábeis
**Solicitação:** Proibido `counterparty_account_id`; usar duas linhas com
`transfer_id`. `numeric(14,2)`. Subcategorias via `parent_id`. Colunas de
amarração (`recurrence_id`, `invoice_id`).
**Execução:** Materializada `0002` seguindo as restrições, e `0002b` com
trigger condicional de dedup.
**Arquivos:** `docs/migrations/0002_*.sql`, `docs/migrations/0002b_*.sql`.

### Missão 3 — Recorrências, faturas, parcelamentos e empréstimos
**Solicitação:** Ajuste de `src/lib/finance/` para tratar numéricos como
string; migration 0003.
**Execução:** Refino de aritmética decimal em `finance/*` e criação da
`0003`.
**Arquivos:** `docs/migrations/0003_*.sql`, refactor em `src/lib/finance/*`.

### Missão 4 — Views de saldo e DRE
**Solicitação:** Views de saldo por conta + DRE mensal com expurgo.
**Execução:** `0004_views_balance_and_dre.sql` com `account_balances` e DRE
expurgando `transfer` e `invoice_payment`.
**Arquivos:** `docs/migrations/0004_*.sql`.

### Missão 5 — Server Functions, Dashboard e Lançamentos
**Solicitação:** Server Functions em `src/services/`; dashboards; listagem
de transações.
**Execução:** Admin client lazy; `dashboard.functions.ts`,
`transactions.functions.ts`; trigger `0005` para faturas; UI de Dashboard,
`/transactions` (com fila antiduplicidade) e `/transactions/new`
(formulário unificado por pílulas).
**Arquivos:** `src/services/*`, `src/routes/_app.dashboard.tsx`,
`src/routes/_app.transactions.*`, `docs/migrations/0005_*.sql`.

### Missão 6 — Consolidação operacional
**Solicitação:** Auditoria TypeScript total; Mesclar Duplicados; Undo no
descarte da fila; rota de edição; gestão patrimonial; hub de Configurações;
Parcelamentos e Orçamentos.
**Execução:** `mergeDuplicateTransactions`; edição de transações;
`/accounts`, `/credit-cards`, `/categories`; `0006_budgets.sql`;
`/settings`, `/installments`, `/budgets`. Correções de VIEW, tipos
numéricos e regeneração do routeTree.
**Arquivos:** `src/services/*`, `src/routes/_app.*`,
`docs/migrations/0006_*.sql`.

### Missão 7 — Blindagem matemática e consolidação
**Solicitação:** Conectar `/budgets` e Dashboard ao banco real; blindagem
com `toCents`; consolidação de rotas; build CI limpo.
**Execução:** Centralização em `src/lib/finance/money.ts` com BigInt;
`resolveActiveUserId`; correção de sintaxe em `chat.tsx` e `import.tsx`;
build de produção verde.
**Arquivos:** `src/lib/finance/money.ts`, `src/services/*`,
`src/routes/_app.chat.tsx`, `src/routes/_app.import.tsx`.

### Missão 8 — Chat IA real, regras e importador CSV
**Solicitação:** Tirar `/chat` e `/import` do stub; Chat IA com ferramenta
`record_transaction`; automação para descrições "MariaReniele" na categoria
mercearia; importador CSV com dedup real.
**Execução:** Integração via Lovable AI Gateway; regras aplicadas
antes da IA; hash SHA-256 para dedup; mensagens de erro em pt-BR.
**Arquivos:** `src/services/chat.functions.ts`,
`src/lib/supabase/import.functions.ts`, `src/lib/supabase/rules.functions.ts`.

### Missão 9 — Conta ativa unificada e preview responsivo
**Solicitação:** Unificar seleção de conta ativa; melhorar preview
responsivo do importador.
**Execução:** `src/lib/finance/active-account.server.ts` (preferindo
bank/cash); refactor de Chat e Importador; `/import` com cards em mobile e
tabela em desktop; badges de duplicata em vez de line-through.
**Arquivos:** `src/lib/finance/active-account.server.ts`,
`src/routes/_app.chat.tsx`, `src/routes/_app.import.tsx`.

### Missão 10 — Forecast real, Backup/Restore e Auditoria
**Solicitação:** Motor Preditivo real em `/forecast`; export/import de
backup validado por Zod; trilha de auditoria.
**Execução:** `getForecast()` com saldo atual + média móvel 90 dias +
projeção deduzindo parcelas; `exportBackup` e `restoreBackup` com Zod
estrito e reescrita de `user_id`; UI atualizada.
**Arquivos:** `src/services/forecast.functions.ts`,
`src/services/backup.functions.ts`, `src/routes/_app.forecast.tsx`,
`src/routes/_app.settings.tsx`.

### Missão 11 — Virada de Produção (auth real + refactor de rotas)
**Solicitação:** Autenticação real; proteção global de rotas; refinamento
do Forecast; blindagem do Restore com auditoria persistente.
**Execução:** `0007_audit_log.sql`; cliente Supabase com cookies SSR;
`resolveActiveUserId` valida sessão real; novas telas de auth
(Login/Signup/Recovery); modal `FirstAccountModal`; refactor massivo para
prefixo `_app/`; controles de horizonte no Forecast; progresso no Restore.
Build e typecheck zerados.
**Arquivos:** `docs/migrations/0007_*.sql`, `src/lib/supabase/client.ts`,
`src/routes/index.tsx`, `src/routes/forgot-password.tsx`,
`src/routes/reset-password.tsx`, `src/routes/_app.tsx`, refactor de todos
os `src/routes/_app.*`, `src/components/onboarding/first-account-modal.tsx`.

### Missão 12 — Correção de gradiente truncado
**Solicitação:** Corrigir build error em `app-shell.tsx` (string
truncada).
**Execução:** Fix no gradiente + revalidação do build.
**Arquivos:** `src/components/app-shell.tsx`.

### Missão 13 — Motor de faturas dual-leg
**Solicitação:** Pagamento de fatura em duas pernas (débito na conta +
crédito no cartão); categoria fixa "fatura de cartões"; saldo real por
agregação SQL.
**Execução:** `0008_invoice_payment_dual_leg.sql` com trigger de
reconciliação; refactor de `transactions.functions.ts`; RPC atômica
consolidada em `0011`.
**Arquivos:** `docs/migrations/0008_*.sql`, `docs/migrations/0011_*.sql`,
`src/services/transactions.functions.ts`.

### Missão 14 — Regras aprendidas + Auto-materialização
**Solicitação:** Plugar regras de classificação no importador; expor
gestão em `/settings`; materializar recorrências ao abrir o Dashboard.
**Execução:** Precedência `tempero > regra aprendida > IA` no importador;
`learnClassificationRules` best-effort; `RulesManagerSection` novo;
`useEffect` guardado por `useRef` no Dashboard.
**Arquivos:** `src/lib/supabase/import.functions.ts`,
`src/components/settings/rules-manager-section.tsx`,
`src/routes/_app.settings.tsx`, `src/routes/_app.dashboard.tsx`.

### Missão 15 — Verificação de build e rotas
**Solicitação:** Confirmar saúde do build e registro das rotas
(incluindo `/agendamentos`).
**Execução:** Confirmação do routeTree; correção de tipagem de `search`
params em `/dashboard` e `/transactions`.
**Arquivos:** `src/routes/_app.dashboard.tsx`,
`src/routes/_app.transactions.index.tsx`.

### Missão 16 — Preservação do mês na navegação
**Solicitação:** Usar `search={(prev) => prev}` para preservar o mês
selecionado ao navegar pelo menu.
**Execução:** Helper `preserveMonth` no app-shell; correção dos call-sites;
build e typecheck zerados.
**Arquivos:** `src/components/app-shell.tsx`.

### Missão 17 — Modal de detalhamento de Despesas
**Solicitação:** Ao clicar no card "Despesas" do Dashboard, abrir modal
com 3 seções (faturas, fixas, variáveis) reaproveitando
`getCashBasisSummary`; teste de sanidade `total === expense_cash`.
**Execução:** Agregação centralizada em
`src/lib/finance/expense-breakdown.ts` com testes; server function
`getExpenseBreakdown`; componente
`src/components/dashboard/expense-breakdown-dialog.tsx`; card do Dashboard
vinculado ao modal.
**Arquivos:** `src/lib/finance/expense-breakdown.ts`,
`src/services/dashboard.functions.ts`,
`src/components/dashboard/expense-breakdown-dialog.tsx`,
`src/routes/_app.dashboard.tsx`.

### Missão 18 — Drill-down + Skeletons + Acessibilidade
**Solicitação:** Drill-down para `/transactions` a partir dos itens do
modal; skeletons por seção; validação de acessibilidade.
**Execução:** Filtros de categoria/conta em
`buildExpenseDrilldownSearch`; skeletons por bloco; Radix Dialog cuida de
Esc/foco. Build e Vitest verdes.
**Arquivos:** `src/lib/finance/expense-breakdown.ts`,
`src/components/dashboard/expense-breakdown-dialog.tsx`.

### Missão 19 — Testes de drill-down e estados vazios
**Solicitação:** Testes para links de drill-down; estado vazio por seção
no modal.
**Execução:** `src/lib/finance/expense-drilldown.test.ts`; mensagens com
ícones de vazio no `expense-breakdown-dialog.tsx`. 103 testes verdes.
**Arquivos:** `src/lib/finance/expense-drilldown.test.ts`,
`src/components/dashboard/expense-breakdown-dialog.tsx`.

### Missão 20 — Reorganização "Contas & Cartões" no Dashboard
**Solicitação:** Separar bancos de cartões em 3 blocos: contas com barra
de cheque especial, cartões com barra de limite e fatura aberta, faturas
agrupadas (futuras/pagas/vencidas) com destaque pulsante em vencidas.
**Execução:** `AccountBalanceDTO` estendido com `overdraft_limit_cents`;
`getCreditCardsPanel` agregando 12 meses; widgets
`CreditCardsLimitsWidget` e `InvoicesGroupedWidget`.
**Arquivos:** `src/services/dashboard.functions.ts`,
`src/components/dashboard/credit-cards-limits-widget.tsx`,
`src/components/dashboard/invoices-grouped-widget.tsx`,
`src/routes/_app.dashboard.tsx`.

### Missão 21 — Integrações de Agente (MCP) — pendente
**Solicitação:** Adicionar MCP ao app.
**Execução:** Perguntada a preferência entre OAuth por usuário
(recomendado) e público sem login. **Aguardando decisão do usuário.**

### Missão 22 — Seleção e exclusão em massa em `/transactions`
**Solicitação:** Checkbox por linha (sempre visível) + header select-all;
barra de ação com "Excluir selecionados"; AlertDialog; reutilizar
proteção da Missão 12 (parcelamentos); falhas parciais graciosas; reset ao
trocar de página.
**Execução:** Scaffolding de UI já presente foi validado; refactor de
`bulkDiscardTransactions` para processar linha a linha e reportar sucessos
+ falhas parciais no toast. Typecheck limpo.
**Arquivos:** `src/services/transactions.functions.ts`,
`src/routes/_app.transactions.index.tsx`,
`src/components/transactions/list-ui.tsx`.

---

## 5. Estado Atual da Malha de Rotas

Todas com prefixo `_app/` exceto auth pública.

| Rota                      | Status         | Observação                                                                   |
| ------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `/` (Boas-vindas)         | Implementada   | Split-screen; e-mail/senha; toggle olho; Google/Apple pendentes.             |
| `/forgot-password`        | Implementada   | Recuperação por e-mail.                                                      |
| `/reset-password`         | Implementada   | Fluxo pós-e-mail.                                                            |
| `/dashboard`              | Implementada   | KPIs, modal de despesas, 3 blocos de contas/cartões, materialização auto.    |
| `/chat`                   | Implementada   | Lovable AI Gateway + `record_transaction`; voz via AI Gateway (GF-004 v2).   |
| `/transactions`           | Implementada   | Filtros na URL, seleção múltipla, review queue, importar/exportar CSV.       |
| `/transactions/new`       | Implementada   | Pílulas + projeção de fatura + accordions.                                   |
| `/transactions/edit/:id`  | Implementada   | Retificação atributiva pura.                                                 |
| `/import`                 | Implementada   | Drag & drop CSV/OFX com dedup; **processamento assíncrono ainda síncrono**.  |
| `/open-finance`           | Parcial        | Simulação manual (mig. 0020); **integração Pluggy real pendente**.           |
| `/accounts`               | Implementada   | CRUD com saldos agregados em tempo real.                                     |
| `/credit-cards`           | Implementada   | Fechamento/vencimento; motor do meio do mês.                                 |
| `/categories`             | Implementada   | Árvore pai/filho + `nature`.                                                 |
| `/installments`           | Implementada   | 4 listas coloridas + progresso + consolidado mensal.                         |
| `/budgets`                | Implementada   | Teto + Meta com barras.                                                      |
| `/forecast`               | Implementada   | Média 90 dias + parcelas futuras; controles de horizonte.                    |
| `/settings`               | Implementada   | Backup JSON/CSV, restore, regras aprendidas, logout, exclusão.               |
| `/agendamentos`           | Implementada   | Painel de scheduled items.                                                   |
| `/calculadora`            | Implementada   | HP-12C.                                                                      |

---

## 6. Pendências e Carências (Roadmap)

### Alta prioridade
1. **MCP / OAuth** — decisão pendente da Missão 21 (OAuth por usuário
   recomendado; público desaconselhado). Sem isso, não há integração de
   agente externa segura.
2. ~~**Entrada de voz no `/chat`**~~ — **implementada (GF-004 v2)**: captura
   via MediaRecorder + transcrição pelo Lovable AI Gateway
   (`openai/gpt-4o-mini-transcribe`), com concatenação ao input existente
   (nunca limpa o que já estava digitado), como exigido aqui. v1 (binding
   Cloudflare Workers AI) foi abandonada — sem garantia de que o Worker
   gerenciado pela Lovable recebe bindings especiais provisionados a
   partir do repo.
3. **Import assíncrono** — o workspace-knowledge exige responder HTTP 202
   e delegar carga para Edge Functions com status `syncing`. Hoje o
   processamento é síncrono e pode dar timeout em extratos grandes.
4. **Open Finance real (Pluggy)** — hoje apenas simulação manual
   (mig. 0020). Fluxo OAuth completo + background workers ainda faltam.

### Média prioridade
5. **PDF Import** — script de teste em `docs/PDF_IMPORT_TEST_SCRIPT.md`;
   pipeline `pdf-statement` existe mas validação end-to-end manual
   pendente.
6. **Regras de automação** — motor genérico já existe; expandir presets
   além dos temperos iniciais (padrões PIX, tarifas bancárias, salários
   recorrentes com detecção automática).
7. **Testes E2E** — cobertura atual é unitária (Vitest, 100+ testes).
   Playwright ainda não configurado para fluxos críticos
   (login → lançamento → conciliação → backup).
8. **Onboarding pós-signup** — `FirstAccountModal` existe; falta
   sequência guiada (categorias default, tour visual das rotas).
9. **Google/Apple OAuth** na tela `/` — atualmente apenas botões visuais
   sem provider habilitado.

### Baixa prioridade / higiene
10. **Restore de backups grandes** — validar streaming/paginação para
    arquivos > 5 MB; hoje carrega tudo em memória.
11. **Security scan** — rodar `security--run_security_scan` e revisar
    security-memory; garantir grants apertados em RPCs SECURITY DEFINER
    (migs. 0019 e 0021 já reduziram superfície).
12. **SEO / `head()` por rota** — a diretriz TanStack exige título,
    description, og:title e og:description únicos em cada rota de
    conteúdo. Auditar as 15 rotas para conformidade.
13. **Mobile-first rígido** — auditar tabelas de `/transactions`,
    `/installments` e `/budgets` para colapso elegante em < 640px
    conforme workspace-knowledge.
14. **Consolidação `atualizacoes.md` vs `construcao.md`** — manter apenas
    um como fonte da verdade (recomendação: este arquivo passa a ser o
    índice e `atualizacoes.md` vira changelog cronológico bruto).
15. **Publicação** — configurar release para o domínio
    `gerentefina.fguerra.ia.br` (Cloudflare + custom domain já mapeado).

---

## 7. Guardrails Ativos (recap operacional)

- Colunas reais: `transactions.kind`, `transactions.occurred_on`, view
  `account_balances`.
- Proibido: `confirm/alert/prompt` nativos, saldos calculados persistidos,
  `counterparty_account_id`, `.max(8)` no campo `icon` (Base64 longa),
  incremento cego de `+1 mês` em vencimento de fatura.
- Obrigatório: Zod em todas as bordas, aritmética via `money.ts`,
  Skeletons e estados vazios em toda listagem, RLS por `auth.uid()`.
- Server functions em Cloudflare Workers: sem `child_process`, `sharp`,
  `canvas`, `puppeteer`, `fs.watch`, `os.cpus()`.

---

_Última atualização: gerada automaticamente pela Lovable a partir do
histórico da conversa e do estado do repositório._
