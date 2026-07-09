/**
 * Server Functions — Transactions (Livro-Caixa + mutações).
 *
 * Listagem NÃO aplica expurgo (livro-caixa mostra tudo). Mutações de criação
 * cobrem os 4 fluxos do PRD: income, expense, transfer (2 pernas) e
 * invoice_payment. Recorrência e parcelamento são gerados aqui também.
 *
 * Sistema monousuário: como a app ainda não tem fluxo de auth no client,
 * resolvemos o `user_id` a partir do primeiro usuário em `auth.users` via
 * service_role (cacheado). Quando a auth real for plugada, basta trocar
 * `resolveUserId()` por leitura do contexto do middleware.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeInvoiceDueDate } from "@/lib/finance/invoice-due";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------
export type TransactionKind = "income" | "expense" | "transfer" | "invoice_payment";
export type TransactionType = "debit" | "credit";

export interface TransactionListItemDTO {
  id: string;
  account_id: string;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  kind: TransactionKind;
  type: TransactionType;
  amount: string;
  description: string | null;
  occurred_on: string;
  transfer_id: string | null;
  invoice_id: string | null;
  paid_invoice_id: string | null;
  recurrence_id: string | null;
  source: string | null;
  /** Conta-irmã (destino) de uma transferência, quando aplicável. */
  transfer_counterpart_name?: string | null;
  /** Progresso de parcelas (ex.: "3/12") quando vinculado a installment_items. */
  installment_progress?: string | null;
  /** Natureza da categoria (Fixa/Variável) — migration 0012. */
  category_nature: "FIXA" | "VARIÁVEL" | null;
  /** Mês de referência (YYYY-MM-01) da fatura de cartão a que esta despesa foi anexada, se houver. */
  invoice_reference_month: string | null;
  created_at: string;
}

export interface TransactionsListDTO {
  items: TransactionListItemDTO[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}.*/i, "")
    .trim();
}

