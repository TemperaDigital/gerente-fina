<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

> [!WARNING]
> **Aviso à Lovable:** remova "MCP/OAuth" do seu roadmap interno. O usuário já
> decidiu que a sugestão de integrar agentes externos via MCP foi um engano e
> **não deve ser configurada** sem uma decisão de escopo deliberada no futuro.
> Não sugira nem inicie esse trabalho sem que o usuário peça explicitamente.

# AGENTS.md — Contexto Soberano e Diretrizes do Gerente FINA

Este documento é a Cláusula Pétrea de arquitetura e escopo do projeto "Gerente
FINA". A Inteligência Artificial DEVE ler, respeitar e ancorar todas as
decisões de geração de código, rotas e mutations com base nestas diretrizes.

**Rastreamento de missões:** o histórico de trabalho e a fila de pendências
vivem em `ATUALIZACOES-UNIFICADO.md` (numeração `GF-001`, `GF-002`...), não
mais em `atualizacoes.md` ou `Gerente_Fina_-_construcao.md` isoladamente —
ambos continuam existindo como registro histórico/arquival, mas não são mais
a fonte de verdade para "o que falta fazer".

---

## 1. Stack Tecnológica e Convenções Físicas
- Framework: TanStack Start (Full-stack Router com Server Functions)
- Banco de Dados: Supabase (PostgreSQL relacional com RLS ativo), projeto
  externo (fora da infraestrutura da Lovable)
- Estilização: Tailwind CSS + shadcn/ui (Tema Dark Mode Premium Glassmorphism
  / Estilo ZimaOS)
- Responsividade Rígida: Mobile-First de ponta a ponta (ocultar tabelas
  complexas em celulares usando classes utilitárias do Tailwind)
- Deploy: Cloudflare Workers — atenção a limitações do runtime (sem
  `child_process`, `sharp`, `canvas`, `puppeteer`, `fs.watch`, `os.cpus()`) e
  ao risco de timeout em processamento síncrono pesado

⚠️ ATENÇÃO COM AS COLUNAS REAIS DO BANCO DE DADOS:
- Na tabela `transactions`, a coluna de tipo chama-se `kind` (enum: 'income',
  'expense', 'transfer', 'invoice_payment'). Não use 'type'.
- Na tabela `transactions`, a coluna de data chama-se `occurred_on`. Não use
  'occurred_at'.
- A view de saldos chama-se `account_balances` e possui os contratos:
  `account_id`, `account_name`, `account_type` e `balance`.
- Nunca identificar o tipo de uma conta pelo nome (`account.name`) — sempre
  pelo campo real `account.type`. Já causou bug real: contas chamadas
  "ICREDITO"/"INTERCARD" apareciam como conta corrente porque um widget lia o
  campo errado do DTO.

---

## 2. Mapa Canônico de Rotas e Componentes (Malha do Aplicativo)

O ecossistema do Gerente FINA é composto por **17 rotas** (não 15 — a malha
cresceu desde versões anteriores deste documento; qualquer contagem antiga
está desatualizada). Qualquer modificação ou nova funcionalidade deve
respeitar esta malha:

### 2.1 Rota Raiz e Autenticação
- `/` (Boas-Vindas): Interface Split-Screen premium. Inputs de e-mail/senha
  com toggle visual de visibilidade (ícone de olho) e botões dedicados para
  Google OAuth e Apple ID (**hoje apenas visuais, providers ainda não
  habilitados**).
- `/forgot-password` (Recuperação de senha): fluxo de recuperação por e-mail.
- `/reset-password` (Redefinição de senha): fluxo pós-e-mail de recuperação.

### 2.2 Core Inteligente e Conversacional
- `/chat` (Chat com Gerente Fina): Interface estilo ChatGPT. Balões de chat
  distinguindo usuário e IA, campo inferior de texto e botão de microfone
  (Whisper UI) para comandos e lançamentos de voz. **Tool calling real já
  funcional e validado em uso** (criar lançamento, consultar por
  período/categoria, relatórios); **captura de voz via Whisper ainda não
  implementada** — o botão de microfone é placeholder visual.

### 2.3 Núcleo Operacional de Lançamentos
- `/transactions` (Lista de Lançamentos): Tabela consolidada com paginação e
  filtros na URL (período, texto livre, valor mínimo/máximo, conta). Deve
  exibir fração de parcela (ex: 3/12) e mês de referência da fatura nas
  linhas. Botões funcionais de "Importar CSV" e "Exportar CSV" no topo.
  Review Queue antiduplicidade mantida no cabeçalho. Seleção múltipla com
  exclusão em lote (checkbox por linha + header select-all + barra de ação),
  com tratamento de falha parcial linha a linha.
- `/transactions/new` (Novo Lançamento): Formulário unificado por pílulas
  absolutas ([Receita], [Despesa], [Transferência], [Pagamento]). Box de
  projeção de fatura em tempo real para cartões. Accordions funcionais para
  Parcelamento e Recorrência.
