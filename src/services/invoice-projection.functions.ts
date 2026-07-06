/**
 * Projeção de fatura — usada pelo formulário de Novo Lançamento ao selecionar
 * um cartão de crédito. Aplica a Regra do Meio do Mês (lib/finance/invoice-due).
 *
 * Retorna a data de vencimento projetada da compra (ou da 1ª parcela) e a
 * referência do mês da fatura. Tudo derivado — não cria registros.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeInvoiceDueDate } from "@/lib/finance/invoice-due";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

const Input = z.object({
  account_id: z.string().uuid(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface InvoiceProjectionDTO {
  account_id: string;
  account_name: string;
  closing_day: number;
  due_day: number;
  /** YYYY-MM-DD — vencimento projetado da fatura desta compra. */
  projected_due_date: string;
  /** YYYY-MM — mês civil de referência da fatura. */
  projected_reference_month: string;
}

export const projectInvoiceForPurchase = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<InvoiceProjectionDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: acc, error } = await sb
      .from("accounts")
      .select("id, name, type, closing_day, due_day")
      .eq("id", data.account_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!acc) throw new Error("Conta não encontrada.");
    if (acc.type !== "credit_card") {
      throw new Error("Conta selecionada não é cartão de crédito.");
    }
    if (acc.closing_day == null || acc.due_day == null) {
      throw new Error("Cartão sem closing_day/due_day configurados.");
    }

    const [y, m, d] = data.purchase_date.split("-").map(Number);
    const purchaseDate = new Date(y, m - 1, d);
    const due = computeInvoiceDueDate({
      purchaseDate,
      closingDay: acc.closing_day,
      dueDay: acc.due_day,
    });

    const dueY = due.getFullYear();
    const dueM = String(due.getMonth() + 1).padStart(2, "0");
    const dueD = String(due.getDate()).padStart(2, "0");

    return {
      account_id: acc.id as string,
      account_name: acc.name as string,
      closing_day: acc.closing_day as number,
      due_day: acc.due_day as number,
      projected_due_date: `${dueY}-${dueM}-${dueD}`,
      projected_reference_month: `${dueY}-${dueM}`,
    };
  });