// ---------------------------------------------------------------------------
// getTransactionsList
// ---------------------------------------------------------------------------
const ListInput = z.object({
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(200).default(50),
  account_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  kind: z.enum(["income", "expense", "transfer", "invoice_payment"]).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Mês YYYY-MM — atalho que sobrescreve from/to se fornecido. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

type TxRow = {
  id: string;
  account_id: string;
  category_id: string | null;
  kind: TransactionKind;
  type: TransactionType;
  amount: string;
  description: string | null;
  occurred_on: string;
  transfer_id: string | null;
  invoice_id: string | null;
  paid_invoice_id: string | null;
  recurrence_id: string | null;
  source: string | null;
  created_at: string;
  accounts?: { name?: string | null } | null;
  categories?: { name?: string | null; nature?: "FIXA" | "VARIÁVEL" | null } | null;
};

/**
 * Enriquece linhas cruas de `transactions` com nome da conta-irmã de
 * transferência e progresso de parcela — usado tanto pela listagem paginada
 * quanto pela exportação (sem paginação), evitando duplicar as 2 queries
 * extras em ambos os lugares.
 */
async function enrichTransactionRows(
  sb: import("@supabase/supabase-js").SupabaseClient,
  baseRows: TxRow[],
  userId: string,
): Promise<TransactionListItemDTO[]> {
  const transferIds = Array.from(
    new Set(baseRows.filter((r) => r.transfer_id).map((r) => r.transfer_id!)),
  );
  const counterpartByTransfer = new Map<string, Map<string, string>>();
  if (transferIds.length > 0) {
    // Blindagem (Missão 30): sem `.eq("user_id", userId)` aqui, uma colisão
    // de transfer_id com outro usuário (ex: via um backup restaurado antes
    // da checagem em backup.functions.ts) vazaria o nome da conta alheia
    // nesta listagem — mesmo padrão de escopo já usado em getTransactionById
    // (linha ~1123-1128) pra essa exata busca de contraparte.
    const { data: legs } = await sb
      .from("transactions")
      .select("id, transfer_id, account_id, accounts:account_id ( name )")
      .in("transfer_id", transferIds)
      .eq("user_id", userId);
    for (const l of (legs ?? []) as unknown as Array<{
      id: string;
      transfer_id: string;
      account_id: string;
      accounts?: { name?: string | null } | null;
    }>) {
      if (!counterpartByTransfer.has(l.transfer_id)) {
        counterpartByTransfer.set(l.transfer_id, new Map());
      }
      counterpartByTransfer.get(l.transfer_id)!.set(l.id, l.accounts?.name ?? "");
    }
  }

  const txIds = baseRows.map((r) => r.id);
  const installmentByTx = new Map<string, string>();
  if (txIds.length > 0) {
    const { data: items } = await sb
      .from("installment_items")
      .select(
        "transaction_id, installment_number, purchase_id, installment_purchases:purchase_id ( installments_count )",
      )
      .in("transaction_id", txIds);
    for (const it of (items ?? []) as unknown as Array<{
      transaction_id: string | null;
      installment_number: number;
      installment_purchases?: { installments_count?: number } | null;
    }>) {
      if (!it.transaction_id) continue;
      const total = it.installment_purchases?.installments_count ?? 0;
      installmentByTx.set(it.transaction_id, `${it.installment_number}/${total}`);
    }
  }

  // Mês de referência da fatura (para a coluna "Fatura" em despesas de cartão).
  const invoiceIds = Array.from(
    new Set(baseRows.filter((r) => r.invoice_id).map((r) => r.invoice_id!)),
  );
  const referenceMonthByInvoice = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const { data: invoices } = await sb
      .from("credit_card_invoices")
      .select("id, reference_month")
      .in("id", invoiceIds);
    for (const inv of (invoices ?? []) as Array<{ id: string; reference_month: string }>) {
      referenceMonthByInvoice.set(inv.id, inv.reference_month);
    }
  }

  return baseRows.map((row) => {
    let counterpart: string | null = null;
    if (row.transfer_id) {
      const map = counterpartByTransfer.get(row.transfer_id);
      if (map) {
        for (const [id, name] of map) {
          if (id !== row.id) {
            counterpart = name;
            break;
          }
        }
      }
    }
    return {
      id: row.id,
      account_id: row.account_id,
      account_name: row.accounts?.name ?? null,
      category_id: row.category_id,
      category_name: row.categories?.name ?? null,
      kind: row.kind,
      type: row.type,
      amount: row.amount,
      description: sanitizeDescription(row.description) || null,
      occurred_on: row.occurred_on,
      transfer_id: row.transfer_id,
      invoice_id: row.invoice_id,
      paid_invoice_id: row.paid_invoice_id,
      recurrence_id: row.recurrence_id,
      source: row.source,
      transfer_counterpart_name: counterpart,
      installment_progress: installmentByTx.get(row.id) ?? null,
      category_nature: row.categories?.nature ?? null,
      invoice_reference_month: row.invoice_id
        ? (referenceMonthByInvoice.get(row.invoice_id) ?? null)
        : null,
      created_at: row.created_at,
    };
  });
}

export const getTransactionsList = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ListInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<TransactionsListDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    let from = data.from;
    let to = data.to;
    if (data.month) {
      const [y, m] = data.month.split("-").map(Number);
      const first = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      from = first;
      to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    const rangeFrom = (data.page - 1) * data.page_size;
    const rangeTo = rangeFrom + data.page_size - 1;

    let query = sb
      .from("transactions")
      .select(
        `id, account_id, category_id, kind, type, amount, description,
         occurred_on, transfer_id, invoice_id, paid_invoice_id,
         recurrence_id, source, created_at,
         accounts:account_id ( name ),
         categories:category_id ( name, nature )`,
        { count: "exact" },
      )
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    if (data.account_id) query = query.eq("account_id", data.account_id);
    if (data.category_id) query = query.eq("category_id", data.category_id);
    if (data.kind) query = query.eq("kind", data.kind);
    if (from) query = query.gte("occurred_on", from);
    if (to) query = query.lte("occurred_on", to);
    if (data.search) query = query.ilike("description", `%${data.search}%`);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    const items = await enrichTransactionRows(sb, (rows ?? []) as unknown as TxRow[], userId);

    return {
      items,
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

// ---------------------------------------------------------------------------
// getTransactionsForExport — Exportar/Imprimir (Missão 10): TODAS as linhas
// que baterem com o filtro escolhido no diálogo, sem paginação. Filtros são
// independentes dos já aplicados na tela de Livro-Caixa.
// ---------------------------------------------------------------------------
const ExportInput = z
  .object({
    period_mode: z.enum(["all", "month", "range"]).default("all"),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** "Tipo de Conta" — não confundir com o filtro de conta ESPECÍFICA da tela normal. */
    account_type: z.enum(["credit_card", "account", "all"]).default("all"),
  })
  .superRefine((v, ctx) => {
    if (v.period_mode === "month" && !v.month) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o mês para o período 'Mês específico'.",
        path: ["month"],
      });
    }
    if (v.period_mode === "range" && (!v.from || !v.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe início e fim para o período 'Intervalo de datas'.",
        path: ["from"],
      });
    }
  });

/** Limite prático de segurança — sistema monousuário, não há paginação real de UI para exportação. */
const EXPORT_ROW_LIMIT = 50_000;

export const getTransactionsForExport = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ExportInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<TransactionListItemDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    let from: string | undefined;
    let to: string | undefined;
    if (data.period_mode === "month" && data.month) {
      const [y, m] = data.month.split("-").map(Number);
      from = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    } else if (data.period_mode === "range") {
      from = data.from;
      to = data.to;
    }

    let accountIds: string[] | null = null;
    if (data.account_type !== "all") {
      const typesFilter = data.account_type === "credit_card" ? ["credit_card"] : ["bank", "cash"];
      const { data: accs, error: accErr } = await sb
        .from("accounts")
        .select("id")
        .eq("user_id", userId)
        .in("type", typesFilter);
      if (accErr) throw new Error(accErr.message);
      accountIds = (accs ?? []).map((a) => a.id as string);
      if (accountIds.length === 0) return [];
    }

    let query = sb
      .from("transactions")
      .select(
        `id, account_id, category_id, kind, type, amount, description,
         occurred_on, transfer_id, invoice_id, paid_invoice_id,
         recurrence_id, source, created_at,
         accounts:account_id ( name ),
         categories:category_id ( name, nature )`,
      )
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, EXPORT_ROW_LIMIT - 1);

    if (accountIds) query = query.in("account_id", accountIds);
    if (from) query = query.gte("occurred_on", from);
    if (to) query = query.lte("occurred_on", to);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return enrichTransactionRows(sb, (rows ?? []) as unknown as TxRow[], userId);
  });

