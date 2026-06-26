/**
 * Server Functions — Credit Card Invoices (Master/Detail).
 * Lista compacta de cartões + faturas abertas, e drill-down por fatura.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface InvoiceMasterDTO {
  account_id: string;
  account_name: string;
  closing_day: number | null;
  due_day: number | null;
  credit_limit_cents: number | null;
  open_invoice: {
    id: string;
    reference_month: string;
    closing_date: string;
    due_date: string;
    total_amount: string;
  } | null;
}

export const listInvoiceMasters = createServerFn({ method: "GET" }).handler(
  async (): Promise<InvoiceMasterDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const { data: cards, error } = await sb
      .from("accounts")
      .select("id, name, closing_day, due_day, credit_limit_cents")
      .eq("type", "credit_card")
      .is("archived_at", null)
      .order("name");
    if (error) throw new Error(error.message);

    const ids = (cards ?? []).map((c) => c.id);
    const openMap = new Map<string, InvoiceMasterDTO["open_invoice"]>();
    if (ids.length > 0) {
      const { data: invs } = await sb
        .from("credit_card_invoices")
        .select("id, account_id, reference_month, closing_date, due_date, total_amount")
        .in("account_id", ids)
        .eq("status", "open");
      for (const inv of (invs ?? []) as Array<{
        id: string;
        account_id: string;
        reference_month: string;
        closing_date: string;
        due_date: string;
        total_amount: string;
      }>) {
        openMap.set(inv.account_id, {
          id: inv.id,
          reference_month: inv.reference_month,
          closing_date: inv.closing_date,
          due_date: inv.due_date,
          total_amount: inv.total_amount ?? "0.00",
        });
      }
    }

    return (cards ?? []).map((c) => ({
      account_id: c.id,
      account_name: c.name,
      closing_day: c.closing_day,
      due_day: c.due_day,
      credit_limit_cents: c.credit_limit_cents,
      open_invoice: openMap.get(c.id) ?? null,
    }));
  },
);

export interface InvoiceMonthRefDTO {
  invoice_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  status: "open" | "closed" | "paid" | "overdue";
  total_amount: string;
}

export interface InvoiceLineDTO {
  id: string;
  occurred_on: string;
  description: string | null;
  amount: string;
  category_name: string | null;
}

export interface InvoiceDetailDTO {
  months: InvoiceMonthRefDTO[];
  current: InvoiceMonthRefDTO | null;
  lines: InvoiceLineDTO[];
}

const DetailInput = z.object({
  account_id: z.string().uuid(),
  reference_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const getInvoiceDetail = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => DetailInput.parse(i))
  .handler(async ({ data }): Promise<InvoiceDetailDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const { data: monthsRaw, error: mErr } = await sb
      .from("credit_card_invoices")
      .select("id, reference_month, closing_date, due_date, status, total_amount")
      .eq("account_id", data.account_id)
      .order("reference_month", { ascending: false });
    if (mErr) throw new Error(mErr.message);

    const months: InvoiceMonthRefDTO[] = ((monthsRaw ?? []) as Array<{
      id: string;
      reference_month: string;
      closing_date: string;
      due_date: string;
      status: InvoiceMonthRefDTO["status"];
      total_amount: string;
    }>).map((m) => ({
      invoice_id: m.id,
      reference_month: m.reference_month,
      closing_date: m.closing_date,
      due_date: m.due_date,
      status: m.status,
      total_amount: m.total_amount ?? "0.00",
    }));

    let current: InvoiceMonthRefDTO | null = null;
    if (data.reference_month) {
      const ref = `${data.reference_month}-01`;
      current = months.find((m) => m.reference_month === ref) ?? null;
    } else {
      current =
        months.find((m) => m.status === "open") ?? months[0] ?? null;
    }

    let lines: InvoiceLineDTO[] = [];
    if (current) {
      const { data: tx, error: tErr } = await sb
        .from("transactions")
        .select(
          `id, occurred_on, description, amount,
           categories:category_id ( name )`,
        )
        .eq("invoice_id", current.invoice_id)
        .order("occurred_on", { ascending: true });
      if (tErr) throw new Error(tErr.message);
      lines = ((tx ?? []) as unknown as Array<{
        id: string;
        occurred_on: string;
        description: string | null;
        amount: string;
        categories?: { name?: string | null } | null;
      }>).map((t) => ({
        id: t.id,
        occurred_on: t.occurred_on,
        description: t.description,
        amount: t.amount,
        category_name: t.categories?.name ?? null,
      }));
    }

    return { months, current, lines };
  });
