# PRD — Especificação de Requisitos do Gerente FINA

## 1. Objetivo do Sistema
Centralizar todas as contas bancárias e cartões de crédito do usuário em um único sistema de alta performance. A entrada de movimentações ocorre via Open Finance, agente de Inteligência Artificial, importação de extratos e lançamentos manuais. O sistema oferece um painel gerencial avançado com controle de saldos, faturas, parcelamentos, orçamentos e projeções futuras de fluxo de caixa[cite: 2].

---

## 2. Arquitetura Técnica e Engenharia de Dados

### 2.1 Stack de Desenvolvimento
- **Frontend/Backend:** TanStack Start (Full-stack Full-typed Router com Server Functions).
- **Banco de Dados:** Supabase (PostgreSQL relacional com Row Level Security ativo).
- **Estilo Visual:** Dark Mode Premium Glassmorphism (ZimaOS) baseado em Tailwind CSS e shadcn/ui. Borda branca translúcida, gradientes escuros e backdrop blur profundo.

### 2.2 Verdade Absoluta do Banco de Dados (Mapeamento Físico)
A IA não deve criar colunas redundantes ou desalinhadas. A tabela física de transações segue rigorosamente estes contratos:
- `transactions.kind`: Enum contendo os tipos exatos: `'income'`, `'expense'`, `'transfer'`, `'invoice_payment'`.
- `transactions.occurred_on`: Data física do lançamento (Tipo: `date` ou `timestamp`).
- `account_balances` (VIEW): Fornece os campos `account_id`, `user_id`, `account_name`, `account_type` e `balance`.
- `monthly_dre` (VIEW): Fornece os campos `user_id`, `reference_month`, `income`, `expense` e `net_result`.
- `monthly_dre_by_category` (VIEW): Fornece o agrupamento de despesas e receitas purificadas por categoria por mês.

---

## 3. Malha Canônica de Telas e Componentes (As 15 Interfaces)

### 3.1 Boas-Vindas (`/`)
- **Objetivo:** Portal de entrada, apresentação institucional e autenticação[cite: 2].
- **Componentes:** Título de boas-vindas, formulário de login/cadastro com inputs de E-mail e Senha, ícone de Olho para alternar visibilidade da senha e botões de autenticação social via Google OAuth e Apple ID[cite: 2].

### 3.2 Chat com Gerente Fina (`/chat`)
- **Objetivo:** Interface de conversação natural com o agente de IA para registrar despesas e consultar saldos[cite: 2].
- **Componentes:** Balões de chat estilizados separando mensagens do Gerente Fina e do Usuário, campo inferior de texto livre, botão de envio e botão de microfone (ativando interface visual para simulação de captura de áudio/Whisper)[cite: 2].

### 3.3 Dashboard (`/dashboard`)
- **Objetivo:** Painel gerencial consolidado com visibilidade financeira em tempo real[cite: 2].
- **Componentes:** Card de Saldo Total, Card de Fatura Atual, Lista compacta de Parcelas correntes, Gráfico de Fluxo de Caixa integrado, Tabela de consumo de Orçamentos e botões rápidos para lançar, editar ou excluir movimentações[cite: 2].

### 3.4 Lista de Lançamentos (`/transactions`)
- **Objetivo:** Exibir o Livro-Caixa geral com ferramentas extensivas de auditoria[cite: 2].
- **Componentes:** Tabela de lançamentos contendo data, descrição higienizada, categoria, conta/cartão, valor e fração da parcela (ex: 3/12)[cite: 2]. Filtros dinâmicos persistidos na URL por período, texto livre, faixa de valor e conta específica[cite: 2]. Botões de Editar/Excluir por linha, paginação, e botões de ação superiores para "Importar CSV" e "Exportar CSV"[cite: 2]. No topo, área dedicada para a Fila de Revisão de itens concorrentes.

### 3.5 Lançamento de Movimentação (`/transactions/new`)
- **Objetivo:** Inserção manual estruturada de fluxos financeiros[cite: 2].
- **Componentes:** Select de Tipo de Movimentação (mutando campos em tela única), inputs de Valor e Descrição, seletor de Categoria (com botão inline para criar categoria sob demanda), seletores de Conta de Origem/Destino (ajustados dinamicamente para transferências)[cite: 2]. Checkbox de parcelado e Box de Projeção de Fatura de Cartão de Crédito em tempo real (calculando o mês de referência contábil correto e permitindo ao usuário aceitar ou forçar a fatura seguinte)[cite: 2]. Select para recorrências (Avulsa, Fixa, Variável)[cite: 2].

### 3.6 Edição de Lançamento (`/transactions/edit/:id`)
- **Objetivo:** Retificação cirúrgica atributiva de um registro[cite: 2].
- **Componentes:** Inputs de valor, descrição, tipo de lançamento e categoria[cite: 2]. Seletor de conta/cartão associada[cite: 2]. Inputs específicos para retificação manual de propriedades de parcelas individuais (Valor da parcela, Data de vencimento e Número da parcela), salvando alterações mediante diálogo de dupla confirmação[cite: 2].