// ---------------------------------------------------------------------------
// getReviewQueue — fila de conciliação (suspeitos por hash duplicado)
// ---------------------------------------------------------------------------
export interface ReviewGroupDTO {
  dedup_hash: string;
  items: TransactionListItemDTO[];
}

export const getReviewQueue = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReviewGroupDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    // O UNIQUE parcial em (user_id, dedup_hash) impede DOIS hashes iguais via
    // INSERT direto. A fila de conciliação real é alimentada por importações
    // que ENCONTRAM colisão e gravam o conflito em uma tabela auxiliar
    // (próxima migration). Por ora, retornamos transações marcadas como
    // 'import'/'pluggy' que compartilham descrição + amount + occurred_on
    // dentro do mesmo dia — heurística leve para o caso atual em que ainda
    // não há volume de importação. Quando a tabela `dedup_conflicts` for
    // criada (migration futura), esta função lerá dela.
    const { data, error } = await sb
      .from("transactions")
      .select(
        `id, account_id, category_id, kind, type, amount, description,
         occurred_on, transfer_id, invoice_id, paid_invoice_id, recurrence_id,
         source, dedup_hash, created_at,
         accounts:account_id ( name ),
         categories:category_id ( name )`,
      )
      .eq("user_id", userId)
      .not("dedup_hash", "is", null)
      .in("source", ["import", "pluggy"])
      .order("dedup_hash", { ascending: true })
      .limit(500);

    if (error) throw new Error(error.message);

    const groups = new Map<string, TransactionListItemDTO[]>();
    for (const r of (data ?? []) as unknown as Array<
      {
        id: string;
        dedup_hash: string;
        [k: string]: unknown;
      } & {
        accounts?: { name?: string | null } | null;
        categories?: { name?: string | null } | null;
      }
    >) {
      const item: TransactionListItemDTO = {
        id: r.id,
        account_id: r.account_id as string,
        account_name: r.accounts?.name ?? null,
        category_id: (r.category_id as string | null) ?? null,
        category_name: r.categories?.name ?? null,
        kind: r.kind as TransactionKind,
        type: r.type as TransactionType,
        amount: r.amount as string,
        description: sanitizeDescription(r.description as string) || null,
        occurred_on: r.occurred_on as string,
        transfer_id: (r.transfer_id as string | null) ?? null,
        invoice_id: (r.invoice_id as string | null) ?? null,
        paid_invoice_id: (r.paid_invoice_id as string | null) ?? null,
        recurrence_id: (r.recurrence_id as string | null) ?? null,
        source: (r.source as string | null) ?? null,
        // Fila de conciliação é uma heurística leve para duplicatas — não
        // busca nature/fatura, foco é só decidir manter vs. mesclar.
        category_nature: null,
        invoice_reference_month: null,
        created_at: r.created_at as string,
      };
      const list = groups.get(r.dedup_hash) ?? [];
      list.push(item);
      groups.set(r.dedup_hash, list);
    }
    return Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([dedup_hash, items]) => ({ dedup_hash, items }));
  },
);

// ---------------------------------------------------------------------------
// createTransactionEntry — formulário /transactions/new
// ---------------------------------------------------------------------------
const RecurrenceInput = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval_count: z.number().int().min(1).max(60).default(1),
  end_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const InstallmentInput = z.object({
  count: z.number().int().min(2).max(360),
});

const CreateInput = z
  .object({
    kind: z.enum(["income", "expense", "transfer", "invoice_payment"]),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount inválido (ex.: 1234.56)"),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().min(1).max(240),
    notes: z.string().max(2000).optional(),

    account_id: z.string().uuid(),
    category_id: z.string().uuid().optional(),

    // Transferência
    counterpart_account_id: z.string().uuid().optional(),

    // Pagamento de fatura
    paid_invoice_id: z.string().uuid().optional(),
    idempotency_key: z.string().optional(),

    // Modificadores opcionais (income/expense)
    installment: InstallmentInput.optional(),
    recurrence: RecurrenceInput.optional(),
    /**
     * Vincula o lançamento a uma recorrência JÁ EXISTENTE (Missão 7 —
     * confirmação de "Contas a Vencer"), em vez de criar uma nova definição
     * como `recurrence` faz. Mutuamente exclusivo com `recurrence`.
     */
    link_recurrence_id: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.kind === "income" || v.kind === "expense") && !v.category_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Categoria é obrigatória para receitas e despesas.",
        path: ["category_id"],
      });
    }
    if (v.kind === "transfer" && !v.counterpart_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione a conta de destino da transferência.",
        path: ["counterpart_account_id"],
      });
    }
    if (v.kind === "transfer" && v.counterpart_account_id === v.account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Conta de destino deve ser diferente da origem.",
        path: ["counterpart_account_id"],
      });
    }
    if (v.kind === "invoice_payment" && !v.paid_invoice_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione a fatura a ser paga.",
        path: ["paid_invoice_id"],
      });
    }
    if (v.installment && v.kind !== "expense") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Parcelamento só é suportado em despesas (cartão).",
        path: ["installment"],
      });
    }
    if (v.recurrence && v.kind !== "income" && v.kind !== "expense") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recorrência só vale para receitas e despesas.",
        path: ["recurrence"],
      });
    }
    if (v.link_recurrence_id && v.recurrence) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Não é possível criar uma nova recorrência e vincular a uma existente ao mesmo tempo.",
        path: ["link_recurrence_id"],
      });
    }
    if (v.link_recurrence_id && v.kind !== "income" && v.kind !== "expense") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vínculo com recorrência só vale para receitas e despesas.",
        path: ["link_recurrence_id"],
      });
    }
  });

