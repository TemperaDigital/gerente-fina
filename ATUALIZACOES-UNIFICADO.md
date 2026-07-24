# Atualizações — Gerente Fina (Fonte Única)

> Este documento substitui a necessidade de cruzar `atualizacoes.md` (Claude
> Code) e `Gerente_Fina_-_construcao.md` (Lovable) para saber "o que já foi
> feito" e "o que falta". A partir de **23/07/2026**, toda nova missão —
> executada por Claude Code, Lovable, ou qualquer outra ferramenta — é
> registrada **aqui**, com numeração única.

## Por que uma renumeração, e não um merge retroativo

O projeto acumulou três numerações de "Missão" diferentes e não
correspondentes entre si:

1. **Lovable, interna** (`Gerente_Fina_-_construcao.md`) — 1 a 22,
   cronológica desde o kick-off.
2. **Delegação pontual via chat** (registrada num documento de contexto à
   parte) — números como 5, 6, 7... até 29/30, atribuídos sessão a sessão,
   sem relação direta com a numeração da Lovable.
3. **Claude Code, interna** (`atualizacoes.md`) — outra sequência própria,
   já além de #34 na última verificação.

Tentar reconciliar essas três numa única linha do tempo, retroativamente,
tem alto risco de atribuir a missão errada ao número errado — pior do que
não ter numeração nenhuma. Em vez disso: o histórico é resumido abaixo
**sem renumeração** (cada item cita sua fonte original entre parênteses,
para rastreabilidade), e a partir de agora usamos um prefixo novo — **`GF-`**
— que não colide com nenhuma numeração anterior.

---

## Estado consolidado até 23/07/2026 (resumo, não renumerado)

