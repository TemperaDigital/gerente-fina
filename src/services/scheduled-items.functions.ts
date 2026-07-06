/**
 * Server Functions — Agendamentos (Missão 7).
 *
 * Leitura e confirmação manual de recorrências vinculadas a contas bank/cash
 * (que `materializeDueRecurrences` propositalmente NUNCA materializa
 * sozinho — ver nota em recurrence-materializer.functions.ts). Contas
 * credit_card continuam sendo materializadas automaticamente pelo motor;
 * elas aparecem aqui só para exibição informativa (sem ação de confirmar).
 *
 * CRUD do agendamento em si (criar/editar/excluir a definição da
 * recorrência) vive neste mesmo arquivo, adicionado na Parte 2 desta missão.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import {
  computeNextRun,
  type RecurrenceFrequency,
  type RecurrenceLike,
} from "@/lib/finance/recurrence-schedule";
import { createTransactionEntry } from "@/services/transactions.functions";

export interface ScheduledItemDTO {
  id: string;
  description: string;
  amount: string;
  kind: "income" | "expense";
  account_id: string;
  account_name: string | null;
  account_type: "cash" | "bank" | "credit_card";
  category_id: string;
  category_name: string | null;
  frequency: RecurrenceFrequency;
  interval_count: number;
  day_of_month: number | null;
  next_run_on: string;
  end_on: string | null;
}

type ScheduledItemRow = {
  id: string;
  description: string;
  amount: string;
  kind: "income" | "expense";
  account_id: string;
  category_id: string;
  frequency: RecurrenceFrequency;
  interval_count: number;
  day_of_month: number | null;
  next_run_on: string;
  end_on: string | null;
  accounts?: { name?: string | null; type?: "cash" | "bank" | "credit_card" } | null;
  categories?: { name?: string | null } | null;
};

// ---------------------------------------------------------------------------
// listScheduledItems — todos os agendamentos ATIVOS do usuário (Parte 1).
// Sem filtro de data aqui: Parte 2 (/agendamentos) agrupa em 3 baldes
// (atrasado/próximos 30 dias/mais adiante) e Parte 3 (widget do Dashboard)
// filtra para os próximos 30 dias — ambos reaproveitam esta mesma leitura.
// ---------------------------------------------------------------------------
export const listScheduledItems = createServerFn({ method: "GET" }).handler(
  async (): Promise<ScheduledItemDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data, error } = await sb
      .from("recurrences")
      .select(
        `id, description, amount, kind, account_id, category_id, frequency,
         interval_count, day_of_month, next_run_on, end_on,
         accounts:account_id ( name, type ),
         categories:category_id ( name )`,
      )
      .eq("user_id", userId)
      .eq("active", true)
      .order("next_run_on", { ascending: true });
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as ScheduledItemRow[]).map((r) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      kind: r.kind,
      account_id: r.account_id,
      account_name: r.accounts?.name ?? null,
      account_type: r.accounts?.type ?? "bank",
      category_id: r.category_id,
      category_name: r.categories?.name ?? null,
      frequency: r.frequency,
      interval_count: r.interval_count,
      day_of_month: r.day_of_month,
      next_run_on: r.next_run_on,
      end_on: r.end_on,
    }));
  },
);

// ---------------------------------------------------------------------------
// confirmScheduledItem — "Marcar como pago/recebido" (só contas bank/cash).
// Cria o lançamento de verdade via createTransactionEntry (vinculado à
// recorrência via link_recurrence_id) e avança/desativa o agendamento.
// ---------------------------------------------------------------------------
const ConfirmInput = z.object({
  recurrence_id: z.string().uuid(),
  /** Valor REAL pago/recebido — pode diferir do esperado (ex: conta de luz variável). */
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount inválido (ex.: 1234.56)"),
  /** Data REAL do pagamento/recebimento — pode diferir da data agendada. */
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface ConfirmScheduledItemResultDTO {
  created_count: number;
  deactivated: boolean;
}

export const confirmScheduledItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ConfirmInput.parse(input))
  .handler(async ({ data }): Promise<ConfirmScheduledItemResultDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: rec, error } = await sb
      .from("recurrences")
      .select(
        "id, account_id, category_id, kind, description, frequency, interval_count, day_of_month, end_on, next_run_on, active, accounts:account_id ( type )",
      )
      .eq("id", data.recurrence_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) throw new Error("Agendamento não encontrado.");

    const typed = rec as unknown as {
      id: string;
      account_id: string;
      category_id: string;
      kind: "income" | "expense";
      description: string;
      frequency: RecurrenceFrequency;
      interval_count: number;
      day_of_month: number | null;
      end_on: string | null;
      next_run_on: string;
      active: boolean;
      accounts?: { type?: "cash" | "bank" | "credit_card" } | null;
    };

    if (!typed.active) throw new Error("Este agendamento já está inativo.");
    if (typed.accounts?.type === "credit_card") {
      throw new Error(
        "Contas em cartão de crédito são lançadas automaticamente — não precisam de confirmação manual.",
      );
    }

    await createTransactionEntry({
      data: {
        kind: typed.kind,
        amount: data.amount,
        occurred_on: data.occurred_on,
        description: typed.description,
        account_id: typed.account_id,
        category_id: typed.category_id,
        link_recurrence_id: typed.id,
      },
    });

    const recLike: RecurrenceLike = {
      frequency: typed.frequency,
      interval_count: typed.interval_count,
      day_of_month: typed.day_of_month,
    };

    if (recLike.frequency === "once") {
      const { error: updErr } = await sb
        .from("recurrences")
        .update({ active: false })
        .eq("id", typed.id)
        .eq("user_id", userId);
      if (updErr) throw new Error(updErr.message);
      return { created_count: 1, deactivated: true };
    }

    // Avança a partir da data ORIGINALMENTE agendada (não da data real de
    // pagamento) — evita "arrastar" o calendário por atrasos pontuais (ex:
    // aluguel do dia 5 pago no dia 8 continua vencendo no dia 5 do mês seguinte).
    const newNextRun = computeNextRun(typed.next_run_on, recLike);
    const shouldDeactivate = typed.end_on !== null && newNextRun > typed.end_on;

    const { error: updErr } = await sb
      .from("recurrences")
      .update({ next_run_on: newNextRun, active: !shouldDeactivate })
      .eq("id", typed.id)
      .eq("user_id", userId);
    if (updErr) throw new Error(updErr.message);

    return { created_count: 1, deactivated: shouldDeactivate };
  });

