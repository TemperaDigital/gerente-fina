/**
 * Server Functions — Dashboard (Gerente Fina).
 *
 * Lê das VIEWs `account_balances` e `monthly_dre` (migration 0004),
 * que já aplicam o expurgo de fluxos neutros (§3 da Constituição) e
 * derivam saldos em tempo real (sem materialização — §3).
 *
 * Camada headless: nenhuma dependência de UI. Retorna DTOs serializáveis
 * com `amount` em string `numeric(14,2)` para preservar precisão decimal.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { addAmounts, toCents, fromCents } from "@/lib/finance/money";
import { computeMonthlyBalance } from "@/lib/finance/cash-basis";
import {
  aggregateExpenseBreakdown,
  type ExpenseBreakdownResult,
  type ExpenseInput,
} from "@/lib/finance/expense-breakdown";

// -----------------------------------------------------------------------------
// Tipos públicos (DTOs)
// -----------------------------------------------------------------------------

export type AccountType = "cash" | "bank" | "credit_card";

export interface AccountBalanceDTO {
  account_id: string;
  account_name: string;
  account_type: AccountType;
  balance: string; // numeric(14,2)
  transactions_count: number;
  last_movement_on: string | null;
  /** Missão 19 — cheque especial (só faz sentido em bank/cash). */
  overdraft_limit_cents: number | null;
  overdraft_since: string | null;
}


export interface DashboardSummaryDTO {
  reference_month: string; // YYYY-MM-01
  consolidated_balance: string; // soma dos saldos de todas as contas
  income: string;
  expense: string;
  net_result: string;
  accounts: AccountBalanceDTO[];
}

// -----------------------------------------------------------------------------
// getDashboardSummary
// -----------------------------------------------------------------------------

const DashboardInput = z
  .object({
    /** Mês de referência no formato `YYYY-MM`. Default: mês corrente. Ignorado se `year` vier preenchido. */
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "month deve ser YYYY-MM")
      .optional(),
    /** Missão 17 — modo "ano inteiro": quando presente, agrega jan-dez do ano inteiro em vez de um mês. */
    year: z.number().int().min(1900).max(3000).optional(),
  })
  .optional();

function resolveReferenceMonth(month: string | undefined): string {
  if (month) return `${month}-01`;
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/**
 * Missão 17 — resolve o intervalo [start, end] tanto pra um mês quanto pra
 * um ano inteiro (jan 1 – dez 31), a partir do mesmo input compartilhado
 * `{ month?, year? }`. `year` tem prioridade sobre `month` quando ambos
 * vierem (não deveria acontecer — o picker do Dashboard só manda um dos
 * dois por vez).
 */
function resolvePeriodBounds(input: {
  month?: string;
  year?: number;
}): { start: string; end: string; referenceMonth: string } {
  if (typeof input.year === "number") {
    const y = input.year;
    return { start: `${y}-01-01`, end: `${y}-12-31`, referenceMonth: `${y}-01-01` };
  }
  const referenceMonth = resolveReferenceMonth(input.month);
  const { start, end } = monthBounds(referenceMonth);
  return { start, end, referenceMonth };
}

// Aritmética monetária centralizada em src/lib/finance/money.ts

export const getDashboardSummary = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => DashboardInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const referenceMonth = resolveReferenceMonth(data?.month);

    const [balancesRes, dreRes] = await Promise.all([
      sb
        .from("account_balances")
        .select(
          "account_id, account_name, account_type, balance, transactions_count, last_movement_on",
        )
        .eq("user_id", userId)
        .order("account_name", { ascending: true }),
      sb
        .from("monthly_dre")
        .select("income, expense, net_result")
        .eq("user_id", userId)
        .eq("reference_month", referenceMonth)
        .maybeSingle(),
    ]);

    if (balancesRes.error) throw new Error(balancesRes.error.message);
    if (dreRes.error) throw new Error(dreRes.error.message);

    const accounts = (balancesRes.data ?? []) as AccountBalanceDTO[];
    const consolidated_balance = accounts.reduce(
      (acc, a) => addAmounts(acc, a.balance ?? "0.00"),
      "0.00",
    );

    const dre = dreRes.data ?? { income: "0.00", expense: "0.00", net_result: "0.00" };

    const summary: DashboardSummaryDTO = {
      reference_month: referenceMonth,
      consolidated_balance,
      income: dre.income ?? "0.00",
      expense: dre.expense ?? "0.00",
      net_result: dre.net_result ?? "0.00",
      accounts,
    };
    return summary;
  });