export interface CreateTransactionResultDTO {
  created_count: number;
  transfer_id?: string;
  recurrence_id?: string;
  installment_purchase_id?: string;
  invoice_id?: string;
  outstanding?: number;
  invoice_status?: string;
  was_duplicate?: boolean;
  warnings: string[];
}

function nextRunOn(start: string, freq: string, interval: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (freq === "daily") dt.setDate(dt.getDate() + interval);
  else if (freq === "weekly") dt.setDate(dt.getDate() + 7 * interval);
  else if (freq === "monthly") dt.setMonth(dt.getMonth() + interval);
  else if (freq === "yearly") dt.setFullYear(dt.getFullYear() + interval);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export const createTransactionEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data }): Promise<CreateTransactionResultDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { accountBelongsToUser } = await import("@/lib/finance/active-account.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const warnings: string[] = [];

    // Blindagem: TODO id vindo do cliente (conta, contraparte, categoria,
    // recorrência, fatura) precisa pertencer ao usuário ativo — sem isso um
    // request malicioso grava lançamento seu com FK apontando pra dado de
    // outro usuário, corrompendo o saldo da CONTA ALHEIA (account_balances
    // agrega só por account_id, sem checar dono da transação).
    const accountOk = await accountBelongsToUser(sb, userId, data.account_id);
    if (!accountOk) throw new Error("Conta não pertence ao usuário ou foi arquivada.");

    if (data.counterpart_account_id) {
      const counterpartOk = await accountBelongsToUser(sb, userId, data.counterpart_account_id);
      if (!counterpartOk) {
        throw new Error("Conta de destino não pertence ao usuário ou foi arquivada.");
      }
    }

    if (data.category_id) {
      const { data: cat, error: catErr } = await sb
        .from("categories")
        .select("id")
        .eq("id", data.category_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (catErr) throw new Error(catErr.message);
      if (!cat) throw new Error("Categoria não pertence ao usuário.");
    }

    if (data.link_recurrence_id) {
      const { data: rec, error: recErr } = await sb
        .from("recurrences")
        .select("id")
        .eq("id", data.link_recurrence_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (recErr) throw new Error(recErr.message);
      if (!rec) throw new Error("Recorrência não pertence ao usuário.");
    }

    if (data.paid_invoice_id) {
      const { data: inv, error: invErr } = await sb
        .from("credit_card_invoices")
        .select("id")
        .eq("id", data.paid_invoice_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (invErr) throw new Error(invErr.message);
      if (!inv) throw new Error("Fatura não encontrada ou não pertence ao usuário.");
    }

    // -------- TRANSFER (2 pernas vinculadas por transfer_id) ---------------
    if (data.kind === "transfer") {
      const transfer_id = crypto.randomUUID();
      const legs = [
        {
          user_id: userId,
          account_id: data.account_id,
          kind: "transfer" as const,
          type: "debit" as const,
          amount: data.amount,
          occurred_on: data.occurred_on,
          description: data.description,
          notes: data.notes ?? null,
          transfer_id,
          source: "manual",
        },
        {
          user_id: userId,
          account_id: data.counterpart_account_id!,
          kind: "transfer" as const,
          type: "credit" as const,
          amount: data.amount,
          occurred_on: data.occurred_on,
          description: data.description,
          notes: data.notes ?? null,
          transfer_id,
          source: "manual",
        },
      ];
      const { error } = await sb.from("transactions").insert(legs);
      if (error) throw new Error(error.message);
      return { created_count: 2, transfer_id, warnings };
    }

    // -------- INVOICE PAYMENT (RPC atômica pay_credit_card_invoice) --------
    // As duas pernas (débito na origem + crédito no cartão) e o recálculo do
    // saldo devedor da fatura acontecem DENTRO da função de banco, em uma
    // única transação — com proteção nativa contra pagamento duplicado via
    // idempotency_key (migration 0011).
    if (data.kind === "invoice_payment") {
      const idempotencyKey = data.idempotency_key ?? crypto.randomUUID();

      const { data: rpcResult, error: rpcError } = await sb.rpc("pay_credit_card_invoice", {
        _paid_invoice_id: data.paid_invoice_id!,
        _source_account_id: data.account_id,
        _amount: data.amount,
        _occurred_on: data.occurred_on,
        _description: data.description,
        _notes: data.notes ?? null,
        _idempotency_key: idempotencyKey,
      });

      if (rpcError) {
        // Mensagens de negócio (fatura não encontrada, conta = cartão) vêm com
        // errcode P0001 e chegam aqui como texto legível — repasse direto.
        throw new Error(rpcError.message);
      }

      const result = rpcResult?.[0];
      if (!result) throw new Error("Falha ao processar pagamento da fatura.");

      return {
        created_count: result.was_duplicate ? 0 : 2,
        invoice_id: data.paid_invoice_id,
        outstanding: result.outstanding,
        invoice_status: result.invoice_status,
        was_duplicate: result.was_duplicate,
        warnings,
      };
    }

    // -------- INCOME / EXPENSE --------------------------------------------
    const type: TransactionType = data.kind === "income" ? "credit" : "debit";
    const basePayload = {
      user_id: userId,
      account_id: data.account_id,
      category_id: data.category_id!,
      kind: data.kind,
      type,
      description: data.description,
      notes: data.notes ?? null,
      source: "manual" as const,
    };

    // -------- PARCELAMENTO (despesa em cartão) ----------------------------
    if (data.installment) {
      const { data: acc, error: accErr } = await sb
        .from("accounts")
        .select("type, closing_day, due_day")
        .eq("id", data.account_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (accErr) throw new Error(accErr.message);
      if (!acc || acc.type !== "credit_card") {
        throw new Error("Parcelamento exige uma conta do tipo cartão de crédito.");
      }

      const totalCents = Math.round(Number(data.amount) * 100);
      const n = data.installment.count;
      const baseCents = Math.floor(totalCents / n);
      const remainder = totalCents - baseCents * n;

      // Cabeçalho da compra
      const { data: purchase, error: pErr } = await sb
        .from("installment_purchases")
        .insert({
          user_id: userId,
          account_id: data.account_id,
          category_id: data.category_id!,
          description: data.description,
          total_amount: data.amount,
          installments_count: n,
          purchased_on: data.occurred_on,
        })
        .select("id")
        .single();
      if (pErr) throw new Error(pErr.message);

      // Gera N transações + N items
      const [py, pm, pd] = data.occurred_on.split("-").map(Number);
      const purchaseDate = new Date(py, pm - 1, pd);

      for (let i = 1; i <= n; i++) {
        const installmentDate = new Date(purchaseDate);
        installmentDate.setMonth(installmentDate.getMonth() + (i - 1));
        const due = computeInvoiceDueDate({
          purchaseDate: installmentDate,
          closingDay: acc.closing_day!,
          dueDay: acc.due_day!,
        });
        const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
        const occurredStr = `${installmentDate.getFullYear()}-${String(installmentDate.getMonth() + 1).padStart(2, "0")}-${String(installmentDate.getDate()).padStart(2, "0")}`;
        const cents = baseCents + (i === n ? remainder : 0);
        const amountStr = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

        const { data: tx, error: tErr } = await sb
          .from("transactions")
          .insert({
            ...basePayload,
            amount: amountStr,
            occurred_on: occurredStr,
            description: `${data.description} (${i}/${n})`,
          })
          .select("id")
          .single();
        if (tErr) throw new Error(tErr.message);

        const { error: iErr } = await sb.from("installment_items").insert({
          user_id: userId,
          purchase_id: purchase.id,
          transaction_id: tx.id,
          installment_number: i,
          amount: amountStr,
          due_date: dueStr,
        });
        if (iErr) warnings.push(`Parcela ${i}: ${iErr.message}`);
      }

      return {
        created_count: n,
        installment_purchase_id: purchase.id,
        warnings,
      };
    }

    // -------- RECORRÊNCIA (cria apenas a definição + lançamento atual) ----
    if (data.recurrence) {
      const r = data.recurrence;
      const [y, m, d] = data.occurred_on.split("-").map(Number);

      const { data: rec, error: rErr } = await sb
        .from("recurrences")
        .insert({
          user_id: userId,
          account_id: data.account_id,
          category_id: data.category_id!,
          kind: data.kind,
          type,
          amount: data.amount,
          description: data.description,
          frequency: r.frequency,
          interval_count: r.interval_count,
          day_of_month: r.frequency === "monthly" ? d : null,
          start_on: data.occurred_on,
          end_on: r.end_on ?? null,
          next_run_on: nextRunOn(data.occurred_on, r.frequency, r.interval_count),
        })
        .select("id")
        .single();
      if (rErr) throw new Error(rErr.message);

      const { error: tErr } = await sb.from("transactions").insert({
        ...basePayload,
        amount: data.amount,
        occurred_on: data.occurred_on,
        recurrence_id: rec.id,
      });
      if (tErr) throw new Error(tErr.message);

      return { created_count: 1, recurrence_id: rec.id, warnings };
    }

    // -------- LANÇAMENTO ÚNICO --------------------------------------------
    const { error } = await sb.from("transactions").insert({
      ...basePayload,
      amount: data.amount,
      occurred_on: data.occurred_on,
      recurrence_id: data.link_recurrence_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { created_count: 1, warnings };
  });

// ---------------------------------------------------------------------------
// getTransactionDeleteImpact — Missão 12: avisa ANTES de excluir se o
// lançamento pertence a um parcelamento de cartão (installment_items.
// transaction_id). Empréstimos/financiamentos/consórcios (tabela `loans`)
// não têm NENHUM vínculo com `transactions` no schema atual — não têm
// coluna loan_id nem reaproveitam recurrence_id, e não há função de
// criação/pagamento para loans no app hoje (só listagem) — por isso não
// entram nesta checagem, não há o que avisar.
// ---------------------------------------------------------------------------
export interface TransactionDeleteImpactDTO {
  linked_installment: {
    purchase_id: string;
    purchase_description: string;
    installment_number: number;
    installments_count: number;
    /** Quantas parcelas dessa compra ainda têm transaction_id (antes desta exclusão). */
    paid_count: number;
    /** true se esta é a ÚLTIMA parcela ainda vinculada — excluir zera o parcelamento inteiro. */
    is_last_paid: boolean;
  } | null;
}

export const getTransactionDeleteImpact = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<TransactionDeleteImpactDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: item, error } = await sb
      .from("installment_items")
      .select(
        "purchase_id, installment_number, installment_purchases:purchase_id ( description, installments_count )",
      )
      .eq("transaction_id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) return { linked_installment: null };

    const typed = item as unknown as {
      purchase_id: string;
      installment_number: number;
      installment_purchases?: { description?: string | null; installments_count?: number } | null;
    };

    const { count, error: countErr } = await sb
      .from("installment_items")
      .select("id", { count: "exact", head: true })
      .eq("purchase_id", typed.purchase_id)
      .eq("user_id", userId)
      .not("transaction_id", "is", null);
    if (countErr) throw new Error(countErr.message);

    const paidCount = count ?? 0;
    return {
      linked_installment: {
        purchase_id: typed.purchase_id,
        purchase_description: typed.installment_purchases?.description ?? "",
        installment_number: typed.installment_number,
        installments_count: typed.installment_purchases?.installments_count ?? 0,
        paid_count: paidCount,
        is_last_paid: paidCount <= 1,
      },
    };
  });

// ---------------------------------------------------------------------------
// discardTransaction — usado pela fila de conciliação
// ---------------------------------------------------------------------------
export const discardTransaction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { error, data: deleted } = await sb
      .from("transactions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Lançamento não encontrado ou não pertence ao usuário.");
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// bulkDiscardTransactions — exclusão em lote a partir da seleção múltipla na
// tela de Lançamentos. Um único DELETE ... WHERE id IN (...) em vez de N
// chamadas separadas. Parcelas de installment_purchases porventura incluídas
// no lote simplesmente voltam a "não paga" (installment_items.transaction_id
// é ON DELETE SET NULL) — mesmo comportamento já estabelecido para a
// exclusão individual (Missão 12), sem checagem de impacto por item aqui
// (a tela avisa isso de forma genérica na confirmação, sem bloquear o lote).
// ---------------------------------------------------------------------------
export const bulkDiscardTransactions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { error, count } = await sb
      .from("transactions")
      .delete({ count: "exact" })
      .in("id", data.ids)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { deleted_count: count ?? 0 };
  });

// ---------------------------------------------------------------------------
// mergeDuplicateTransactions — fluxo "Mesclar" da fila de conciliação
//
// `keep_id` permanece e ABSORVE `dedup_hash`, `source` e `external_id` do
// primeiro item de `absorb_ids` que possuir tais metadados (preservando a
// amarração do Open Finance). Os itens absorvidos são REMOVIDOS para evitar
// duplicidade de saldo. Em caso de falha no delete, revertemos o keeper.
// ---------------------------------------------------------------------------
export const mergeDuplicateTransactions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        keep_id: z.string().uuid(),
        absorb_ids: z.array(z.string().uuid()).min(1).max(20),
      })
      .refine((v) => !v.absorb_ids.includes(v.keep_id), {
        message: "keep_id não pode estar em absorb_ids",
        path: ["absorb_ids"],
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: keeperBefore, error: kErr } = await sb
      .from("transactions")
      .select("id, dedup_hash, source, external_id")
      .eq("id", data.keep_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (kErr) throw new Error(kErr.message);
    if (!keeperBefore) throw new Error("Transação a preservar não encontrada.");

    const { data: absorbed, error: aErr } = await sb
      .from("transactions")
      .select("id, dedup_hash, source, external_id")
      .in("id", data.absorb_ids)
      .eq("user_id", userId);
    if (aErr) throw new Error(aErr.message);
    if (!absorbed || absorbed.length === 0) {
      throw new Error("Itens a absorver não encontrados.");
    }

    const donor =
      absorbed.find((a) => a.dedup_hash) ??
      absorbed.find((a) => a.source && a.source !== "manual") ??
      absorbed[0];

    // Ordem crítica: DELETE primeiro libera o índice UNIQUE parcial em
    // (user_id, dedup_hash), evitando conflito quando o keeper for
    // re-hasheado pelo trigger ao receber source='import'/'pluggy'.
    const { error: dErr } = await sb
      .from("transactions")
      .delete()
      .in("id", data.absorb_ids)
      .eq("user_id", userId);
    if (dErr) throw new Error(`Falha ao remover duplicatas: ${dErr.message}`);

    // Patch: preserva amarração do Open Finance (external_id) e marca source
    // como o do donor (que dispara a re-geração do dedup_hash via trigger).
    const patch: Record<string, string | null> = {};
    if (donor.source && donor.source !== "manual") patch.source = donor.source;
    if (donor.external_id && !keeperBefore.external_id) patch.external_id = donor.external_id;

    if (Object.keys(patch).length > 0) {
      const { error: uErr } = await sb
        .from("transactions")
        .update(patch)
        .eq("id", data.keep_id)
        .eq("user_id", userId);
      if (uErr) {
        // Não há rollback dos deletes; logamos via warning no retorno.
        throw new Error(`Duplicatas removidas, mas falha ao absorver metadados: ${uErr.message}`);
      }
    }

    return { ok: true, kept_id: data.keep_id, absorbed_count: absorbed.length };
  });