### Fundação e motor contábil
- Estrutura base: `src/lib/supabase/`, `src/lib/finance/` (aritmética
  monetária via `toCents`/`fromCents` com BigInt), `src/services/*.functions.ts`,
  `docs/migrations/`. (Lovable #1–#4)
- Categorias hierárquicas, transações com `numeric(14,2)`, transferências
  por `transfer_id` de duas pernas, dedup por hash SHA-256. (Lovable #2)
- Views de saldo agregado (`account_balances`) e DRE mensal com expurgo
  rigoroso de `transfer`/`invoice_payment`. (Lovable #4)
- Pagamento de fatura em duas pernas (débito na conta + crédito no
  cartão), consolidado em RPC atômica com idempotência real. (Lovable
  #13; migrations 0008 e 0011)

### Autenticação e produção
- Autenticação real, proteção global de rotas, trilha de auditoria
  persistente (`audit_log`), telas de auth completas. (Lovable #11)

### Funcionalidades de uso diário
- Dashboard com KPIs em regime de caixa, modal de detalhamento de
  Despesas com drill-down, 3 blocos de Contas & Cartões. (Lovable
  #17–#20; contexto-chat #16–#19)
- Chat IA com tool calling (criar lançamento, consultar por
  período/categoria, relatórios), validado em uso real. (contexto-chat #9)
- Importador universal OFX/CSV/PDF com dedup e regras aprendidas.
  (Lovable #8, #14; contexto-chat #6)
- Export CSV / impressão-PDF de Lançamentos. (contexto-chat #10)
- Contas a Vencer (`/agendamentos`), Forecast com média móvel de 90 dias.
  (Lovable #10, #15; contexto-chat #7)
- Seleção múltipla + exclusão em lote em Lançamentos, com tratamento de
  falha parcial. (Lovable #22 / contexto-chat "Missão 13" — **mesmo
  trabalho, dois números diferentes** — exemplo exato do problema que
  motivou este documento)
- Calculadora financeira HP-12C + cabeçalho replicado (relógio/clima) —
  em andamento fora de numeração formal.

### Segurança (auditoria conjunta Claude + Claude Code, 22–23/07/2026)
- **Corrigido — vulnerabilidade crítica ativa:** 5 RPCs `security definer`
  (`pay_credit_card_invoice`, `convert_transaction_entry`,
  `delete_installment_purchase`, `upsert_budget`,
  `refresh_invoice_outstanding`) permitiam execução por `PUBLIC` e `anon`
  — qualquer visitante sem login podia corromper dados financeiros de
  qualquer usuário. Corrigido via migration `0021`, verificado em
  produção. (migrations 0019 haviam corrigido só parcialmente, 0021
  fechou o resto)
- **Corrigido — pipeline de migrations:** só 1 migration estava
  rastreada pelo Supabase (`supabase_migrations.schema_migrations`); as
  outras 19 existiam como SQL aplicado manualmente, sem tracking.
  Consolidado por completo: histórico de tracking reconstruído e 20
  arquivos físicos recriados com timestamp correto em
  `supabase/migrations/`.
- **Corrigido (auditoria anterior, Lovable #22 / contexto-chat 29/30):**
  queries sem filtro `user_id` na maioria dos services; `restoreBackup`
  sem validar `transfer_id`/`paid_invoice_id`; `/open-finance` migrado
  para server functions com tabela `bank_connections` versionada.

### Achados ainda sem correção
- Branch `feature/embed-tarefas-integration` no repositório do Gerente
  Fina: 94 de 96 commits são histórico contaminado de um projeto de
  terceiros (draw.io/jgraph) — não relacionado. Os 2 commits reais têm
  uma vulnerabilidade de XSS/postMessage sem validação de origem.
  **Pausado por decisão do usuário** — o destino correto é um
  repositório próprio (`TemperaDigital/fluxograma`), não o Gerente Fina;
  retomar quando houver foco disponível.
- `PRD-GerenteFINA-IA.md` pode estar desatualizado quanto à malha de
  rotas e às missões concluídas (não verificado nesta sessão) —
  `AGENTS.md` já reflete as 17 rotas reais e o estado atual (GF-001,
  GF-002).
- ~~`src/services/recurrences.functions.ts` é código morto confirmado~~ —
  **removido em GF-005** (ver missão abaixo).
- ~~Bug de tipagem latente descoberto na sessão de 23/07/2026 (GF-002)~~ —
  **corrigido em GF-003** (ver missão abaixo).
- Dependência de `LOVABLE_API_KEY` no chat/import ainda não investigada
  — contradiz o objetivo de reduzir dependência da plataforma Lovable.
- ~~`loans` (empréstimos/financiamentos/consórcios) sem vínculo com
  `transactions`~~ — **vinculado em GF-005** (pagamento de parcela; o
  cadastro/criação de loan continua manual, fora de escopo).
- Roadmap da Lovable lista "MCP/OAuth" como pendência de alta
  prioridade — **desatualizado**: o usuário já decidiu não configurar
  isso sem uma decisão de escopo deliberada. Remover do roadmap da
  Lovable.

---

## Missões — numeração única a partir de agora (prefixo `GF-`)

### GF-001 — Import assíncrono
**Status:** ✅ Concluído (23/07/2026, Claude Code)

**Contexto original:** o processamento de extratos importados (OFX/CSV/PDF)
rodava de forma síncrona dentro da server function. Em Cloudflare Workers,
isso era risco real de timeout para arquivos grandes — a etapa dominante
era a classificação por IA em `classifyAndCheckImport`, que rodava até 10
lotes de 40 linhas em `await` sequencial **dentro de uma única invocação**.

**Divergência encontrada antes de codar (conforme guardrail):** não existe
NENHUMA infraestrutura de execução em background neste repo — sem
`wrangler.toml` versionado, sem Cloudflare Queues, sem Durable Objects, sem
cron triggers. A doc original presumia um modelo "HTTP 202 + status
`syncing`/`done`/`error` consultável" (job assíncrono de verdade), que
exigiria provisionar infraestrutura nova fora do controle deste repo (o
deploy Cloudflare é gerenciado pela Lovable). Pausei e perguntei ao usuário;
decisão: **abandonar o modelo de job/fila em favor de chunking orquestrado
pelo cliente** — sem infraestrutura nova, com trade-off explícito e aceito
(se o usuário fechar a aba no meio, o import para; não sobrevive a reload).

**O que foi feito:**
- `src/lib/supabase/import.functions.ts`: `classifyAndCheckImport`
  (monolítico) foi dividido em duas server functions:
  - `prepareImportClassification` — hash, dedup, regras aprendidas,
    vínculo estrutural de parcelamento/recorrência (tudo determinístico e
    barato, sem IA). Devolve as linhas já resolvidas + os lotes que ainda
    precisam de IA.
  - `classifyImportBatch` — classifica UM lote (até 40 linhas) por
    chamada. Chamada repetidamente pelo cliente em sequência.
  - `classifyBatchWithAI` mudou de comportamento: antes engolia QUALQUER
    falha (rede, HTTP não-ok, JSON malformado) e devolvia mapa vazio
    silenciosamente; agora só fica silenciosa quando `LOVABLE_API_KEY`
    não está configurada (fluxo manual intencional) — qualquer outra
    falha agora lança, pra aparecer como erro daquele lote específico no
    cliente, não sumir sem explicação.
- `src/routes/_app.import.tsx`: `finishUpload` chama
  `prepareImportClassification` uma vez e depois dispara
  `classifyImportBatch` em loop sequencial (`runClassificationBatches`),
  com:
  - Barra de progresso visível (lotes concluídos/total) assim que a
    tabela de pré-visualização já aparece com as linhas resolvidas sem
    IA.
  - Erro por lote (não um erro genérico no fim): cada lote com falha
    aparece como um card vermelho com a mensagem específica e um botão
    "Tentar de novo" que reclassifica só aquele lote
    (`retryBatch`/`runSingleBatch` com flag `isRetry` pra não contar
    duas vezes no progresso).
  - Uma falha de lote nunca aborta os demais nem a importação — as
    linhas daquele lote ficam apenas sem sugestão da IA, disponíveis
    pra categorização manual na tabela (mesmo comportamento de "sem
    categoria" que já existia pra IA indisponível).
- PDF (`extractPdfStatement`) **não foi alterado** — é uma única chamada
  de IA (não um loop), risco de timeout bem menor; fica como pendência
  separada caso se confirme problema em uso real (ver fila abaixo).

**Verificação:** `tsc --noEmit` limpo, `npm run lint` sem problemas novos
(só ruído pré-existente de CRLF no repo inteiro, não relacionado), `npm
test` 103/103 passando. Não testado manualmente em browser nesta sessão
(sem servidor dev rodando) — recomendado antes de considerar
definitivamente validado em uso real.

**Guardrails observados:**
- Dedup (hash SHA-256) e precedência `tempero > regra aprendida > IA`
  preservados exatamente — só a camada de disparo das chamadas de IA
  mudou, a lógica de decisão de categoria é a mesma.
- Commitado em duas etapas (`5599d79` implementação, `44fd8cf`
  cobertura de teste) e enviado para `origin/main` em 23/07/2026.

---

### GF-002 — Sair da sessão + indicador de login na sidebar
**Status:** ✅ Concluído (23/07/2026, Claude)

**Contexto:** o menu lateral (`AppShell`) não tinha botão de logout nem
nenhuma indicação visual de qual conta estava logada — a única forma de
sair era a página `/settings`, sem visibilidade de sessão em nenhum
outro lugar do app.

**O que foi feito:**
- `src/components/app-shell.tsx`: botão "Sair" logo abaixo de
  "Configurações" (sidebar desktop, fixado no rodapé via `mt-auto`, e
  drawer mobile) — reaproveita exatamente a lógica já existente e
  testada de `/settings` (`supabase.auth.signOut()` + toast + redirect
  pra `/`), nenhum fluxo novo inventado.
- Indicador de sessão ativa: dot verde pulsante (`animate-ping`) + e-mail
  do usuário logado, lido de `supabase.auth.getSession()` +
  `supabase.auth.onAuthStateChange` — sessão já cacheada no client do
  browser (`persistSession: true`), sem nova query ao servidor nem hook
  novo de auth.
- Playwright + Chromium instalados como devDependency (a pedido do
  usuário, pra permitir verificação visual de mudanças de UI). Usado ad
  hoc nesta missão (screenshot da tela de login, checagem de console
  errors); não configurado como suíte E2E — isso fica pra quando a
  pendência "Testes E2E" (fila abaixo) for priorizada.

**Verificação:** `tsc --noEmit` limpo, lint sem problemas novos, 118/118
testes (nenhum teste novo — mudança de UI sem lógica de negócio nova).
Validação com Playwright: página de login carrega sem erros de console;
navegação direta a `/dashboard` sem sessão confirma o guard de auth
redirecionando corretamente pra `/`, sem nenhum erro relacionado ao
`AppShell` (só um aviso de hydration mismatch pré-existente e não
relacionado em `index.tsx`/`WelcomeComponent`, não corrigido — fora do
escopo desta missão). **A sidebar autenticada não foi verificada via
screenshot** — decisão explícita do usuário: mudança de risco baixo,
lógica reaproveitada e já testada, não compensa criar conta de teste na
produção nem compartilhar credenciais só pra esse check (guardar esse
investimento pra quando a pendência "Testes E2E" for priorizada).
Validação visual final da sidebar fica por conta do próprio usuário, na
sessão real dele.

---

### GF-003 — Corrigir bug TxLinkSearch em expense-breakdown-dialog.tsx
**Status:** ✅ Concluído (23/07/2026, Claude)

**Contexto:** achado latente da GF-002 (ver seção "Achados ainda sem
correção" acima) — `src/routeTree.gen.ts` commitado estava desatualizado
e não incluía o bloco de augmentação
`declare module '@tanstack/react-start' { interface Register { ... } }`
que o `@tanstack/router-plugin` gera automaticamente. Isso mascarava um
erro de tipo real em `expense-breakdown-dialog.tsx:320`.

**O que foi feito:**
- Rodado `npx vite build --mode development` para regenerar
  `src/routeTree.gen.ts` localmente — confirmado que o bloco de
  augmentação estava de fato faltando (diff de +10 linhas) e que, com ele
  presente, `tsc --noEmit` passa a acusar exatamente o erro descrito:
  `TxLinkSearch` sem a propriedade `page` obrigatória.
- `src/lib/finance/expense-breakdown.ts`: `buildExpenseDrilldownSearch`
  agora inclui `page: 1` nos dois ramos do `ExpenseDrilldownSearch`
  (fatura de cartão e categoria fixa/variável) — consistente com todas as
  outras navegações para `/transactions` no repo (`_app.dashboard.tsx`,
  `_app.transactions.edit.$id.tsx`, `_app.transactions.new.tsx`), que
  sempre resetam pra página 1 ao entrar com filtro novo.
- `src/components/dashboard/expense-breakdown-dialog.tsx`: tipo local
  `TxLinkSearch` atualizado para incluir `page: number`, batendo com o
  tipo `ExpenseDrilldownSearch` centralizado.
- `src/lib/finance/expense-drilldown.test.ts`: as 3 asserções existentes
  atualizadas para esperar `page: 1` no objeto de busca retornado (mesmo
  teste, cobrindo o cenário exato do bug).
- `src/routeTree.gen.ts` regenerado **commitado junto** (não revertido
  desta vez) — a própria análise da GF-002 já apontava que não dá pra
  corrigir só um lado sem quebrar `tsc --noEmit` (cláusula 3): o bloco de
  augmentação e o `search` corrigido precisam entrar juntos no mesmo
  diff.

**Verificação:** `tsc --noEmit` limpo (era o erro documentado antes da
correção, confirmado reproduzido e depois eliminado). `npm run lint` sem
problemas novos nos 3 arquivos alterados (só ruído pré-existente de CRLF
repo-wide, mesmo already-known de GF-001/GF-002). `npm test`: 118/118
passando. Validação E2E via Playwright (clique real no modal → navegação
→ tela de Lançamentos) **não executada nesta sessão** — decisão explícita
do usuário, mesmo precedente da GF-002: não existe conta de teste nem
infraestrutura de login no repo, e o teste automatizado já cobre
exatamente a lógica corrigida (o objeto `search` agora inclui `page: 1`).
Fica pra quando a pendência "Testes E2E" (fila abaixo) for priorizada.

**Guardrails observados:**
- Diff isolado ao bug: nenhuma mudança fora do escopo (`git status` /
  `git diff --stat` revisados antes de qualquer commit).

---

### GF-004 — Entrada de voz (Whisper) no /chat
**Status:** ⚠️ Implementado, **verificação end-to-end pendente** (23/07/2026, Claude)

**Contexto original da missão:** roadmap presumia ZimaOS self-hosted rodando
faster-whisper via Docker, com decisão de provedor já tomada. Duas
divergências relevantes encontradas antes de codar (conforme guardrail —
parei e perguntei ao usuário antes de prosseguir):

1. **Código pré-existente quebrado:** o botão de microfone, gravação via
   `MediaRecorder` e preenchimento do campo de texto já existiam em
   `_app.chat.tsx`, mas chamavam uma Supabase Edge Function
   `whisper-transcribe` **inexistente** (confirmado via MCP do Supabase:
   zero edge functions deployadas no projeto `gerentefina`, sem
   `supabase/functions/` no repo) — todo clique no microfone já falhava
   silenciosamente com "Falha na transcrição".
2. **ZimaOS ainda não tinha nenhum container rodando** — o usuário
   confirmou que não há faster-whisper (nem nada) hospedado lá hoje.
   Subir infraestrutura nova no ZimaOS está fora do meu alcance (exige
   acesso direto à máquina).

**Decisão revisada com o usuário:** abandonar ZimaOS (nada hospedado, viraria
trabalho de infra fora deste repo) em favor de **Cloudflare Workers AI**
(`@cf/openai/whisper`) — já no mesmo Cloudflare account que hospeda o app,
sem Docker/subdomínio/VPN novos, custo baixíssimo por minuto de áudio
(~$0.00045/min). Reaproveitada a UI de gravação já existente, só trocado o
backend.

**O que foi feito:**
- `wrangler.jsonc` (novo, raiz do repo): binding `ai: { binding: "AI" }` —
  Nitro mescla automaticamente no build (confirmado no
  `.output/server/wrangler.json` gerado).
- `wrangler` adicionado como devDependency (necessário para `wrangler types`
  e para rodar `wrangler dev`/`preview` localmente no futuro).
- `src/services/voice.functions.ts` (novo): server function
  `transcribeVoiceMessage` — exige `resolveActiveUserId()` (chamada tem
  custo real, não pode ficar aberta sem sessão), decodifica o áudio
  base64, valida tamanho, chama `env.AI.run("@cf/openai/whisper", { audio:
  [...bytes] })` via `cloudflare:workers`, devolve `{ text }`.
  - **Modelo escolhido de propósito:** `@cf/openai/whisper` (não a variante
    `-large-v3-turbo`, que aceitaria `language: "pt"` para forçar PT-BR). A
    variante turbo tem um contrato de entrada (`audio: string | { body,
    contentType }`) cujo formato exato de string não está documentado
    publicamente pela Cloudflare, e não há como descobrir por tentativa
    nesta sessão (sem login Cloudflare disponível, ambiente não-
    interativo). O modelo base tem contrato 100% documentado e testado
    (array de bytes) — trade-off aceito: sem `language` fixado, mas o
    Whisper detecta idioma automaticamente e funciona bem para PT-BR na
    prática. Documentado no próprio arquivo para reavaliação futura.
- `src/lib/audio/voice-transcription.ts` (novo): lógica pura extraída para
  ser testável sem o binding real — `base64ToBytes`, `validateAudioBytes`
  (limite de 10MB, rede de segurança), `formatElapsedSeconds` (contador
  mm:ss da UI), `MAX_RECORDING_SECONDS = 60`.
- `src/routes/_app.chat.tsx`: troca da chamada `supabase.functions.invoke
  ("whisper-transcribe")` por `transcribeVoiceMessage`; adicionado limite
  de gravação de 60s com parada automática; indicador visual de gravação
  (ponto pulsante + contador `0:00 / 1:00`, `aria-live="polite"`); erros de
  microfone diferenciados (sem dispositivo vs. permissão negada vs. erro
  genérico); cleanup de interval/stream ao desmontar o componente.
- **Achado colateral corrigido:** incluir o `worker-configuration.d.ts`
  completo (gerado por `wrangler types`) no `tsconfig.json` quebrava tipos
  em arquivos não relacionados (`header-clock-bar.tsx`,
  `chat.functions.ts`) — ele redefine globais (`Response`, `fetch`...) com
  os tipos do runtime Cloudflare Workers, conflitando com os tipos DOM
  usados pelo resto do app. Resolvido com uma declaração mínima e isolada
  em `src/types/cloudflare-workers.d.ts` (só o necessário: `env.AI`), sem
  tocar nos globais — `worker-configuration.d.ts` gitignored, não faz parte
  do build.

**Verificação:** `tsc --noEmit` limpo, `npm run lint` sem problemas novos
(só ruído pré-existente de CRLF), `npm test` 127/127 (9 testes novos em
`voice-transcription.test.ts`, cobrindo decode base64, limite de tamanho e
formatação do contador). Build completo (`vite build`) confirmado gerando
o binding `ai` corretamente no `wrangler.json` de saída.
**Transcrição real via Workers AI NÃO foi testada ponta a ponta nesta
sessão** — não há login Cloudflare disponível neste ambiente (sessão
não-interativa, sem fluxo OAuth) e o binding Workers AI sempre acessa a
conta Cloudflare real mesmo em dev local (não é mockável), então não há
como validar sem deploy real. Fica como validação pendente: testar o
botão de microfone no ambiente publicado (deploy gerenciado pela Lovable)
e confirmar que a transcrição volta corretamente. **Não marcar esta missão
como 100% concluída até essa validação acontecer.**

**Guardrails observados:**
- Parei e perguntei ao usuário antes de assumir qualquer decisão de infra
  (provedor, rede, o que fazer com o código de UI pré-existente) —
  guardrail explícito da própria missão.
- Diff isolado ao escopo da missão (`git status`/`git diff --stat`
  revisados antes do commit).

---

### GF-005 — Vincular loans a transactions + remover código morto
**Status:** ✅ Concluído (23/07/2026, Claude)

**Contexto:** duas pendências da fila, pedidas juntas. A segunda (remover
`recurrences.functions.ts`) era trivial. A primeira ("vincular loans a
transactions") acabou sendo bem maior do que o nome sugeria — descoberto
antes de codar (parei e perguntei ao usuário, guardrail padrão): `loans`
hoje só tem leitura e exclusão pela UI (`/installments`), nenhum cadastro
nem forma de registrar pagamento — `installments_paid` era um contador
manual solto, sem nenhuma transação real por trás, e `transactions` não
tinha coluna `loan_id`. Usuário escolheu o escopo completo: schema +
RPC de pagamento + botão na UI (não só a coluna, e não só documentar).

**O que foi feito:**
- `src/services/recurrences.functions.ts` **removido** — confirmado zero
  imports no repo inteiro (`/agendamentos` usa `scheduled-items.functions.ts`
  + `recurrence-materializer.functions.ts`, arquivos ativos e diferentes).
  O arquivo morto ainda tinha um problema de segurança latente próprio
  (`toggleRecurrenceActive`/`deleteRecurrence` sem filtro `user_id`) —
  reforça que era mesmo código abandonado, não só não-usado.
- **Migration 0022** (`transactions.loan_id`, nullable, `on delete set
  null` — mesma semântica de `category_id`; check constraint exigindo
  `kind='expense'` quando `loan_id` setado; índice de idempotência) +
  RPC `pay_loan_installment` (mesmo padrão atômico de
  `pay_credit_card_invoice`, migration 0011: trava a linha do loan,
  insere a despesa e incrementa `installments_paid`/vira `paid_off` na
  MESMA transação de banco, idempotência via `_idempotency_key`).
  Segurança: `security definer` com `revoke execute` de
  `public/anon/authenticated` **na mesma migration** (disciplina das
  migrations 0019/0021 — não repetir o erro original), confirmado via
  `information_schema.role_routine_grants` (só `service_role`/`postgres`).
- **Migration 0023 (correção):** testei a RPC de verdade contra o banco
  (não só tsc/lint) logo após aplicar a 0022 — a primeira chamada real
  falhou com `column reference "installments_paid" is ambiguous"`
  (colisão entre a coluna real de `loans` e a coluna de saída do
  `RETURNS TABLE` de mesmo nome). Corrigido qualificando todas as
  referências com alias (`l`/`t`) dentro do corpo da função. Mesmo
  padrão do projeto de "achado numa migration, corrigido por uma nova"
  (precedente: 0019 → 0021).
- `src/services/installments.functions.ts`: `payLoanInstallment` — valida
  posse do loan e da categoria (deve ser `kind='expense'` do próprio
  usuário) na camada TypeScript ANTES de chamar a RPC (a função no banco
  não recebe `user_id`, mesma disciplina de `deleteInstallmentPurchase`).
  Comentário de `deleteLoan` atualizado (premissa antiga não é mais
  verdadeira, mas o comportamento — DELETE simples — continua correto
  graças ao `on delete set null`).
- `src/routes/_app.installments.tsx`: botão "Pagar parcela" (ícone
  `HandCoins`) em cada loan ativo com parcelas restantes — abre um
  dialog com valor sugerido (`principal_amount / installments_count`,
  editável), data (default hoje) e categoria de despesa; ao confirmar,
  gera um `crypto.randomUUID()` como chave de idempotência e invalida
  `installments`/`transactions`/`dashboard`. Toast diferencia "parcela
  paga" de "empréstimo quitado".

**Verificação (teste real contra o banco, não só tsc/lint — cláusula 14):**
inseri um loan de teste (12x R$100, `installments_count=12`) e chamei a
RPC diretamente via SQL: (1) pagamento normal cria a transação e avança
`installments_paid`; (2) a MESMA `_idempotency_key` reenviada devolve a
transação já existente sem duplicar (`was_duplicate=true`, contagem não
avança); (3) ao chegar na 12ª parcela o loan vira `paid_off`
automaticamente; (4) tentar pagar um loan `paid_off` é rejeitado com erro
claro; (5) o check constraint bloqueia `loan_id` em transação que não seja
`kind='expense'`. Todos os dados de teste foram removidos ao final (banco
voltou ao estado anterior — 0 loans). `tsc --noEmit` limpo, `npm run lint`
sem problemas novos, `npm test` 127/127 (sem testes novos — a lógica nova
mora no banco, testada diretamente contra ele; não há lógica pura nova no
TypeScript que justifique um teste unitário separado).

**Fora do escopo (documentado, não esquecido):** cadastro de loan
(criação) continua manual/fora do app — só o pagamento de parcela foi
vinculado, como decidido com o usuário. Validação da UI (clicar o botão
de verdade no browser) não foi feita nesta sessão — mesmo padrão de
proporcionalidade já usado antes (GF-002/GF-003): a lógica de negócio
real já foi validada direto no banco, o que resta é só clique de UI.

**Guardrails observados:**
- Parei e perguntei o escopo antes de tocar no banco (achado: tarefa
  maior do que o nome sugeria).
- Migration aplicada via MCP do Supabase (`apply_migration`), não SQL
  solto — fica corretamente rastreada em
  `supabase_migrations.schema_migrations`, evitando o problema de
  tracking que already motivou uma consolidação inteira antes (ver seção
  "Achados ainda sem correção" no topo deste documento).
- Diff isolado ao escopo da missão (`git status`/`git diff --stat`
  revisados antes do commit).

---

## Pendências conhecidas — fila para virar GF-006, GF-007...

Ordem sugerida (ajustável a qualquer momento):

1. **Validar a GF-004 ponta a ponta** — testar o microfone/transcrição no
   ambiente publicado (sem isso, a missão não está de fato fechada).
2. Avisar a Lovable para remover "MCP/OAuth" do roadmap dela.
3. Open Finance real via Pluggy (hoje só simulação manual).
4. Atualizar `PRD-GerenteFINA-IA.md` para refletir as 17 rotas reais e o
   estado atual (`AGENTS.md` já corrigido).
5. Investigar e resolver a dependência de `LOVABLE_API_KEY`.
6. Retomar a limpeza da branch `feature/embed-tarefas-integration` /
   criação do repositório `fluxograma` (pausado, não esquecido).
7. Validação end-to-end do PDF import — inclui confirmar se
   `extractPdfStatement` (chamada única de IA, não chunked pela GF-001)
   precisa do mesmo tratamento se se confirmar timeout em PDFs grandes.
8. Testes E2E (Playwright) para fluxos críticos — Playwright + Chromium
   já instalados como devDependency (GF-002); falta configurar a suíte
   de verdade (login real, fixtures, CI).
9. Testar manualmente no browser o fluxo de import com a barra de
   progresso/chunking da GF-001 (implementado e com `tsc`/lint/testes
   limpos, mas sem validação visual em uso real ainda).
10. Restore de backup > 5MB (hoje carrega tudo em memória).
11. Testar manualmente no browser o botão "Pagar parcela" de loans
    (GF-005) — lógica já validada direto no banco, falta só o clique real.
12. Considerar expor cadastro (criação) de loans pela UI — hoje ainda é
    manual/fora do app, fora do escopo da GF-005.

---

_Documento vivo — atualizar a cada missão concluída, sem renumerar as
anteriores._
