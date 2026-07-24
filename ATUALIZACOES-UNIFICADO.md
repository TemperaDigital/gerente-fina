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
- ~~Branch `feature/embed-tarefas-integration` no repositório do Gerente
  Fina: 94 de 96 commits são histórico contaminado de um projeto de
  terceiros (draw.io/jgraph) — não relacionado. Os 2 commits reais têm
  uma vulnerabilidade de XSS/postMessage sem validação de origem.~~ —
  **resolvido em 24/07/2026**: branch remota deletada
  (`git push origin --delete feature/embed-tarefas-integration`),
  conteúdo conferido antes (96 commits, maioria "release" do
  draw.io/jgraph, batendo com o achado original). Decisão do usuário:
  **não criar** o repositório `fluxograma` — o projeto não deve existir,
  nem aqui nem em separado.
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

### GF-004 v1 — Entrada de voz (Whisper) no /chat via Cloudflare Workers AI
**Status:** ❌ Abandonada em 24/07/2026 — ver GF-004 v2 abaixo. Motivo: o
Worker que serve `gerentefina.fguerra.ia.br` roda inteiramente na
infraestrutura/conta Cloudflare gerenciada pela Lovable (confirmado via
`Server: cloudflare` + `CF-RAY` no header HTTP, e via investigação de DNS
que descartou qualquer conta Cloudflare pessoal do usuário como hospedeira
real). A própria Lovable confirmou que não há garantia documentada de que
um `wrangler.jsonc` do repo seja mesclado no Worker publicado, e que
bindings especiais (Workers AI, R2, KV, D1) exigem provisionamento manual
da equipe deles, sem UI hoje para isso. Ou seja: o binding `AI` desta v1
nunca pôde ser confirmado como provisionado em produção, e não havia
caminho confiável para provisioná-lo. Código removido por completo na v2
(`wrangler.jsonc`, `src/types/cloudflare-workers.d.ts`, devDependency
`wrangler`).

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

### GF-004 v2 — Entrada de voz via Lovable AI Gateway
**Status:** ✅ Concluído (24/07/2026, Claude)

**Contexto:** depois de commitar a v1 (binding Cloudflare Workers AI),
pedi pra Lovable confirmar se o binding `AI` tinha sido provisionado no
Worker publicado. Investigação conjunta (Claude + Lovable + Claude com
acesso ao Cloudflare pessoal do usuário) descobriu que `gerentefina.
fguerra.ia.br` roda inteiramente na infraestrutura da Lovable (header
`Server: cloudflare` + `CF-RAY`, mas não é a conta Cloudflare do usuário —
confirmado via DNS: nenhum dos 2 projetos da conta pessoal corresponde a
esse domínio). A própria Lovable admitiu não ter garantia de que o
`wrangler.jsonc` do repo é mesclado no Worker real, e que bindings
especiais exigem provisionamento manual da equipe dela, sem UI hoje pra
isso — ou seja, não havia caminho confiável pra fechar a v1. Perguntada
pelo formato exato de transcrição via AI Gateway (não documentado
publicamente, e o único precedente no repo — `pdf-statement.functions.ts`
— manda texto já extraído, não áudio binário), a Lovable trouxe o
formato oficial da plataforma (endpoint dedicado, campos do multipart,
mapeamento de erros).

**O que foi feito:**
- `src/services/voice.functions.ts` **reescrito**: remove
  `cloudflare:workers`/`env.AI`; monta `FormData` (`file` + `model:
  "openai/gpt-4o-mini-transcribe"`) e chama `POST
  https://ai.gateway.lovable.dev/v1/audio/transcriptions` com
  `Authorization: Bearer $LOVABLE_API_KEY` (sem `Content-Type` manual —
  runtime define o boundary sozinho) — mesmo mecanismo já comprovado
  funcionando neste app pro chat de texto e import de PDF. Mapeamento de
  erro por status (402 créditos esgotados, 429 rate limit, 400 propaga
  mensagem do provider, 5xx genérico) espelha exatamente o padrão já
  usado em `chat.functions.ts`. Continua exigindo `resolveActiveUserId()`
  — cada chamada consome créditos reais, não pode ficar aberta a
  anônimo. Schema Zod ganhou `audio_mime` (enum dos 4 formatos reais que
  MediaRecorder produz) pra montar a extensão certa do arquivo.
- `src/routes/_app.chat.tsx`: `MediaRecorder` agora detecta o mimeType
  suportado via `MediaRecorder.isTypeSupported` (Chrome/Firefox → webm,
  Safari → mp4) — corrige um bug latente da v1, que gravava sem
  `mimeType` explícito e etiquetava o Blob como `audio/webm` fixo
  (mentiria sobre o formato real no Safari). Guarda de blob < 2KB antes
  de subir pro servidor (evita gastar crédito com gravação vazia/mic
  mudo). **Correção de comportamento:** a v1 mandava a transcrição direto
  pro `handleSend` (enviava sozinho); v2 concatena ao input existente
  (nunca apaga o que o usuário já tinha digitado) e não envia
  automaticamente — corrige uma divergência da própria missão original
  (GF-004.md pedia exatamente isso) que passou despercebida na v1.