// -----------------------------------------------------------------------------
// getCashBasisSummary — KPIs do topo do Dashboard em REGIME DE CAIXA (Missão 16,
// card "Saldo do Mês" corrigido em definitivo na correção final)
//
// Diferente de getDashboardSummary (regime de COMPETÊNCIA, via monthly_dre):
// aqui só contamos dinheiro que de fato entrou/saiu de contas bank/cash no
// período. Uma compra no cartão de crédito não sai da conta corrente até o
// pagamento da fatura — por isso ela NÃO entra em "Despesas (caixa)" no mês
// da compra, e o pagamento de fatura (perna débito em bank/cash) SIM entra.
//
// Atenção de nomenclatura: existe uma conta chamada "CAIXA" (Caixa Econômica
// Federal, account.type='bank') — NUNCA inferir bank/cash pelo nome da
// conta, sempre pelo campo account.type real (ver isCashAccount abaixo).
//
// Saldo do Mês = Receitas − Custo Fixo − Custo Variável − Fatura de Cartões
// (paga) − Agendamentos pendentes do período. Todos em regime de caixa,
// restritos a account.type IN ('bank','cash') no período selecionado.
//
// Ficam de fora DESTA fórmula, de propósito:
//  - Parcelas de installment_purchases, de QUALQUER vencimento (presente ou
//    futuro). Parcela de cartão é dívida de CARTÃO — só afeta a conta
//    corrente quando a FATURA é paga, o que já está capturado no componente
//    "Fatura de Cartões (paga)" acima. Contar a parcela aqui duplicaria/
//    anteciparia essa despesa incorretamente.
//  - Qualquer transaction vinculada a account.type='credit_card'.
//  - Recorrências vinculadas a conta credit_card — essas continuam
//    materializando automaticamente (Missão 7), fora desta conta.
//  - Empréstimos/financiamentos/consórcios (`loans`): o schema não vincula
//    `loans` a `transactions` (mesmo achado da Missão 12), então não há como
//    saber com confiança o vencimento de cada parcela neste período —
//    inventar uma aproximação é pior do que documentar a lacuna (`caveats`).
//
// Categorias de despesa com `nature` NULL (legado anterior à migration 0012,
// que não fez backfill retroativo) entram em "Custo Variável" por padrão —
// mesma convenção de default já usada na Missão 11 para categorias novas —
// garantindo que Custo Fixo + Custo Variável + Fatura paga sempre somem
// exatamente "Despesas (caixa)".
// -----------------------------------------------------------------------------

export interface CashBasisSummaryDTO {
  reference_month: string; // YYYY-MM-01
  income_cash: string;
  expense_cash: string;
  net_cash: string;
  fixed_expense_cash: string;
  variable_expense_cash: string;
  invoice_payment_cash: string;
  scheduled_pending_cash: string;
  monthly_balance: string;
  caveats: string[];
}

function monthBounds(referenceMonth: string): { start: string; end: string } {
  const [y, m] = referenceMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: referenceMonth,
    end: `${referenceMonth.slice(0, 8)}${String(lastDay).padStart(2, "0")}`,
  };
}

function isCashAccount(type: AccountType | null | undefined): boolean {
  return type === "bank" || type === "cash";
}