// ---------------------------------------------------------------------------
// getTransactionById — usado pela tela de edição
// ---------------------------------------------------------------------------
export interface TransactionDetailDTO {
  id: string;
  account_id: string;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  kind: TransactionKind;
  type: TransactionType;
  amount: string;
  description: string | null;
  notes: string | null;
  occurred_on: string;
  transfer_id: string | null;
  invoice_id: string | null;
  paid_invoice_id: string | null;
  recurrence_id: string | null;
  source: string | null;
  has_installment_link: boolean;
  /** Presente somente quando has_installment_link — contexto para a tela de conversão. */
  installment_info: { current: number; total: number; purchase_description: string } | null;
  /** Presente somente quando kind === 'transfer' — contexto para a tela de conversão. */
  transfer_counterpart_account_name: string | null;
}

export const getTransactionById = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<TransactionDetailDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: row, error } = await sb
      .from("transactions")
      .select(
        `id, account_id, category_id, kind, type, amount, description, notes,
         occurred_on, transfer_id, invoice_id, paid_invoice_id, recurrence_id,
         source,
         accounts:account_id ( name ),
         categories:category_id ( name )`,
      )
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Lançamento não encontrado.");

    const { data: instRow } = await sb
      .from("installment_items")
      .select(
        "installment_number, purchase_id, installment_purchases:purchase_id ( description, installments_count )",
      )
      .eq("transaction_id", data.id)
      .eq("user_id", userId)
      .maybeSingle();

    const instTyped = instRow as unknown as {
      installment_number: number;
      installment_purchases?: { description?: string | null; installments_count?: number } | null;
    } | null;

    const installmentInfo = instTyped
      ? {
          current: instTyped.installment_number,
          total: instTyped.installment_purchases?.installments_count ?? 0,
          purchase_description: instTyped.installment_purchases?.description ?? "",
        }
      : null;

    let transferCounterpartName: string | null = null;
    const rowTransferId = (row as { transfer_id?: string | null }).transfer_id;
    if (rowTransferId) {
      const { data: sibling } = await sb
        .from("transactions")
        .select("account_id, accounts:account_id ( name )")
        .eq("transfer_id", rowTransferId)
        .eq("user_id", userId)
        .neq("id", data.id)
        .maybeSingle();
      transferCounterpartName =
        (sibling as unknown as { accounts?: { name?: string | null } | null } | null)?.accounts
          ?.name ?? null;
    }

    const r = row as unknown as {
      id: string;
      account_id: string;
      category_id: string | null;
      kind: TransactionKind;
      type: TransactionType;
      amount: string;
      description: string | null;
      notes: string | null;
      occurred_on: string;
      transfer_id: string | null;
      invoice_id: string | null;
      paid_invoice_id: string | null;
      recurrence_id: string | null;
      source: string | null;
      accounts?: { name?: string | null } | null;
      categories?: { name?: string | null } | null;
    };

    return {
      id: r.id,
      account_id: r.account_id,
      account_name: r.accounts?.name ?? null,
      category_id: r.category_id,
      category_name: r.categories?.name ?? null,
      kind: r.kind,
      type: r.type,
      amount: r.amount,
      description: r.description,
      notes: r.notes,
      occurred_on: r.occurred_on,
      transfer_id: r.transfer_id,
      invoice_id: r.invoice_id,
      paid_invoice_id: r.paid_invoice_id,
      recurrence_id: r.recurrence_id,
      source: r.source,
      has_installment_link: installmentInfo !== null,
      installment_info: installmentInfo,
      transfer_counterpart_account_name: transferCounterpartName,
    };
  });

