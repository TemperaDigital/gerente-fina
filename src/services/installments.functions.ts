/**
 * Server Functions — Installments & Loans.
 * Lê compras parceladas com progresso e empréstimos/financiamentos/consórcios.
 *
 * Vínculo loans <-> transactions (GF-005, migration 0022): `pay_loan_installment`
 * é uma RPC atômica (mesmo padrão de `pay_credit_card_invoice`, migration 0011)
 * que cria a transação de despesa E incrementa `installments_paid` (virando
 * `paid_off` ao quitar) na mesma transação de banco, com idempotência via
 * `_idempotency_key`. Cadastro de loan (criação) continua manual/fora do
 * app — só o pagamento de parcela foi vinculado.
 *
 * Exclusão (Missão 12): parcelamentos e loans usam mecanismos DIFERENTES,
 * porque a estrutura de dados subjacente é diferente:
 *  - installment_purchases tem transactions de fato vinculadas via
 *    installment_items.transaction_id — excluir o cabeçalho exige apagar
 *    essas transactions também, de forma atômica (RPC delete_installment_purchase,
 *    migration 0015 — mesma disciplina de pay_credit_card_invoice).
 *  - loans agora PODE ter transactions vinculadas (transactions.loan_id,
 *    migration 0022), mas via `on delete set null` (mesma semântica de
 *    category_id) — excluir um loan não apaga o histórico real de dinheiro
 *    que já saiu, só desvincula a tag. Por isso `deleteLoan` continua sendo
 *    um DELETE simples de uma linha, sem RPC de arrasto.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

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
    const userId = await resolveActiveUserId();
    const { data, error } = await sb
      .from("installment_purchases")
      .select(
        `id, description, total_amount, installments_count, purchased_on, status,
         accounts:account_id ( name ),
         categories:category_id ( name ),
         installment_items ( amount, due_date, transaction_id )`,
      )
      .eq("user_id", userId)
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
  const userId = await resolveActiveUserId();
  const { data, error } = await sb
    .from("loans")
    .select(
      `id, kind, description, principal_amount, installments_count,
         installments_paid, monthly_due_day, start_on, status, is_contemplated,
         contemplated_at,
         accounts:account_id ( name )`,
    )
    .eq("user_id", userId)
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
// payLoanInstallment — registra o pagamento de UMA parcela de empréstimo:
// cria a despesa vinculada (transactions.loan_id) e avança installments_paid
// atomicamente via RPC `pay_loan_installment` (migration 0022). A RPC é
// security definer sem GRANT para authenticated/anon/public (disciplina das
// migrations 0019/0021) — por isso a posse do loan e da categoria são
// validadas AQUI, na camada TypeScript, antes de chamar a função.
// ---------------------------------------------------------------------------
const PayLoanInstallmentInput = z.object({
  loan_id: z.string().uuid(),
  category_id: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(240),
  idempotency_key: z.string().uuid().optional(),
});

export interface PayLoanInstallmentResultDTO {
  transaction_id: string;
  installments_paid: number;
  loan_status: LoanDTO["status"];
  was_duplicate: boolean;
}

export const payLoanInstallment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PayLoanInstallmentInput.parse(input))
  .handler(async ({ data }): Promise<PayLoanInstallmentResultDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: loan, error: loanErr } = await sb
      .from("loans")
      .select("id")
      .eq("id", data.loan_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (loanErr) throw new Error(loanErr.message);
    if (!loan) throw new Error("Empréstimo não encontrado ou não pertence ao usuário.");

    const { data: category, error: catErr } = await sb
      .from("categories")
      .select("id")
      .eq("id", data.category_id)
      .eq("user_id", userId)
      .eq("kind", "expense")
      .maybeSingle();
    if (catErr) throw new Error(catErr.message);
    if (!category) {
      throw new Error("Categoria inválida — precisa ser uma categoria de despesa do usuário.");
    }

    const { data: rpcResult, error } = await sb.rpc("pay_loan_installment", {
      _loan_id: data.loan_id,
      _category_id: data.category_id,
      _amount: data.amount,
      _occurred_on: data.occurred_on,
      _description: data.description,
      _notes: null,
      _idempotency_key: data.idempotency_key ?? null,
    });
    if (error) throw new Error(error.message);
    const result = rpcResult?.[0];
    if (!result) throw new Error("Falha ao registrar pagamento.");
    return {
      transaction_id: result.transaction_id,
      installments_paid: result.installments_paid,
      loan_status: result.loan_status,
      was_duplicate: result.was_duplicate,
    };
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
    const userId = await resolveActiveUserId();

    // delete_installment_purchase (migration 0015) é security definer e não
    // recebe/valida user_id — quem precisa garantir posse é esta camada,
    // antes de sequer chamar a RPC.
    const { data: owned, error: ownErr } = await sb
      .from("installment_purchases")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!owned) throw new Error("Parcelamento não encontrado ou não pertence ao usuário.");

    const { data: rpcResult, error } = await sb.rpc("delete_installment_purchase", {
      _purchase_id: data.id,
    });
    if (error) throw new Error(error.message);
    const result = rpcResult?.[0];
    if (!result) throw new Error("Falha ao excluir parcelamento.");
    return { deleted_transactions: result.deleted_transactions };
  });

// ---------------------------------------------------------------------------
// deleteLoan — DELETE simples: `transactions.loan_id` é `on delete set null`
// (migration 0022, mesma semântica de category_id) — apagar o loan não
// apaga transactions já pagas vinculadas a ele, só desvincula a tag. Por
// isso não precisa de RPC de arrasto como `delete_installment_purchase`.
// ---------------------------------------------------------------------------
export const deleteLoan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { error, data: deleted } = await sb
      .from("loans")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Registro não encontrado ou não pertence ao usuário.");
    }
    return { ok: true };
  });