### 3.7 Importação de Extratos (`/import`)
- **Objetivo:** Upload e processamento inteligente de extratos bancários manuais[cite: 2].
- **Componentes:** Botão seletor de arquivos (CSV/OFX) e lista de arquivos pendentes[cite: 2]. Modal de classificação onde a IA indica se o arquivo pertence a uma conta corrente ou fatura de cartão de crédito[cite: 2]. Campos automáticos ou manuais de datas da fatura (fechamento atual, próximo fechamento e vencimento)[cite: 2]. Tabela de movimentações mapeadas destacando registros duplicados automaticamente em vermelho (validação por hash antiduplicidade)[cite: 2]. Ícones para edição rápida de linha e botão "Confirmar Importação" para persistência em lote no Supabase[cite: 2].

### 3.8 Conexão Bancária (`/open-finance`)
- **Objetivo:** Gerenciar as conexões automáticas de contas externas via API[cite: 2].
- **Componentes:** Grade visual com logotipos das principais instituições financeiras, botão "Conectar" disparando simulação de autenticação OAuth (Pluggy), status da conexão ativa e botão para desconectar[cite: 2]. Sincronizações ativas disparam estados visuais de 'syncing' em background.

### 3.9 Contas Correntes (`/accounts`)
- **Objetivo:** Painel patrimonial para gestão de saldos líquidos em espécie ou bancos[cite: 2].
- **Componentes:** Lista de contas ativas com saldos consolidados[cite: 2]. Botão "Nova Conta" abrindo modal com inputs de Nome do Banco e Saldo Inicial, além de botões para editar ou excluir registros com diálogo de confirmação[cite: 2].

### 3.10 Cartões de Crédito (`/credit-cards`)
- **Objetivo:** Cadastro e parametrização dos motores de faturas[cite: 2].
- **Componentes:** Lista de cartões cadastrados[cite: 2]. Botão "Novo Cartão" abrindo modal com inputs de Nome do Cartão, Limite de Crédito (convertido internamente de BRL para centavos), Dia de Fechamento e Dia de Vencimento[cite: 2]. Opções para editar e excluir o cartão do sistema[cite: 2].

### 3.11 Categorias (`/categories`)
- **Objetivo:** Organização da estrutura mercadológica de classificação do usuário[cite: 2].
- **Componentes:** Listagem estruturada em árvore de categorias, botão "Nova Categoria", select de Tipo (Receita/Despesa) e input de Nome, permitindo edição e exclusão de nós hierárquicos[cite: 2].

### 3.12 Parcelamentos e Empréstimos (`/installments`)
- **Objetivo:** Centralizar e monitorar toda a massa de passivos e dívidas de longo prazo[cite: 2].
- **Componentes:** Card superior exibindo o Valor Total Mensal Consolidado de todas as parcelas do mês[cite: 2]. Painel segmentado por cores e categorias: Parcelamentos de compras comuns (Laranja), Empréstimos ativos (Vermelho), Financiamentos imobiliários/veículos (Azul) e Consórcios (Verde com indicador exclusivo de status de contemplação)[cite: 2]. Barras de progresso horizontais indicando o percentual de quitação que reduz visualmente conforme o pagamento ocorre[cite: 2]. Botões para inserção manual e edição de cada tipo de passivo[cite: 2].

### 3.13 Orçamentos e Metas (`/budgets`)
- **Objetivo:** Controle de tetos de gastos e planejamento de objetivos de poupança[cite: 2].
- **Componentes:** Lista de Orçamentos por categoria e Lista de Metas financeiras[cite: 2]. Inputs para definição de Valor Limite (Orçamento) e Valor Alvo (Meta de curto/longo prazo) com barras visuais de progresso de consumo[cite: 2].

### 3.14 Previsões (`/forecast`)
- **Objetivo:** Análise preditiva matemática do fluxo de caixa[cite: 2].
- **Componentes:** Gráfico de linha preditivo cruzando despesas fixas, parcelamentos e recorrências para projetar o caixa futuro[cite: 2]. Tabela de previsões mensais e botão funcional "Executar Nova Previsão" para forçar recalculo instantâneo[cite: 2].

### 3.15 Configurações (`/settings`)
- **Objetivo:** Painel utilitário de segurança e governança de dados do usuário[cite: 2].
- **Componentes:** Botão "Exportar Dados" (extração completa em formato JSON/CSV), botões de "Fazer Backup" e "Restaurar Backup" via arquivos locais, e o botão crítico "Excluir Conta" que dispara um diálogo de dupla confirmação para deleção definitiva do usuário[cite: 2].

---

## 4. Regras Contábeis Pétreas
1. **Neutralidade de Fluxo:** Transferências entre contas correntes e pagamentos de faturas de cartão de crédito jamais devem inflar os indicadores de Receitas ou Despesas nos gráficos, no Dashboard ou no DRE. São movimentações patrimoniais neutras.
2. **Regra do Meio do Mês:** Despesas em cartões cujo dia do lançamento seja maior que o `closing_day` pertencem automaticamente à fatura do mês subsequente. Caso o `due_day` seja numericamente menor ou igual ao `closing_day`, a regra de estouro de mês de referência ajusta a competência para o período contábil correto de liquidação.