// ---------------------------------------------------------------------------
// updateTransactionEntry — RETIFICAÇÃO de atributos.
//
// Regra constitucional: edição NUNCA muta estruturas (não converte em
// parcelamento, não cria recorrência, não muda kind/type). Apenas
// description, amount, occurred_on, account_id, category_id e notes.
// ---------------------------------------------------------------------------
const UpdateTxInput = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(1).max(240),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount inválido (ex.: 1234.56)"),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account_id: z.string().uuid(),
  category_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateTransactionEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateTxInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { accountBelongsToUser } = await import("@/lib/finance/active-account.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    // Blindagem: account_id/category_id NOVOS também vêm do cliente — sem
    // checar dono aqui, dava pra repontar um lançamento próprio pra conta/
    // categoria de outro usuário (corrompendo o saldo da conta alheia).
    const accountOk = await accountBelongsToUser(sb, userId, data.account_id);
    if (!accountOk) throw new Error("Conta não pertence ao usuário ou foi arquivada.");
    if (data.category_id) {
      const { data: cat, error: catErr } = await sb
        .from("categories")
        .select("id")
        .eq("id", data.category_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (catErr) throw new Error(catErr.message);
      if (!cat) throw new Error("Categoria não pertence ao usuário.");
    }

    const { error, data: updated } = await sb
      .from("transactions")
      .update({
        description: data.description,
        amount: data.amount,
        occurred_on: data.occurred_on,
        account_id: data.account_id,
        category_id: data.category_id ?? null,
        notes: data.notes ?? null,
      })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Lançamento não encontrado ou não pertence ao usuário.");
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// convertTransactionEntry — CONVERSÃO ESTRUTURAL (ação separada e explícita
// da retificação acima). Desfaz a estrutura antiga (parcelamento/recorrência/
// transferência/pagamento de fatura) e recria o lançamento com o novo kind,
// tudo dentro de UMA chamada RPC atômica (migration 0013,
// convert_transaction_entry) — nunca chamada diretamente do frontend.
// ---------------------------------------------------------------------------
const ConvertInput = z
  .object({
    transaction_id: z.string().uuid(),
    new_kind: z.enum(["income", "expense", "transfer", "invoice_payment"]),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount inválido (ex.: 1234.56)"),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().min(1).max(240),
    account_id: z.string().uuid(),
    notes: z.string().max(2000).optional(),
    category_id: z.string().uuid().optional(),
    counterpart_account_id: z.string().uuid().optional(),
    paid_invoice_id: z.string().uuid().optional(),
    idempotency_key: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.new_kind === "income" || v.new_kind === "expense") && !v.category_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Categoria é obrigatória para receita/despesa.",
        path: ["category_id"],
      });
    }
    if (v.new_kind === "transfer") {
      if (!v.counterpart_account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecione a conta de destino da transferência.",
          path: ["counterpart_account_id"],
        });
      } else if (v.counterpart_account_id === v.account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Conta de destino deve ser diferente da origem.",
          path: ["counterpart_account_id"],
        });
      }
    }
    if (v.new_kind === "invoice_payment" && !v.paid_invoice_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione a fatura a ser paga.",
        path: ["paid_invoice_id"],
      });
    }
  });