- `/transactions/edit/:id` (Edição): Rota de retificação puramente
  atributiva (proibido botão de converter em parcelamento). Permite ajustar
  valor e vencimento de parcelas individuais de forma isolada.

### 2.4 Movimentações e Conexões Externas
- `/import` (Importação de Extratos): Área de Drag & Drop para CSV/OFX/PDF.
  Modal inteligente de classificação (IA detecta se é conta ou cartão). Se
  cartão, exibe campos de fechamento/vencimento. Tabela de mapeamento
  destaca transações duplicadas em vermelho com botão "Ignorar Duplicatas".
  **Processamento assíncrono via chunking (GF-001, concluída):** o cliente
  dispara a classificação por IA em lotes sequenciais de até 40 linhas
  (`prepareImportClassification` + `classifyImportBatch`), com barra de
  progresso visível e cartão de erro por lote com retry — evita timeout em
  Cloudflare Workers para arquivos grandes. Linhas resolvidas por regra de
  "tempero" ou regra aprendida NUNCA entram no lote de IA (bug real já
  corrigido: um patch de IA sobrescrevendo essas categorias por cima seria
  silencioso e errado).
- `/open-finance` (Conexão Bancária): Hub de gerenciamento com grade de
  logotipos das instituições financeiras. **Hoje é cadastro/simulação
  manual do nome da instituição — não há integração real com a Pluggy
  (sem SDK carregado, sem Edge Function de token, sem fluxo OAuth de
  verdade).** Qualquer texto que sugira OAuth funcional está descrevendo o
  estado desejado, não o atual.

### 2.5 Malha Patrimonial
- `/accounts` (Contas Correntes): CRUD Dark Mode para gerenciamento de
  contas do tipo Checking, Savings ou Cash com saldos agregados do banco em
  tempo real.
- `/credit-cards` (Cartões de Crédito): CRUD para cartões contendo inputs de
  Limite de Crédito, Dia de Fechamento e Dia de Vencimento (gatilho do motor
  do meio do mês: se `due_day > closing_day`, a fatura vence no MESMO mês do
  fechamento).

### 2.6 Categorias Gerenciais
- `/categories` (Categorias): Tela de gerenciamento da árvore de categorias
  (Receita vs Despesa) com suporte a hierarquia pai/filho e campo `nature`
  (`FIXA`/`VARIÁVEL`).

### 2.7 Painéis Gerenciais Avançados
- `/installments` (Parcelamentos e Empréstimos): Painel dividido em 4 listas
  coloridas: Parcelamentos (Laranja), Empréstimos (Vermelho), Financiamentos
  (Azul) e Consórcios (Verde com badge de contemplação). Barras de progresso
  horizontais indicando quitação. Card superior exibindo o "Valor Total
  Mensal Consolidado". **`loans` ainda sem vínculo com `transactions`** — os
  KPIs de caixa do Dashboard excluem `loans` do cálculo por esse motivo.
- `/budgets` (Orçamentos e Metas): Modais e inputs para definir Valor Limite
  (Teto de gastos por categoria) e Valor Alvo (Metas financeiras de
  curto/longo prazo) com barras visuais de consumo.
- `/forecast` (Previsões): Gráfico de linha preditivo do fluxo de caixa e
  tabela de projeção mensal (saldo atual + média móvel de 90 dias) com botão
  funcional "Executar Nova Previsão" e controles de horizonte.
- `/agendamentos` (Contas a Vencer): painel de itens agendados (schema
  `once` no motor de recorrência). Contas bank/cash exigem confirmação
  manual do usuário para materializar; cartão materializa sozinho.
- `/calculadora` (Calculadora Financeira HP-12C): botão flutuante global +
  rota dedicada, estilo HP-12C.

### 2.8 Preferências do Sistema
- `/settings` (Configurações): Aba de gerenciamento de dados contendo
  botões de ação críticos: Exportar JSON/CSV, Fazer Backup, Restaurar
  arquivo e Excluir Conta Definitivamente (com diálogo de dupla
  confirmação). Também hospeda a gestão de Regras Aprendidas de
  classificação do importador. **Restore de backup > 5MB hoje carrega tudo
  em memória** — validar streaming/paginação antes de confiar em arquivos
  grandes.

---

## 3. Cláusulas Pétreas de Governança

1. **Expurgo Contábil:** Transferências entre contas e pagamentos de
   faturas (`transfer`, `invoice_payment`) nunca devem inflar as receitas ou
   despesas do Dashboard e do DRE.
2. **Regime de caixa × competência, sempre separados:** KPIs do topo do
   Dashboard usam regime de caixa (fatura paga, nunca a compra no cartão);
   donut de categorias e gráfico de 6 meses usam regime de competência.