export const getCashBasisSummary = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => DashboardInput.parse(input))
  .handler(async ({ data }): Promise<CashBasisSummaryDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { start, end, referenceMonth } = resolvePeriodBounds(data ?? {});

    // ---- Receitas / Custo Fixo / Custo Variável / Fatura paga --------------
    const { data: txRows, error: txErr } = await sb
      .from("transactions")
      .select("kind, type, amount, accounts:account_id ( type ), categories:category_id ( nature )")
      .eq("user_id", userId)
      .in("kind", ["income", "expense", "invoice_payment"])
      .gte("occurred_on", start)
      .lte("occurred_on", end);
    if (txErr) throw new Error(txErr.message);

    let incomeCents = 0n;
    let fixedExpenseCents = 0n;
    let variableExpenseCents = 0n;
    let invoicePaymentCents = 0n;

    for (const r of (txRows ?? []) as unknown as Array<{
      kind: "income" | "expense" | "invoice_payment";
      type: "debit" | "credit";
      amount: string;
      accounts?: { type?: AccountType } | null;
      categories?: { nature?: "FIXA" | "VARIÁVEL" | null } | null;
    }>) {
      const accType = r.accounts?.type;
      if (!isCashAccount(accType)) continue; // credit_card nunca entra nesta conta

      if (r.kind === "income") {
        incomeCents += toCents(r.amount);
      } else if (r.kind === "expense") {
        const cents = toCents(r.amount);
        if (r.categories?.nature === "FIXA") fixedExpenseCents += cents;
        else variableExpenseCents += cents; // VARIÁVEL ou nature nula (default)
      } else if (r.kind === "invoice_payment" && r.type === "debit") {
        // Perna débito do pagamento de fatura — dinheiro saindo de bank/cash
        // de verdade (a perna crédito, no cartão, não conta — não é "caixa").
        invoicePaymentCents += toCents(r.amount);
      }
    }

    const expenseCents = fixedExpenseCents + variableExpenseCents + invoicePaymentCents;

    // ---- Agendamentos pendentes do período (só bank/cash, só despesa —
    // recorrências de receita não entram: a fórmula só SUBTRAI compromissos.
    // Contas credit_card são auto-materializadas pelo motor da Missão 7 e não
    // entram aqui.) ------------------------------------------------------
    const { data: recRows, error: recErr } = await sb
      .from("recurrences")
      .select("amount, accounts:account_id ( type )")
      .eq("user_id", userId)
      .eq("active", true)
      .eq("kind", "expense")
      .gte("next_run_on", start)
      .lte("next_run_on", end);
    if (recErr) throw new Error(recErr.message);

    let scheduledCents = 0n;
    for (const r of (recRows ?? []) as unknown as Array<{
      amount: string;
      accounts?: { type?: AccountType } | null;
    }>) {
      if (isCashAccount(r.accounts?.type)) scheduledCents += toCents(r.amount);
    }

    const monthlyBalanceCents = computeMonthlyBalance({
      incomeCents,
      fixedExpenseCents,
      variableExpenseCents,
      invoicePaymentCents,
      scheduledPendingCents: scheduledCents,
    });

    return {
      reference_month: referenceMonth,
      income_cash: fromCents(incomeCents),
      expense_cash: fromCents(expenseCents),
      net_cash: fromCents(incomeCents - expenseCents),
      fixed_expense_cash: fromCents(fixedExpenseCents),
      variable_expense_cash: fromCents(variableExpenseCents),
      invoice_payment_cash: fromCents(invoicePaymentCents),
      scheduled_pending_cash: fromCents(scheduledCents),
      monthly_balance: fromCents(monthlyBalanceCents),
      caveats: [
        "Não inclui parcelas de empréstimos, financiamentos ou consórcios (loans): o schema atual não vincula loans a transactions, então não é possível determinar com confiança o vencimento de cada parcela neste período.",
        'Parcelas de cartão (installment_purchases) não entram nesta conta em nenhuma hipótese — seu impacto na conta corrente só acontece quando a fatura é paga, já capturado em "Fatura de Cartões (paga)".',
        ...(typeof data?.year === "number"
          ? ["Modo ano inteiro: os valores somam janeiro a dezembro do ano selecionado."]
          : []),
      ],
    };
  });

// -----------------------------------------------------------------------------
// getMonthlyDreHistory — últimos N meses para o gráfico de barras do Dashboard
// -----------------------------------------------------------------------------

export interface MonthlyDreDTO {
  reference_month: string; // YYYY-MM-DD (primeiro dia do mês)
  label: string; // "Jan/25", "Fev/25", etc.
  income: number;
  expense: number;
  net_result: number;
}

export const getMonthlyDreHistory = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const raw = input as { months?: number } | undefined;
    return { months: typeof raw?.months === "number" ? raw.months : 6 };
  })
  .handler(async ({ data }): Promise<MonthlyDreDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    // Pega os últimos N meses em ordem cronológica
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - (data.months - 1));
    since.setUTCDate(1);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data: rows, error } = await sb
      .from("monthly_dre")
      .select("reference_month, income, expense, net_result")
      .eq("user_id", userId)
      .gte("reference_month", sinceStr)
      .order("reference_month", { ascending: true });

    if (error) throw new Error(error.message);

    // Preenche meses sem movimento com zeros para a linha do gráfico ficar contínua
    const result: MonthlyDreDTO[] = [];
    for (let i = 0; i < data.months; i++) {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - (data.months - 1 - i));
      d.setUTCDate(1);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const match = (rows ?? []).find((r) => r.reference_month === key);
      result.push({
        reference_month: key,
        label: d
          .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
          .replace(".", "")
          .replace(" de ", "/"),
        income: Number(match?.income ?? 0),
        expense: Number(match?.expense ?? 0),
        net_result: Number(match?.net_result ?? 0),
      });
    }
    return result;
  });

