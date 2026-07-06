/**
 * Server Function — Materialização de recorrências vencidas.
 *
 * Transforma recorrências ativas (salário, aluguel, assinaturas...) em
 * lançamentos reais na tabela `transactions`, sempre que `next_run_on` já
 * chegou. Depois de materializar, avança `next_run_on` para a próxima data.
 *
 * IDEMPOTÊNCIA: cada ocorrência é inserida com `recurrence_id` + `occurred_on`
 * exatos. A migration 0010 cria um índice único nesse par — se a mesma
 * ocorrência já existe (dupla chamada, corrida), o INSERT falha com erro de
 * unicidade do Postgres (código 23505), que capturamos e tratamos como "já
 * materializada" em vez de propagar como falha real.
 *
 * "Meses atrasados": se o usuário não abre o app por semanas, uma recorrência
 * mensal pode ter várias ocorrências pendentes. occurrencesUntil() gera todas
 * de uma vez, até o limite de 36 (proteção contra configuração inválida).
 *
 * DISTINÇÃO POR TIPO DE CONTA (Missão 7): contas bank/cash NUNCA são
 * materializadas automaticamente aqui — a contabilidade dessas contas precisa
 * refletir a conciliação bancária real (o valor pago pode diferir do
 * esperado, ex: conta de luz variável), então o sistema não pode presumir que
 * o pagamento aconteceu antes do usuário confirmar contra o extrato de
 * verdade. Elas ficam como lembrete (lidas por listScheduledItems, em
 * scheduled-items.functions.ts) até o usuário confirmar manualmente via
 * confirmScheduledItem. Contas credit_card mantêm o comportamento automático
 * de sempre — a cobrança no cartão acontece independente de ação do usuário.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import {
  computeNextRun,
  occurrencesUntil,
  type RecurrenceLike,
} from "@/lib/finance/recurrence-schedule";

interface RecurrenceRow {
  id: string;
  account_id: string;
  category_id: string;
  kind: "income" | "expense";
  type: "credit" | "debit";
  amount: string;
  description: string;
  frequency: RecurrenceLike["frequency"];
  interval_count: number;
  day_of_month: number | null;
  end_on: string | null;
  next_run_on: string;
  accounts?: { type: "cash" | "bank" | "credit_card" } | null;
}

export interface MaterializeResultDTO {
  created: number;
  skipped_already_materialized: number;
  recurrences_advanced: number;
  recurrences_deactivated: number;
}

const UNIQUE_VIOLATION = "23505";

const Input = z
  .object({
    /** Materializa tudo até esta data (inclusive). Default: hoje. */
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .optional();

export const materializeDueRecurrences = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<MaterializeResultDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const until = data?.until ?? new Date().toISOString().slice(0, 10);

    const { data: recurrences, error } = await sb
      .from("recurrences")
      .select(
        "id, account_id, category_id, kind, type, amount, description, frequency, interval_count, day_of_month, end_on, next_run_on, accounts:account_id ( type )",
      )
      .eq("user_id", userId)
      .eq("active", true)
      .lte("next_run_on", until);

    if (error) throw new Error(error.message);
    if (!recurrences?.length) {
      return {
        created: 0,
        skipped_already_materialized: 0,
        recurrences_advanced: 0,
        recurrences_deactivated: 0,
      };
    }

    let created = 0;
    let skipped = 0;
    let advanced = 0;
    let deactivated = 0;

    for (const rec of recurrences as unknown as RecurrenceRow[]) {
      // Bank/cash: NUNCA materializa sozinho — fica só como lembrete até o
      // usuário confirmar manualmente (confirmScheduledItem). Só credit_card
      // segue o comportamento automático de sempre.
      if (rec.accounts?.type !== "credit_card") continue;

      const recLike: RecurrenceLike = {
        frequency: rec.frequency,
        interval_count: rec.interval_count,
        day_of_month: rec.day_of_month,
      };

      const dates = occurrencesUntil(rec.next_run_on, until, recLike, rec.end_on);
      let lastProcessedDate: string | null = null;

      for (const occurredOn of dates) {
        const { error: insertError } = await sb.from("transactions").insert({
          user_id: userId,
          account_id: rec.account_id,
          category_id: rec.category_id,
          kind: rec.kind,
          type: rec.type,
          amount: rec.amount,
          occurred_on: occurredOn,
          description: rec.description,
          recurrence_id: rec.id,
          source: "recurrence",
        });

        if (insertError) {
          // Já materializado antes (corrida ou reprocessamento) — não é erro real
          if (insertError.code === UNIQUE_VIOLATION) {
            skipped++;
            lastProcessedDate = occurredOn;
            continue;
          }
          // Erro genuíno (FK inválida, categoria arquivada, etc): não trava as
          // demais recorrências, mas registra e para de avançar ESTA aqui.
          console.error(
            `Falha ao materializar recorrência ${rec.id} em ${occurredOn}:`,
            insertError.message,
          );
          break;
        }

        created++;
        lastProcessedDate = occurredOn;
      }

      if (!lastProcessedDate) continue;

      // 'once' nunca tem próxima ocorrência — desativa direto, sem chamar
      // computeNextRun (que lança erro de propósito para esse caso).
      if (recLike.frequency === "once") {
        const { error: updateError } = await sb
          .from("recurrences")
          .update({ active: false })
          .eq("id", rec.id)
          .eq("user_id", userId);
        if (!updateError) {
          advanced++;
          deactivated++;
        }
        continue;
      }

      // Avança next_run_on para depois da última data processada com sucesso
      const newNextRun = computeNextRun(lastProcessedDate, recLike);
      const shouldDeactivate = rec.end_on !== null && newNextRun > rec.end_on;

      const { error: updateError } = await sb
        .from("recurrences")
        .update({
          next_run_on: newNextRun,
          active: shouldDeactivate ? false : true,
        })
        .eq("id", rec.id)
        .eq("user_id", userId);

      if (!updateError) {
        advanced++;
        if (shouldDeactivate) deactivated++;
      }
    }

    return {
      created,
      skipped_already_materialized: skipped,
      recurrences_advanced: advanced,
      recurrences_deactivated: deactivated,
    };
  });