- `src/lib/audio/voice-transcription.ts`: ganhou `MIN_RECORDING_BYTES`
  (2KB) e o tipo `AudioMimeType` compartilhado entre cliente e server
  function — `base64ToBytes`/`validateAudioBytes`/`MAX_AUDIO_BYTES`/
  `MAX_RECORDING_SECONDS` continuam iguais (provider-agnósticos).
- **Código morto removido:** `wrangler.jsonc` (só existia pro binding
  `AI`, virou vazio de conteúdo relevante), `src/types/cloudflare-
  workers.d.ts` (só tipava `env.AI`), devDependency `wrangler` do
  `package.json`, referência a `worker-configuration.d.ts` no `.gitignore`
  e no comentário do `tsconfig.json`, exclusões `wrangler`/`miniflare` no
  `bunfig.toml` (adicionadas automaticamente pelo bot da Lovable pra
  viabilizar a v1, sem mais função agora). `bun.lock` não foi editado à
  mão (sem `bun` disponível nesta sessão para regenerar com segurança) —
  fica pro próximo `bun install` da Lovable reconciliar.
- `AGENTS.md` e `construcao.md` atualizados: microfone deixa de aparecer
  como placeholder/pendência, marcado como implementado via AI Gateway.

**Verificação:** `tsc --noEmit` limpo, `npm run lint` sem problemas novos
(só ruído pré-existente de CRLF, mesmo baseline de antes — confirmado
comparando contagem de erros contra a versão commitada), `npm test`
127/127 (testes de `voice-transcription.ts` continuam válidos, sem teste
de rede novo — handler fino, integração real exige chave viva).
`vite build` limpo, confirmado que o `wrangler.json` gerado não tem mais
o binding `ai`. **Transcrição real ponta a ponta não foi testada nesta
sessão** — mesma limitação de sempre (sem como autenticar no ambiente
publicado nem simular microfone real daqui), mas a confiança é muito
maior que na v1: o mecanismo (`LOVABLE_API_KEY` + `ai.gateway.lovable.
dev`) já está comprovadamente funcionando em produção para outras duas
features deste mesmo app (chat de texto e import de PDF), ao contrário
do binding Workers AI que nunca chegou a ser confirmado.

**Guardrails observados:**
- Não assumi o formato da chamada de transcrição sem confirmação — a
  Lovable tem knowledge oficial da própria plataforma que eu não tinha
  como adivinhar corretamente (endpoint dedicado, multipart, mapeamento
  de erro).
- Revisei o plano completo da Lovable antes de implementar (não apenas
  aceitei): verifiquei a alegação de que a diretriz de concatenação
  vinha do `AGENTS.md` (não vinha — está no `construcao.md`, atribuição
  errada mas conteúdo real) antes de confiar nela.
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

### GF-006 — Validação do PDF import: risco de timeout + achado real (truncamento silencioso)
**Status:** ✅ Concluído (24/07/2026, Claude)

**Contexto:** pendência da GF-001 — confirmar se `extractPdfStatement`
(única chamada de IA, não chunked como o CSV/OFX) precisa do mesmo
tratamento de chunking.

**Conclusão sobre chunking — NÃO precisa:** o código já tinha, desde
antes desta sessão, as duas proteções que motivaram o redesenho do
CSV/OFX na GF-001: (1) truncamento do texto em `MAX_CHARS = 18_000`
antes de mandar pra IA (evita crescer sem limite com PDFs de muitas
páginas), e (2) `AbortController` com timeout explícito de 30s na
chamada `fetch`, com mensagem de erro específica
("Tempo esgotado ao consultar a IA..."). O problema original da GF-001
era 10 chamadas de IA SEQUENCIAIS sem timeout individual dentro de uma
única invocação — aqui é uma chamada ÚNICA, já limitada em tamanho e
tempo. Risco de timeout já era baixo, como a nota original da GF-001
antecipava.