export interface OpenInvoiceDTO {
  invoice_id: string;
  account_id: string;
  account_name: string;
  reference_month: string; // YYYY-MM-01
  closing_date: string; // YYYY-MM-DD
  due_date: string; // YYYY-MM-DD
  total_amount: string; // numeric(14,2)
  /** True quando a data atual já passou do closing_date → atenção. */
  past_closing: boolean;
}

export const getOpenCreditCardInvoices = createServerFn({ method: "GET" }).handler(async () => {
  const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
  const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
  const sb = getSupabaseAdmin();
  const userId = await resolveActiveUserId();

  const { data, error } = await sb
    .from("credit_card_invoices")
    .select(
      `id, account_id, reference_month, closing_date, due_date,
         accounts:account_id ( name )`,
    )
    .eq("user_id", userId)
    .eq("status", "open")
    .order("due_date", { ascending: true });

  if (error) throw new Error(error.message);

  const invoiceIds = (data ?? []).map((r) => (r as { id: string }).id);
  // Total real: soma de despesas atreladas à fatura menos pagamentos (perna credit).
  const totals = new Map<string, number>();
  if (invoiceIds.length > 0) {
    const { data: expenseRows } = await sb
      .from("transactions")
      .select("invoice_id, amount")
      .in("invoice_id", invoiceIds)
      .eq("user_id", userId)
      .eq("kind", "expense");
    for (const r of (expenseRows ?? []) as Array<{ invoice_id: string; amount: string }>) {
      totals.set(r.invoice_id, (totals.get(r.invoice_id) ?? 0) + Number(r.amount));
    }
    const { data: paymentRows } = await sb
      .from("transactions")
      .select("paid_invoice_id, amount, type")
      .in("paid_invoice_id", invoiceIds)
      .eq("user_id", userId)
      .eq("kind", "invoice_payment")
      .eq("type", "credit");
    for (const r of (paymentRows ?? []) as Array<{
      paid_invoice_id: string;
      amount: string;
    }>) {
      totals.set(r.paid_invoice_id, (totals.get(r.paid_invoice_id) ?? 0) - Number(r.amount));
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const items: OpenInvoiceDTO[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown> & {
      accounts?: { name?: string | null } | null;
    };
    const id = row.id as string;
    const closing_date = row.closing_date as string;
    const total = Math.max(0, totals.get(id) ?? 0);
    return {
      invoice_id: id,
      account_id: row.account_id as string,
      account_name: row.accounts?.name ?? "Cartão",
      reference_month: row.reference_month as string,
      closing_date,
      due_date: row.due_date as string,
      total_amount: total.toFixed(2),
      past_closing: today > closing_date,
    };
  });
  return items;
});

// -----------------------------------------------------------------------------
// getCategoryBreakdown — donut "para onde foi meu dinheiro" no Dashboard
// Consome a view monthly_dre_by_category + enriquece com icon/color da categoria
// -----------------------------------------------------------------------------

export interface CategoryBreakdownDTO {
  category_id: string;
  category_name: string;
  total_amount: number;
  transactions_count: number;
  icon: string | null;
  color: string | null;
}

export const getCategoryBreakdown = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const raw = input as
      | { month?: string; year?: number; kind?: "income" | "expense" }
      | undefined;
    const year = typeof raw?.year === "number" ? raw.year : undefined;
    return {
      month:
        typeof raw?.month === "string" && /^\d{4}-\d{2}$/.test(raw.month)
          ? raw.month
          : new Date().toISOString().slice(0, 7),
      year,
      kind: raw?.kind === "income" ? ("income" as const) : ("expense" as const),
    };
  })
  .handler(async ({ data }): Promise<CategoryBreakdownDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    let query = sb
      .from("monthly_dre_by_category")
      .select("category_id, category_name, total_amount, transactions_count")
      .eq("user_id", userId)
      .eq("kind", data.kind);

    // Missão 17 — modo "ano inteiro": monthly_dre_by_category tem 1 linha por
    // (categoria, mês) — em vez de `.eq` num único reference_month, pega o
    // ano inteiro (jan-dez) e agrega por categoria abaixo.
    query =
      typeof data.year === "number"
        ? query.gte("reference_month", `${data.year}-01-01`).lte("reference_month", `${data.year}-12-01`)
        : query.eq("reference_month", `${data.month}-01`);

    const { data: rawRows, error } = await query.order("total_amount", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rawRows?.length) return [];

    const rows =
      typeof data.year === "number"
        ? Array.from(
            rawRows
              .reduce((acc, r) => {
                const prev = acc.get(r.category_id);
                if (prev) {
                  prev.total_amount = String(Number(prev.total_amount) + Number(r.total_amount));
                  prev.transactions_count += r.transactions_count;
                } else {
                  acc.set(r.category_id, { ...r });
                }
                return acc;
              }, new Map<string, (typeof rawRows)[number]>())
              .values(),
          ).sort((a, b) => Number(b.total_amount) - Number(a.total_amount))
        : rawRows;

    // Enriquece com icon/color das categorias (uma query em lote)
    const catIds = rows.map((r) => r.category_id);
    const { data: cats } = await sb
      .from("categories")
      .select("id, icon, color")
      .eq("user_id", userId)
      .in("id", catIds);

    const catMap = new Map((cats ?? []).map((c) => [c.id, c]));

    return rows.map((r) => ({
      category_id: r.category_id,
      category_name: r.category_name,
      total_amount: Number(r.total_amount),
      transactions_count: Number(r.transactions_count),
      icon: catMap.get(r.category_id)?.icon ?? null,
      color: catMap.get(r.category_id)?.color ?? null,
    }));
  });

