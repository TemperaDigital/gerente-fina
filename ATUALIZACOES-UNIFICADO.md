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
- `src/services/recurrences.functions.ts` é código morto confirmado
  (zero imports).
- **Bug de tipagem latente descoberto na sessão de 23/07/2026 (GF-002):**
  `src/routeTree.gen.ts` commitado não inclui o bloco de augmentação
  `declare module '@tanstack/react-start' { interface Register { ... } }`
  que o `@tanstack/router-plugin` atual gera automaticamente ao rodar o
  dev server. Sem essa augmentação, o registro de tipos do router fica
  incompleto e MASCARA um erro real em
  `src/components/dashboard/expense-breakdown-dialog.tsx:320` (`TxLinkSearch`
  sem a propriedade `page` obrigatória num `search` de navegação). Ao
  regenerar `routeTree.gen.ts` localmente, `tsc --noEmit` passa a falhar
  nesse ponto. Revertido antes do commit da GF-002 pra não misturar um
  problema não relacionado no diff — precisa de uma missão própria pra
  regenerar `routeTree.gen.ts` e corrigir o `search` faltante em
  `expense-breakdown-dialog.tsx` juntos (não dá pra fazer só um dos dois
  sem quebrar `tsc --noEmit`, cláusula 3).
- Dependência de `LOVABLE_API_KEY` no chat/import ainda não investigada
  — contradiz o objetivo de reduzir dependência da plataforma Lovable.
- `loans` (empréstimos/financiamentos/consórcios) sem vínculo com
  `transactions`.
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

## Pendências conhecidas — fila para virar GF-003, GF-004...

Ordem sugerida (ajustável a qualquer momento):

1. Avisar a Lovable para remover "MCP/OAuth" do roadmap dela.
2. Entrada de voz (Whisper) no `/chat`.
3. Open Finance real via Pluggy (hoje só simulação manual).
4. Atualizar `PRD-GerenteFINA-IA.md` para refletir as 17 rotas reais e o
   estado atual (`AGENTS.md` já corrigido).
5. Investigar e resolver a dependência de `LOVABLE_API_KEY`.
6. Vincular `loans` a `transactions`.
7. Remover `src/services/recurrences.functions.ts` (código morto).
8. Retomar a limpeza da branch `feature/embed-tarefas-integration` /
   criação do repositório `fluxograma` (pausado, não esquecido).
9. Validação end-to-end do PDF import — inclui confirmar se
   `extractPdfStatement` (chamada única de IA, não chunked pela GF-001)
   precisa do mesmo tratamento se se confirmar timeout em PDFs grandes.
10. Testes E2E (Playwright) para fluxos críticos — Playwright + Chromium
    já instalados como devDependency (GF-002); falta configurar a suíte
    de verdade (login real, fixtures, CI).
11. Testar manualmente no browser o fluxo de import com a barra de
    progresso/chunking da GF-001 (implementado e com `tsc`/lint/testes
    limpos, mas sem validação visual em uso real ainda).
12. Restore de backup > 5MB (hoje carrega tudo em memória).

---

_Documento vivo — atualizar a cada missão concluída, sem renumerar as
anteriores._
