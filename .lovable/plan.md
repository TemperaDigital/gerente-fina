## Plano — Navegação de Categorias + Formulário de Contas dinâmico

### 1. Adicionar `/categories` no menu lateral
**Arquivo:** `src/components/app-shell.tsx`

Incluir o item `Categorias` no array `NAV` (entre `Cartões` e `Parcelas & Dívidas`), usando o ícone `Tags` do `lucide-react`. Isso já cobre tanto a sidebar desktop quanto o drawer mobile, pois ambos iteram sobre o mesmo `NAV`.

```ts
{ to: "/categories", label: "Categorias", icon: Tags },
```

### 2. Tornar o formulário de Contas dinâmico (cash / bank / credit_card)
A tabela `accounts` é unificada e a CHECK constraint exige:
- `credit_card` → `closing_day`, `due_day`, `credit_limit_cents` **obrigatórios**
- `cash` / `bank` → esses campos **proibidos** (NULL)

**Arquivo:** `src/components/accounts/account-form.tsx`
- Substituir a prop `forcedType` por `initialType` + flag opcional `lockType` (para preservar o uso atual em `/credit-cards`, que continua travado em `credit_card`).
- Adicionar um seletor visual (pílulas: 💵 Dinheiro · 🏦 Banco · 💳 Cartão) no topo do form quando `lockType` for falso.
- Renderizar os campos `Limite`, `Fechamento`, `Vencimento` **somente** quando o tipo atual for `credit_card`. Ao alternar para cash/bank, limpar os estados (`limitStr`, `closingDay`, `dueDay`) para garantir payload com `null` e evitar rejeição pela CHECK constraint.
- Ajustar `AccountFormPayload` para incluir `type` quando o tipo é selecionável.
- Validação leve: se `credit_card`, exigir os três campos antes de chamar `onSubmit` (toast inline ou mensagem abaixo do form).

**Arquivo:** `src/routes/accounts.tsx`
- Manter o filtro de listagem em cash/bank (cartões continuam em `/credit-cards`).
- Trocar os dois botões atuais (`Dinheiro` / `Conta bancária`) por **um único botão "Nova Conta"** que abre o dialog com o form em modo dinâmico (`initialType="bank"`, sem `lockType`).
- No `createMut`, propagar o `type` retornado pelo form em vez de fixar.
- Após criar uma conta `credit_card`, redirecionar (`router.navigate({ to: "/credit-cards" })`) ou mostrar toast informando que ela aparecerá em Cartões — para não confundir o usuário que ela "sumiu" da listagem atual.
- Edição (`editing`) continua usando `lockType` (não permitimos converter o tipo de uma conta existente — mudaria a semântica contábil).

**Arquivo:** `src/routes/credit-cards.tsx`
- Atualizar a chamada do `AccountForm` para `initialType="credit_card"` + `lockType`. Sem mudança funcional.

### Princípios respeitados
- UI 100% pt-BR, dark glassmorphism, sem `alert()`/`confirm()`.
- Lógica de validação permanece no form (apresentação) + Zod no server (`createAccount` já valida a CHECK).
- Nenhuma mudança em migrations, serviços ou regras contábeis.
- Tipagem estrita preservada (`tsgo --noEmit` limpo).