// -----------------------------------------------------------------------------
// getExpenseBreakdown — detalhamento do KPI "Despesas (caixa)" para o modal
// clicável do card Despesas no Dashboard.
//
// Reaproveita EXATAMENTE os mesmos filtros de getCashBasisSummary (Missão 16):
// só linhas do período em contas bank/cash, categoria nula tratada como
// VARIÁVEL, apenas a perna débito de invoice_payment conta. O cálculo em si
// vive na função pura `aggregateExpenseBreakdown` (testável sem Supabase),
// garantindo por construção que:
//   sum(invoice_payments) + sum(fixed) + sum(variable) === totals.total
//   === expense_cash de getCashBasisSummary
// -----------------------------------------------------------------------------

export interface ExpenseBreakdownDTO extends ExpenseBreakdownResult {
  reference_month: string; // YYYY-MM-01
}

export const getExpenseBreakdown = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => DashboardInput.parse(input))
  .handler(async ({ data }): Promise<ExpenseBreakdownDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { start, end, referenceMonth } = resolvePeriodBounds(data ?? {});

    const { data: txRows, error: txErr } = await sb
      .from("transactions")
      .select(
        `kind, type, amount, paid_invoice_id,
         accounts:account_id ( type ),
         categories:category_id ( id, name, nature, icon, color ),
         paid_invoice:paid_invoice_id ( account_id, accounts:account_id ( name ) )`,
      )
      .eq("user_id", userId)
      .in("kind", ["expense", "invoice_payment"])
      .gte("occurred_on", start)
      .lte("occurred_on", end);

    if (txErr) throw new Error(txErr.message);

    const inputs: ExpenseInput[] = [];
    for (const r of (txRows ?? []) as unknown as Array<{
      kind: "expense" | "invoice_payment";
      type: "debit" | "credit";
      amount: string;
      paid_invoice_id: string | null;
      accounts?: { type?: AccountType } | null;
      categories?: {
        id?: string | null;
        name?: string | null;
        nature?: "FIXA" | "VARIÁVEL" | null;
        icon?: string | null;
        color?: string | null;
      } | null;
      paid_invoice?: {
        account_id?: string | null;
        accounts?: { name?: string | null } | null;
      } | null;
    }>) {
      const account_type = r.accounts?.type ?? null;
      if (r.kind === "expense") {
        inputs.push({
          kind: "expense",
          amount: r.amount,
          account_type,
          category_id: r.categories?.id ?? null,
          category_name: r.categories?.name ?? null,
          category_nature: r.categories?.nature ?? null,
          icon: r.categories?.icon ?? null,
          color: r.categories?.color ?? null,
        });
      } else {
        inputs.push({
          kind: "invoice_payment",
          type: r.type,
          amount: r.amount,
          account_type,
          invoice_account_id: r.paid_invoice?.account_id ?? null,
          invoice_account_name: r.paid_invoice?.accounts?.name ?? null,
        });
      }
    }

    const result = aggregateExpenseBreakdown(inputs);
    return { reference_month: referenceMonth, ...result };
  });