// ---------------------------------------------------------------------------
// CRUD do agendamento em si (Parte 2). Único campo de data no formulário:
// `date` — representa `next_run_on` (a próxima ocorrência). Para criação,
// também vira `start_on`. `day_of_month` é sempre DERIVADO de `date` para
// frequências monthly/yearly — não é um campo de formulário separado.
// ---------------------------------------------------------------------------
function dayOfMonthFor(frequency: RecurrenceFrequency, date: string): number | null {
  if (frequency !== "monthly" && frequency !== "yearly") return null;
  return Number(date.split("-")[2]);
}

const ScheduledItemFields = {
  description: z.string().trim().min(1).max(240),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount inválido (ex.: 1234.56)"),
  kind: z.enum(["income", "expense"]),
  account_id: z.string().uuid(),
  category_id: z.string().uuid(),
  frequency: z.enum(["once", "daily", "weekly", "monthly", "yearly"]),
  interval_count: z.number().int().min(1).max(60).default(1),
  /** Próxima ocorrência (create: também é o início do agendamento). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
};

function validateScheduledItemDates(
  v: { date: string; end_on?: string; frequency: RecurrenceFrequency },
  ctx: z.RefinementCtx,
) {
  if (v.end_on && v.end_on < v.date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Data de término deve ser depois da próxima data.",
      path: ["end_on"],
    });
  }
  if (v.frequency === "once" && v.end_on) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ocorrência única não usa data de término.",
      path: ["end_on"],
    });
  }
}

const CreateScheduledItemInput = z
  .object(ScheduledItemFields)
  .superRefine(validateScheduledItemDates);

async function assertOwnedAccountAndCategory(
  sb: SupabaseClient,
  userId: string,
  accountId: string,
  categoryId: string,
): Promise<void> {
  const { accountBelongsToUser } = await import("@/lib/finance/active-account.server");
  const accountOk = await accountBelongsToUser(sb, userId, accountId);
  if (!accountOk) throw new Error("Conta não pertence ao usuário ou foi arquivada.");

  const { data: cat, error: catErr } = await sb
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (catErr) throw new Error(catErr.message);
  if (!cat) throw new Error("Categoria não pertence ao usuário.");
}

export const createScheduledItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateScheduledItemInput.parse(input))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const type = data.kind === "income" ? "credit" : "debit";

    await assertOwnedAccountAndCategory(sb, userId, data.account_id, data.category_id);

    const { data: created, error } = await sb
      .from("recurrences")
      .insert({
        user_id: userId,
        account_id: data.account_id,
        category_id: data.category_id,
        kind: data.kind,
        type,
        amount: data.amount,
        description: data.description,
        frequency: data.frequency,
        interval_count: data.frequency === "once" ? 1 : data.interval_count,
        day_of_month: dayOfMonthFor(data.frequency, data.date),
        start_on: data.date,
        end_on: data.frequency === "once" ? null : (data.end_on ?? null),
        next_run_on: data.date,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

const UpdateScheduledItemInput = z
  .object({ id: z.string().uuid(), ...ScheduledItemFields })
  .superRefine(validateScheduledItemDates);

export const updateScheduledItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdateScheduledItemInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const type = data.kind === "income" ? "credit" : "debit";

    await assertOwnedAccountAndCategory(sb, userId, data.account_id, data.category_id);

    const { error, data: updated } = await sb
      .from("recurrences")
      .update({
        account_id: data.account_id,
        category_id: data.category_id,
        kind: data.kind,
        type,
        amount: data.amount,
        description: data.description,
        frequency: data.frequency,
        interval_count: data.frequency === "once" ? 1 : data.interval_count,
        day_of_month: dayOfMonthFor(data.frequency, data.date),
        next_run_on: data.date,
        end_on: data.frequency === "once" ? null : (data.end_on ?? null),
      })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Agendamento não encontrado ou não pertence ao usuário.");
    }
    return { ok: true };
  });

// Excluir NÃO apaga lançamentos já materializados: transactions.recurrence_id
// é ON DELETE SET NULL (migration 0003) — o histórico passado fica intacto,
// só perde o vínculo com o agendamento (que deixou de existir).
export const deleteScheduledItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { error, data: deleted } = await sb
      .from("recurrences")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("Agendamento não encontrado ou não pertence ao usuário.");
    }
    return { ok: true };
  });
