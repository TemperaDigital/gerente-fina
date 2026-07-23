# Plano: Documento `construcao.md` — Histórico e Roadmap do Gerente FINA

## Objetivo
Criar um único arquivo `construcao.md` na raiz do projeto consolidando todo o histórico da construção do Gerente FINA pela Lovable, organizado por Missões numeradas, com solicitações do usuário, execuções realizadas e pendências.

## Estrutura do documento

### 1. Cabeçalho e Constituição
- Nome do projeto, stack (TanStack Start + Supabase + Tailwind/shadcn), princípios inegociáveis (Soberania Contábil, Expurgo de Neutros, RLS, Modo Escuro Premium, pt-BR).

### 2. Infraestrutura Base (Fundação)
- Supabase externo (org `mwtyioujdmbzlpldmriw`), deploy Cloudflare/Vercel, estrutura `src/lib/finance`, `src/lib/supabase`, `src/services`, `docs/migrations`.

### 3. Migrations SQL executadas (numeradas 0001 → 0021)
Lista tabelada com: número, arquivo, propósito, status.
- 0001 Enums + accounts
- 0002 categories + transactions (numeric 14,2; transfer_id de duas pernas)
- 0002b Trigger dedup condicional
- 0003 recurrences, invoices, installments, loans
- 0004 Views balance + DRE (com expurgo)
- 0005 Trigger de fatura de cartão
- 0006 budgets
- 0007 audit_log
- 0008 invoice_payment dual leg
- 0011 Pagamento de fatura atômico via RPC
- 0012 categories.nature (FIXA/VARIÁVEL)
- 0013 convert_transaction_entry
- 0014 chat_threads + messages
- 0015 delete_installment_purchase
- 0016 recurrence_once
- 0017 upsert_budget rpc
- 0018 bank_connections
- 0019/0021 revoke de security definer
- 0020 bank_connections_manual_status

### 4. Missões executadas (numeradas cronologicamente)
Para cada missão: **Solicitação do usuário** → **Sugestão/execução da Lovable** → **Arquivos afetados**.

- **Missão 1** — Setup inicial e primeira migration
- **Missão 2** — Categorias e transações com regras contábeis rígidas
- **Missão 3** — Recorrências, faturas, parcelamentos, empréstimos
- **Missão 4** — Views de saldo e DRE com expurgo
- **Missão 5** — Server Functions + Dashboard + /transactions + /transactions/new
- **Missão 6** — Mesclar duplicados, undo, edição, gestão patrimonial, hub de settings, parcelamentos, orçamentos
- **Missão 7** — Blindagem matemática (toCents/BigInt), consolidação de rotas, build CI
- **Missão 8** — Chat IA real (Lovable AI Gateway), automação MariaReniele, importador CSV com dedup SHA-256
- **Missão 9** — Unificação da conta ativa + preview responsivo do importador
- **Missão 10** — Motor Preditivo em /forecast + Backup/Restore com Zod + Trilha de Auditoria
- **Missão 11** — Virada de Produção: autenticação real via cookies SSR, proteção global via `_app.tsx`, onboarding modal, refactoring de rotas para prefixo `_app/`
- **Missão 12** — Correção de exclusão de parcelas (evitar cards fantasma em /installments)
- **Missão 13** — Motor de faturas dual-leg (0008): duas pernas de pagamento, categoria fixa "fatura de cartões", saldo real por agregação
- **Missão 14** — Preservação do mês selecionado na navegação (`preserveMonth` no app-shell)
- **Missão 15** — Modal de detalhamento de Despesas no Dashboard (3 seções: faturas, fixas, variáveis)
- **Missão 16** — Drill-down do modal para /transactions + skeletons + acessibilidade
- **Missão 17** — Testes de drill-down + estados vazios por seção
- **Missão 18** — Reorganização Dashboard "Contas & Cartões" em 3 blocos (bancos, cartões com limite, faturas agrupadas)
- **Missão 19** — Discussão sobre MCP / OAuth (pendente decisão do usuário)
- **Missão 20** — Seleção e exclusão em massa em /transactions com falha parcial graciosa

### 5. Estado atual do sistema
Malha de 15 rotas canônicas (do AGENTS.md), status de cada uma: implementada / stub / pendente.

### 6. Pendências e melhorias identificadas
- **MCP / OAuth**: decisão pendente entre OAuth por usuário vs público (Missão 19 sem resposta)
- **/open-finance**: fluxo Pluggy real (hoje simulado/manual — migration 0020)
- **/chat**: entrada de voz via MediaRecorder + Whisper (workspace-knowledge exige, status a confirmar)
- **Import**: processamento assíncrono via Edge Functions com status `syncing` + HTTP 202 (workspace-knowledge)
- **PDF Import**: script de teste existe (`docs/PDF_IMPORT_TEST_SCRIPT.md`) — validação manual pendente
- **Regras de automação**: expandir além do case MariaReniele/mercearia
- **Testes E2E**: cobertura atual só unitária (Vitest); Playwright ainda não configurado
- **Onboarding**: FirstAccountModal existe, mas fluxo pós-signup completo (categorias default, tour) pode ser reforçado
- **Backup restore**: progresso visual existe; validar restore em backups grandes
- **Segurança**: revisar security-memory + rodar security scan
- **SEO/head metadata**: verificar `head()` único por rota (título, description, og)
- **Mobile**: workspace-knowledge exige Mobile-First rígido — auditar tabelas complexas ocultas em telas pequenas

### 7. Convenções e cláusulas pétreas ativas
Recap dos guardrails: colunas reais (`kind`, `occurred_on`, view `account_balances`), proibições (alerts nativos, saldos calculados persistidos, `counterparty_account_id`), padrão de tratamento do meio do mês.

## Notas
- Documento em pt-BR, formato Markdown, sem emojis desnecessários.
- Sem código embutido além de nomes de arquivos e identificadores.
- Baseado no histórico da conversa e nos arquivos visíveis em `docs/migrations/` e `src/routes/`.
- Vou reler apenas rapidamente `AGENTS.md`, `atualizacoes.md` e listar `docs/migrations/` na fase de build para não inventar detalhes não confirmados.

## Arquivo a criar
- `construcao.md` (raiz do projeto)