3. **Integridade de Tipagem:** O projeto deve rodar `tsc --noEmit` (ou
   `tsgo --noEmit`) de forma 100% limpa antes de concluir qualquer commit.
4. **Tratamento de Erros:** loaders do TanStack devem possuir boundaries de
   erro limpas para evitar telas brancas runtime (Error 500).
5. **Saldos nunca persistidos:** proibido gravar saldo calculado em coluna —
   sempre agregar via SQL (`account_balances`).
6. **Toda operação financeira sensível é atômica e idempotente** — pagamento
   de fatura, materialização de recorrência, etc. usam funções Postgres
   `security definer` ou índices únicos, nunca "insere e torce".
7. **Grants de RPC `security definer` nunca ficam só em `authenticated`:**
   revogar explicitamente de `PUBLIC`, `anon` E `authenticated` quando a
   função não deve ser chamada diretamente via REST — `PUBLIC` é herdado
   implicitamente por todo role, então revogar só de `authenticated` NÃO
   fecha o acesso (incidente real: migration 0019 revogou só de
   `authenticated`, deixando `PUBLIC`/`anon` abertos; corrigido na 0021).
   **Depois de qualquer GRANT/REVOKE em RPC, confirmar contra o banco real**
   via `information_schema.role_routine_grants` — nunca assumir que o
   arquivo de migration reflete o estado real do banco.
8. **Toda migration SQL nova vai direto para `supabase/migrations/`**, com
   nome no formato `<timestamp 14 dígitos>_<nome>.sql`, nunca só em
   `docs/migrations/` como rascunho não rastreado. (Histórico: 20 migrations
   existiam como SQL aplicado manualmente no painel, sem tracking pelo
   Supabase — consolidado retroativamente, mas não deixar essa dívida se
   repetir.)
9. **Isolamento entre usuários é inegociável** — toda query escopada por
   `user_id`; RPCs do banco com grants corretos (cláusula 7), nunca confiar
   só na camada TypeScript.
10. **Nunca deixar a IA decidir sozinha informação que só o usuário sabe** —
    o Chat IA pergunta conta/parcelamento antes de criar lançamento, nunca
    assume.
11. **Ações destrutivas (excluir, converter tipo de lançamento) exigem
    confirmação explícita** e mostram o que será afetado antes de agir —
    nunca silenciosas. Proibido `confirm()`/`alert()`/`prompt()` nativos —
    apenas `AlertDialog`/`Dialog` do shadcn.
12. **A branch `feature/embed-tarefas-integration` não pertence a este
    repositório e não deve ser mesclada com `main` sob nenhuma
    circunstância.** Ela contém histórico de um projeto de terceiros não
    relacionado (draw.io/jgraph) misturado por engano; o destino correto é
    um repositório dedicado (`TemperaDigital/fluxograma`). Se precisar
    consultá-la, tratar como somente leitura.
13. **O trabalho é feito direto na branch `main`** — não há branch de
    features intermediária no fluxo atual.
14. **Nenhuma missão é considerada concluída sem verificação real** — build
    limpo e testes verdes são necessários, mas não substituem cobertura de
    teste da lógica nova quando ela existir, nem validação funcional quando
    aplicável. "Passou no que já existia" não é o mesmo que "o que foi
    construído agora funciona".

---

## 4. Uso Operacional Direto via Claude / Claude Code

O usuário é o único usuário real deste sistema (app monousuário, conforme
Seção 1) e também é quem opera Claude/Claude Code com acesso direto ao banco
via conector Supabase. Isso é diferente de "ativar MCP" (aviso no topo deste
documento — MCP nesse outro sentido significaria expor o app a agentes
externos de terceiros via OAuth por usuário); isto aqui é o próprio dono do
sistema usando as ferramentas que já possui.

Esse uso é bem-vindo para: subir um extrato e acompanhar o processamento na
conta real, diagnosticar por que algo não bateu, corrigir um bug de código na
hora, e sugerir melhorias com base no comportamento observado em produção.

**Regra inegociável desse uso: mutação de dado financeiro real SEMPRE passa
pelas RPCs/funções do próprio app — nunca por `UPDATE`/`INSERT`/`DELETE` cru
direto numa tabela**, mesmo tendo acesso de sobra pra fazer diferente.
Motivo: as RPCs (`pay_credit_card_invoice`, `convert_transaction_entry`,
`delete_installment_purchase`, etc.) existem precisamente para garantir
atomicidade, idempotência e os triggers de reconciliação (cláusula 6 da
Seção 3). Escrever direto na tabela contorna tudo isso e pode deixar o
sistema num estado inconsistente que nem o próprio app sabe reparar depois —
o mesmo tipo de problema que a cláusula 6 já proíbe para o código da
aplicação vale igualmente para qualquer operação manual feita "por fora".

Consultas de leitura (`SELECT`) para diagnóstico não têm essa restrição —
o cuidado é só sobre gravação.
