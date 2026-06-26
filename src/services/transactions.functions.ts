/**
 * Server Functions — Transactions (Livro-Caixa).
 *
 * Listagem paginada e filtrada de lançamentos. NÃO aplica expurgo de
 * neutros — o livro-caixa mostra TUDO (transferências e pagamentos de
 * fatura inclusive). O expurgo é responsabilidade do DRE / Dashboard.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  amount: string; // numeric(14,2)
  description: string | null;
  occurred_on: string; // YYYY-MM-DD
  transfer_id: string | null;
  invoice_id: string | null;
  paid_invoice_id: string | null;
  recurrence_id: string | null;
  source: string | null;
  created_at: string;
}

export interface TransactionsListDTO {
  items: TransactionListItemDTO[];
  total: number;
  page: number;
  page_size: number;
}

const ListInput = z.object({
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(200).default(50),
  account_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  kind: z.enum(["income", "expense", "transfer", "invoice_payment"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

export const getTransactionsList = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ListInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;

    let query = sb
      .from("transactions")
      .select(
        `id, account_id, category_id, kind, type, amount, description,
         occurred_on, transfer_id, invoice_id, paid_invoice_id,
         recurrence_id, source, created_at,
         accounts:account_id ( name ),
         categories:category_id ( name )`,
        { count: "exact" },
      )
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.account_id) query = query.eq("account_id", data.account_id);
    if (data.category_id) query = query.eq("category_id", data.category_id);
    if (data.kind) query = query.eq("kind", data.kind);
    if (data.from) query = query.gte("occurred_on", data.from);
    if (data.to) query = query.lte("occurred_on", data.to);
    if (data.search) query = query.ilike("description", `%${data.search}%`);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    const items: TransactionListItemDTO[] = (rows ?? []).map((r) => {
      const row = r as Record<string, unknown> & {
        accounts?: { name?: string | null } | null;
        categories?: { name?: string | null } | null;
      };
      return {
        id: row.id as string,
        account_id: row.account_id as string,
        account_name: row.accounts?.name ?? null,
        category_id: (row.category_id as string | null) ?? null,
        category_name: row.categories?.name ?? null,
        kind: row.kind as TransactionKind,
        type: row.type as TransactionType,
        amount: row.amount as string,
        description: (row.description as string | null) ?? null,
        occurred_on: row.occurred_on as string,
        transfer_id: (row.transfer_id as string | null) ?? null,
        invoice_id: (row.invoice_id as string | null) ?? null,
        paid_invoice_id: (row.paid_invoice_id as string | null) ?? null,
        recurrence_id: (row.recurrence_id as string | null) ?? null,
        source: (row.source as string | null) ?? null,
        created_at: row.created_at as string,
      };
    });

    const result: TransactionsListDTO = {
      items,
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
    return result;
  });
