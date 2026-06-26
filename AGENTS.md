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
# AGENTS.md — Contexto Soberano e Diretrizes do Gerente FINA

Este documento é a Cláusula Pétrea de arquitetura e escopo do projeto "Gerente FINA". A Inteligência Artificial DEVE ler, respeitar e ancorar todas as decisões de geração de código, rotas e mutations com base nestas diretrizes.

---

## 1. Stack Tecnológica e Convenções Físicas
- Framework: TanStack Start (Full-stack Router com Server Functions)
- Banco de Dados: Supabase (PostgreSQL relacional com RLS ativo)
- Estilização: Tailwind CSS + shadcn/ui (Tema Dark Mode Premium Glassmorphism / Estilo ZimaOS)
- Responsividade Rígida: Mobile-First de ponta a ponta (ocultar tabelas complexas em celulares usando classes utilitárias do Tailwind)

⚠️ ATENÇÃO COM AS COLUNAS REAIS DO BANCO DE DADOS:
- Na tabela `transactions`, a coluna de tipo chama-se `kind` (enum: 'income', 'expense', 'transfer', 'invoice_payment'). Não use 'type'.
- Na tabela `transactions`, a coluna de data chama-se `occurred_on`. Não use 'occurred_at'.
- A view de saldos chama-se `account_balances` e possui os contratos: `account_id`, `account_name`, `account_type` e `balance`.

---

## 2. Mapa Canônico de Rotas e Componentes (Malha do Aplicativo)

O ecossistema do Gerente FINA é composto estritamente pelas 15 rotas a seguir. Qualquer modificação ou nova funcionalidade deve respeitar esta malha:

### 2.1 Rota Raiz e Autenticação
- `/` (Boas-Vindas): Interface Split-Screen premium. Inputs de e-mail/senha com toggle visual de visibilidade (ícone de olho) e botões dedicados para Google OAuth e Apple ID.

### 2.2 Core Inteligente e Conversacional
- `/chat` (Chat com Gerente Fina): Interface estilo ChatGPT. Balões de chat distinguindo usuário e IA, campo inferior de texto e botão de microfone (Whisper UI) para comandos e lançamentos de voz.

### 2.3 Núcleo Operacional de Lançamentos
- `/transactions` (Lista de Lançamentos): Tabela consolidada com paginação e filtros na URL (período, texto livre, valor mínimo/máximo, conta). Deve exibir fração de parcela (ex: 3/12) e mês de referência da fatura nas linhas. Botões funcionais de "Importar CSV" e "Exportar CSV" no topo. Review Queue antiduplicidade mantida no cabeçalho.
- `/transactions/new` (Novo Lançamento): Formulário unificado por pílulas absolutas ([Receita], [Despesa], [Transferência], [Pagamento]). Box de projeção de fatura em tempo real para cartões. Accordions funcionais para Parcelamento e Recorrência.
- `/transactions/edit/:id` (Edição): Rota de retificação puramente atributiva (proibido botão de converter em parcelamento). Permite ajustar valor e vencimento de parcelas individuais de forma isolada.

### 2.4 Movimentações e Conexões Externas
- `/import` (Importação de Extratos): Área de Drag & Drop para CSV/OFX. Modal inteligente de classificação (IA detecta se é conta ou cartão). Se cartão, exibe campos de fechamento/vencimento. Tabela de mapeamento destaca transações duplicadas em vermelho com botão "Ignorar Duplicatas".
- `/open-finance` (Conexão Bancária): Hub de gerenciamento com grade de logotipos das instituições financeiras, botão de conexão simulando fluxo OAuth da Pluggy e indicador visual de progresso assíncrono ('syncing').

### 2.5 Malha Patrimonial
- `/accounts` (Contas Correntes): CRUD Dark Mode para gerenciamento de contas do tipo Checking, Savings ou Cash com saldos agregados do banco em tempo real.
- `/credit-cards` (Cartões de Crédito): CRUD para cartões contendo inputs de Limite de Crédito, Dia de Fechamento e Dia de Vencimento (gatilho do motor do meio do mês).

### 2.6 Categorias Gerenciais
- `/categories` (Categorias): Tela de gerenciamento da árvore de categorias (Receita vs Despesa) com suporte a hierarquia pai/filho.

### 2.7 Painéis Gerenciais Avançados
- `/installments` (Parcelamentos e Empréstimos): Painel dividido em 4 listas coloridas: Parcelamentos (Laranja), Empréstimos (Vermelho), Financiamentos (Azul) e Consórcios (Verde com badge de contemplação). Barras de progresso horizontais indicando quitação. Card superior exibindo o "Valor Total Mensal Consolidado".
- `/budgets` (Orçamentos e Metas): Modais e inputs para definir Valor Limite (Teto de gastos por categoria) e Valor Alvo (Metas financeiras de curto/longo prazo) com barras visuais de consumo.
- `/forecast` (Previsões): Gráfico de linha preditivo do fluxo de caixa e tabela de projeção mensal com botão funcional "Executar Nova Previsão".

### 2.8 Preferências do Sistema
- `/settings` (Configurações): Aba de gerenciamento de dados contendo botões de ação críticos: Exportar JSON/CSV, Fazer Backup, Restaurar arquivo e Excluir Conta Definitivamente (com diálogo de dupla confirmação).

---

## 3. Cláusulas Pétreas de Governança
1. Expurgo Contábil: Transferências entre contas e pagamentos de faturas nunca devem inflar as receitas ou despesas do Dashboard e do DRE.
2. Integridade de Tipagem: O projeto deve rodar `tsgo --noEmit` de forma 100% limpa antes de concluir qualquer commit.
3. Tratamento de Erros: loaders do TanStack devem possuir boundaries de erro limpas para evitar telas brancas runtime (Error 500).