export interface ConvertTransactionResultDTO {
  created_transaction_id: string | null;
  created_transfer_id: string | null;
  invoice_outstanding: number | null;
  invoice_status: string | null;
}

export const convertTransactionEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConvertInput.parse(input))
  .handler(async ({ data }): Promise<ConvertTransactionResultDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { accountBelongsToUser } = await import("@/lib/finance/active-account.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    // convert_transaction_entry (migration 0013) é security definer e roda
    // via service_role — ela não tem acesso a auth.uid() para validar posse
    // sozinha, e reaproveita o user_id da própria transação para a linha
    // nova (nunca troca de dono). Quem PRECISA garantir que o usuário ativo
    // é o dono da transação é esta camada, antes de sequer chamar a RPC.
    const { data: ownerRow, error: ownerErr } = await sb
      .from("transactions")
      .select("id")
      .eq("id", data.transaction_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownerErr) throw new Error(ownerErr.message);
    if (!ownerRow) throw new Error("Lançamento não encontrado ou não pertence ao usuário.");

    // A RPC também não valida dono de account_id/category_id/counterpart/
    // fatura — só reaproveita o v_user_id da transação original. Sem checar
    // aqui, a conversão gravaria a linha nova com FK pra conta/categoria/
    // fatura de outro usuário (mesma corrupção de account_balances do
    // createTransactionEntry).
    const accountOk = await accountBelongsToUser(sb, userId, data.account_id);
    if (!accountOk) throw new Error("Conta não pertence ao usuário ou foi arquivada.");

    if (data.counterpart_account_id) {
      const counterpartOk = await accountBelongsToUser(sb, userId, data.counterpart_account_id);
      if (!counterpartOk) {
        throw new Error("Conta de destino não pertence ao usuário ou foi arquivada.");
      }
    }

    if (data.category_id) {
      const { data: cat, error: catErr } = await sb
        .from("categories")
        .select("id")
        .eq("id", data.category_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (catErr) throw new Error(catErr.message);
      if (!cat) throw new Error("Categoria não pertence ao usuário.");
    }

    if (data.paid_invoice_id) {
      const { data: inv, error: invErr } = await sb
        .from("credit_card_invoices")
        .select("id")
        .eq("id", data.paid_invoice_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (invErr) throw new Error(invErr.message);
      if (!inv) throw new Error("Fatura não encontrada ou não pertence ao usuário.");
    }

    const idempotencyKey =
      data.new_kind === "invoice_payment" ? (data.idempotency_key ?? crypto.randomUUID()) : null;

    const { data: rpcResult, error } = await sb.rpc("convert_transaction_entry", {
      _transaction_id: data.transaction_id,
      _new_kind: data.new_kind,
      _amount: data.amount,
      _occurred_on: data.occurred_on,
      _description: data.description,
      _account_id: data.account_id,
      _notes: data.notes ?? null,
      _category_id: data.category_id ?? null,
      _counterpart_account_id: data.counterpart_account_id ?? null,
      _paid_invoice_id: data.paid_invoice_id ?? null,
      _idempotency_key: idempotencyKey,
    });

    if (error) {
      // Mensagens de negócio (P0001: fatura não encontrada, ambiguidade de
      // perna, categoria ausente etc.) chegam aqui como texto legível.
      throw new Error(error.message);
    }

    const result = rpcResult?.[0];
    if (!result) throw new Error("Falha ao converter lançamento.");

    return {
      created_transaction_id: result.created_transaction_id,
      created_transfer_id: result.created_transfer_id,
      invoice_outstanding: result.invoice_outstanding,
      invoice_status: result.invoice_status,
    };
  });