**Achado real durante a investigação (corrigido):** o truncamento em
18.000 caracteres acontecia **em silêncio** — nenhum sinal chegava ao
cliente quando um PDF longo tinha o final do texto cortado antes de ir
pra IA, ou seja, lançamentos de páginas finais podiam sumir sem nenhum
aviso. Isso contraria o princípio já documentado do próprio projeto
(`docs/PDF_IMPORT_TEST_SCRIPT.md`, Cenário D: "falhas devem ser claras,
nunca silenciosas ou genéricas") — aqui nem é bem uma falha, é pior:
um resultado parcial que parece completo.

**O que foi feito:**
- `src/lib/supabase/pdf-statement.functions.ts`: `PdfExtractResultDTO`
  ganhou `truncated?: boolean`, setado quando o texto extraído excede
  `MAX_CHARS`.
- `src/routes/_app.import.tsx`: novo `toast.warning` quando
  `result.truncated`, avisando que só o começo do PDF foi enviado pra IA
  e que lançamentos das últimas páginas podem ter ficado de fora —
  mesmo padrão já usado pra `skipped_count`.
- `src/lib/finance/pdf-statement.test.ts` (novo — zero cobertura antes
  desta sessão): 13 testes cobrindo `anchorTransactionYear`
  (ancoragem de ano cruzando virada de ano-novo, validação de
  mês/dia/data-âncora, ano bissexto) e `validatePdfExtraction`
  (payload válido + normalização, e cada rejeição de campo inválido
  com mensagem específica).

**Verificação:** `tsc --noEmit` limpo, `npm run lint` sem problemas
novos (confirmado comparando contra a versão commitada — mesma
contagem de ruído pré-existente de CRLF/indentação em
`_app.import.tsx`, 241 antes e depois), `npm test` 140/140 (13 testes
novos). **Validação manual real com PDFs de verdade
(`docs/PDF_IMPORT_TEST_SCRIPT.md`) não foi executada nesta sessão** —
exige `LOVABLE_API_KEY` viva e upload real de arquivo, mesma limitação
de sempre. A conclusão sobre chunking é uma análise de código (limites
já existentes no timeout/truncamento), não um teste de carga real;
fica como validação complementar se algum dia se confirmar timeout em
uso real com PDF muito grande.

**Guardrails observados:**
- Não assumi que "precisa de chunking" nem que "não precisa" sem ler o
  código primeiro — a resposta veio de analisar o que já existia.
- Diff isolado ao achado real (truncamento silencioso) + testes; não
  toquei no ruído pré-existente de `_app.import.tsx`.

---

### GF-007 — Suíte de Testes E2E (Playwright) configurada de verdade
**Status:** ✅ Concluído (24/07/2026, Claude)

**Contexto:** Playwright + Chromium já estavam instalados desde a GF-002,
mas nunca configurados como suíte de verdade (só usado ad hoc pra
screenshot). Faltava login real, fixtures e CI.

**Decisões tomadas com o usuário antes de codar:**
- Autenticação: conta de teste **dedicada** no Supabase Auth (não a conta
  real do usuário) — isolada via RLS/`user_id`, sem risco de misturar
  dados financeiros reais com dados de teste.
- `GERENTEFINA_SERVICE_ROLE_KEY` fornecida pelo usuário para rodar o dev
  server localmente com páginas autenticadas (toda server function usa o
  client admin, não existe caminho autenticado mais fraco).

**Achado de segurança corrigido antes de tudo:** `.gitignore` **não
cobria `.env` nenhum** — corrigido antes de escrever qualquer secret em
disco (commit isolado, em separado).

**O que foi feito:**
- `playwright.config.ts`: projeto `setup` (loga uma vez, salva
  `storageState` em `e2e/.auth/user.json`, gitignored) + projeto `public`
  (sem sessão) + projeto `authenticated` (reaproveita a sessão salva).
  `webServer` sobe o `vite dev` automaticamente (`reuseExistingServer`
  fora do CI). Usa `playwright/test` (subpath já embutido no pacote
  `playwright` instalado, sem precisar adicionar `@playwright/test` como
  dependência nova).
- `e2e/auth.setup.ts` + `e2e/public.spec.ts` (login carrega sem erro de
  console, guard de rota sem sessão redireciona, credencial errada mostra
  erro claro) + `e2e/dashboard.spec.ts` + `e2e/transactions.spec.ts`.
- `.github/workflows/e2e.yml`: roda a suíte em todo push/PR pra `main` —
  `npm ci`, `playwright install --with-deps chromium`, gera `.env` a
  partir de secrets do GitHub Actions, roda `playwright test`, publica o
  relatório HTML como artefato se falhar.
- 3 secrets do GitHub Actions configurados via `gh secret set`
  (`GERENTEFINA_SERVICE_ROLE_KEY`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`)
  — confirmado com o usuário antes de tocar em secrets do repositório.
- **Achado real durante a configuração:** a primeira tentativa de login
  falhou com a conta de teste — não por bug de auth, mas porque a conta
  nova (zero contas/categorias) disparava o modal de onboarding
  ("Bem-vindo ao Gerente FINA"), bloqueando a tela. Resolvido seedando 1
  conta bancária + 2 categorias (expense/income) direto no banco pra essa
  conta de teste — agora ela se comporta como qualquer conta "normal"
  pros testes de dashboard/lançamentos.

**Verificação:** suíte rodada de verdade, contra o dev server local
conectado ao Supabase de PRODUÇÃO (mesmo backend real, dados isolados
pela conta de teste dedicada) — **6/6 testes passando** (login, guard de
rota, credencial errada, dashboard com KPIs, Livro-Caixa carregando).
Uma falha isolada e não-reproduzível apareceu numa primeira rodada em
paralelo (provável cold-start do dev server compilando sob demanda);
reexecutada isoladamente e na suíte completa, passou consistentemente —
documentado aqui em vez de escondido. `tsc --noEmit` limpo (arquivos
`e2e/**` e `playwright.config.ts` adicionados ao `include` do
`tsconfig.json`), `npm run lint` sem problemas, `npm test` (vitest)
inalterado — 140/140, `e2e/*.spec.ts` corretamente fora do escopo do
vitest (`vitest.config.ts` já restringe a `src/**`). **CI confirmado
rodando de verdade no GitHub**: push deste commit disparou o workflow,
que passou (`✓ success`, job `e2e` em 1m7s —
https://github.com/TemperaDigital/gerente-fina/actions/runs/30089795475),
lendo os 3 secrets configurados e rodando a suíte completa contra um
`vite dev` limpo no runner.

**Guardrails observados:**
- Corrigi o gap de segurança do `.gitignore` (`.env` não ignorado) antes
  de escrever qualquer secret em disco, num commit isolado e anterior.
- Perguntei ao usuário antes de decidir a estratégia de autenticação, antes
  de pedir a service_role key, e antes de configurar secrets no GitHub —
  três decisões reais, nenhuma assumida.
- Investiguei a fundo um erro de CORS aparente antes de concluir causa
  raiz (curl direto no endpoint do Supabase confirmou que o servidor
  responde CORS correto — o erro real era o modal de onboarding bloqueando
  a tela, não uma falha de rede).

---

## Pendências conhecidas — fila para virar GF-008, GF-009...

Reorganizada por tipo de trabalho restante, a pedido do usuário
(24/07/2026 — fim das tarefas do dia).

### A) Precisam de teste de uso prático no app publicado (gerentefina.fguerra.ia.br)

1. **Validar a GF-004 v2 ponta a ponta** — testar o microfone/transcrição
   em `gerentefina.fguerra.ia.br/chat` autenticado. Confiança alta
   (mecanismo já comprovado em produção pra outras features deste app),
   mas nunca testado com áudio real de verdade.
2. Testar manualmente no browser o fluxo de import com a barra de
   progresso/chunking da GF-001 (implementado e com `tsc`/lint/testes
   limpos, mas sem validação visual em uso real ainda) — inclui rodar o
   roteiro real de PDF (`docs/PDF_IMPORT_TEST_SCRIPT.md`), já que a
   GF-006 só analisou o código (sem `LOVABLE_API_KEY` viva pra testar
   upload de PDF de verdade).
3. Testar manualmente no browser o botão "Pagar parcela" de loans
   (GF-005) — lógica já validada direto no banco, falta só o clique real.

### B) Alteração de código/estrutura

4. Open Finance real via Pluggy (hoje só simulação manual).
5. Atualizar `PRD-GerenteFINA-IA.md` para refletir as 17 rotas reais e o
   estado atual (`AGENTS.md` já corrigido).
6. Restore de backup > 5MB (hoje carrega tudo em memória).
7. Considerar expor cadastro (criação) de loans pela UI — hoje ainda é
   manual/fora do app, fora do escopo da GF-005.
8. Ampliar a suíte E2E (GF-007) pra mais fluxos críticos conforme surgir
   necessidade — hoje cobre só login/guard/dashboard/lançamentos.
9. **Investigar e resolver a dependência de `LOVABLE_API_KEY`** —
    rebaixada explicitamente pelo usuário (24/07/2026) para o último item
    da fila, de propósito: é a tarefa mais delicada (mexe na independência
    da plataforma Lovable, usada hoje pelo chat, PDF import e transcrição
    de voz) e só deve ser puxada depois de todo o resto acima estar
    resolvido.

---

_Documento vivo — atualizar a cada missão concluída, sem renumerar as
anteriores._

**24/07/2026 — encerramento das tarefas do dia.** Missões concluídas
nesta data: GF-004 v2 (troca de provedor de voz), GF-005 (loans ↔
transactions + limpeza de código morto), GF-006 (validação do PDF import
+ testes), GF-007 (suíte E2E configurada). Fila de pendências reorganizada
acima em (A) precisa de teste prático no app publicado e (B) alteração de
código/estrutura — ambas conferidas e atuais nesta data.
