/**
 * Server Functions — Installments & Loans.
 * Lê compras parceladas com progresso e empréstimos/financiamentos/consórcios.
 *
 * Exclusão (Missão 12): parcelamentos e loans usam mecanismos DIFERENTES,
 * porque a estrutura de dados subjacente é diferente:
 *  - installment_purchases tem transactions de fato vinculadas via
 *    installment_items.transaction_id — excluir o cabeçalho exige apagar
 *    essas transactions também, de forma atômica (RPC delete_installment_purchase,
 *    migration 0015 — mesma disciplina de pay_credit_card_invoice).
 *  - loans NÃO tem nenhuma coluna de vínculo com transactions (nem loan_id,
 *    nem recurrence_id) e não existe função de criação/pagamento para loans
 *    no app hoje (só listagem) — não há nada para arrastar junto, então
 *    excluir um loan é um DELETE simples de uma linha, sem RPC.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface InstallmentPurchaseDTO {
  id: string;
  description: string;
  total_amount: string;
  installments_count: number;
  paid_count: number;
  remaining_amount: string;
  purchased_on: string;
  status: "active" | "completed" | "cancelled";
  account_name: string | null;
  category_name: string | null;
  next_due_date: string | null;
}

export const listInstallmentPurchases = createServerFn({ method: "GET" }).handler(
  async (): Promise<InstallmentPurchaseDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("installment_purchases")
      .select(
        `id, description, total_amount, installments_count, purchased_on, status,
         accounts:account_id ( name ),
         categories:category_id ( name ),
         installment_items ( amount, due_date, transaction_id )`,
      )
      .order("purchased_on", { ascending: false });
    if (error) throw new Error(error.message);

    const today = new Date().toISOString().slice(0, 10);

    return (
      (data ?? []) as unknown as Array<{
        id: string;
        description: string;
        total_amount: string;
        installments_count: number;
        purchased_on: string;
        status: InstallmentPurchaseDTO["status"];
        accounts?: { name?: string | null } | null;
        categories?: { name?: string | null } | null;
        installment_items?: Array<{
          amount: string;
          due_date: string;
          transaction_id: string | null;
        }>;
      }>
    ).map((p) => {
      const items = p.installment_items ?? [];
      const paidItems = items.filter((i) => i.transaction_id != null);
      const remainingItems = items.filter((i) => i.transaction_id == null);
      const remaining_amount = remainingItems.reduce(
        (acc, i) => acc + Math.round(Number(i.amount) * 100),
        0,
      );
      const next = remainingItems
        .filter((i) => i.due_date >= today)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      return {
        id: p.id,
        description: p.description,
        total_amount: p.total_amount,
        installments_count: p.installments_count,
        paid_count: paidItems.length,
        remaining_amount: (remaining_amount / 100).toFixed(2),
        purchased_on: p.purchased_on,
        status: p.status,
        account_name: p.accounts?.name ?? null,
        category_name: p.categories?.name ?? null,
        next_due_date: next?.due_date ?? null,
      };
    });
  },
);

export interface LoanDTO {
  id: string;
  kind: "personal" | "financing" | "consortium";
  description: string;
  principal_amount: string;
  installments_count: number;
  installments_paid: number;
  monthly_due_day: number;
  start_on: string;
  status: "active" | "paid_off" | "defaulted" | "cancelled";
  is_contemplated: boolean;
  contemplated_at: string | null;
  account_name: string | null;
}

export const listLoans = createServerFn({ method: "GET" }).handler(async (): Promise<LoanDTO[]> => {
  const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("loans")
    .select(
      `id, kind, description, principal_amount, installments_count,
         installments_paid, monthly_due_day, start_on, status, is_contemplated,
         contemplated_at,
         accounts:account_id ( name )`,
    )
    .order("start_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as unknown as Array<
      LoanDTO & {
        accounts?: { name?: string | null } | null;
      }
    >
  ).map((l) => ({ ...l, account_name: l.accounts?.name ?? null }));
});

// ---------------------------------------------------------------------------
// deleteInstallmentPurchase — exclusão TOTAL (Missão 12): apaga o cabeçalho
// E qualquer transaction ainda vinculada, atomicamente via RPC (migration
// 0015). installment_items é removido em cascata pelo próprio banco.
// ---------------------------------------------------------------------------
const IdInput = z.object({ id: z.string().uuid() });

export interface DeleteInstallmentPurchaseResultDTO {
  deleted_transactions: number;
}

export const deleteInstallmentPurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data }): Promise<DeleteInstallmentPurchaseResultDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { data: rpcResult, error } = await sb.rpc("delete_installment_purchase", {
      _purchase_id: data.id,
    });
    if (error) throw new Error(error.message);
    const result = rpcResult?.[0];
    if (!result) throw new Error("Falha ao excluir parcelamento.");
    return { deleted_transactions: result.deleted_transactions };
  });

// ---------------------------------------------------------------------------
// deleteLoan — DELETE simples: `loans` não tem nenhuma transaction vinculada
// no schema atual (sem loan_id/recurrence_id em transactions, sem função de
// pagamento), então não há nada para arrastar junto — não precisa de RPC.
// ---------------------------------------------------------------------------
export const deleteLoan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("loans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
