/**
 * Server Functions — Importação de extratos CSV.
 *
 * CORREÇÕES em relação ao rascunho anterior:
 *  1. Usa getSupabaseAdmin() + resolveActiveUserId() — sem supabase browser.
 *  2. Hash via hashTransaction() (SHA-256/WebCrypto) — igual ao banco e à trigger.
 *  3. amount persiste como numeric(14,2) string ("150.00"), NÃO em centavos.
 *  4. account_id exigido no payload (NOT NULL no schema).
 *  5. type (debit/credit) derivado do kind — obrigatório no schema.
 *  6. source = 'import' — ativa a trigger de autohash no banco.
 *  7. category_id é UUID real ou null; constraint de integridade respeitada.
 *  8. Arquivo em src/services/ conforme padrão arquitetural do projeto.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import { hashTransaction } from "@/lib/finance/hash";
import { normalizeAmount } from "@/lib/finance/money";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ImportRowInput {
  /** ISO date YYYY-MM-DD */
  occurred_on: string;
  description: string;
  /** String numérica positiva (sinal ignorado — kind determina sentido). */
  amount_raw: string;
  kind: "income" | "expense";
  /** UUID da conta selecionada pelo usuário no formulário de importação. */
  account_id: string;
  /** UUID de categoria (obrigatório para income/expense — constraint no banco). */
  category_id: string;
  notes?: string | null;
}

export interface CheckedImportRow extends ImportRowInput {
  dedup_hash: string;
  is_duplicate: boolean;
}

// ---------------------------------------------------------------------------
// Server Function 1: checkDuplicates
// Recebe as linhas parseadas do CSV e devolve cada uma marcada com is_duplicate.
// ---------------------------------------------------------------------------

const CheckDuplicatesInput = z.object({
  account_id: z.string().uuid("Selecione uma conta válida."),
  rows: z
    .array(
      z.object({
        occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
        description: z.string().min(1),
        amount_raw: z.string().min(1),
        kind: z.enum(["income", "expense"]),
        category_id: z.string().uuid("Categoria inválida."),
        notes: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

export const checkImportDuplicates = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => CheckDuplicatesInput.parse(i))
  .handler(async ({ data }): Promise<CheckedImportRow[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    // Calcula hashes usando o mesmo algoritmo da trigger e do hash.ts
    const rowsWithHash = await Promise.all(
      data.rows.map(async (row) => {
        const amount = normalizeAmount(row.amount_raw);
        const type = row.kind === "income" ? "credit" : "debit";
        const dedup_hash = await hashTransaction({
          user_id: userId,
          account_id: data.account_id,
          occurred_on: row.occurred_on,
          amount,
          type,
          description: row.description,
        });
        return {
          ...row,
          account_id: data.account_id,
          dedup_hash,
          is_duplicate: false,
        } as CheckedImportRow & { dedup_hash: string };
      }),
    );

    // Consulta em lote: quais hashes já existem no banco?
    const hashes = rowsWithHash.map((r) => r.dedup_hash);
    const { data: existing, error } = await sb
      .from("transactions")
      .select("dedup_hash")
      .in("dedup_hash", hashes);

    if (error) throw new Error(`Falha ao checar duplicidades: ${error.message}`);

    const existingSet = new Set((existing ?? []).map((t) => t.dedup_hash));

    return rowsWithHash.map((row) => ({
      ...row,
      is_duplicate: existingSet.has(row.dedup_hash),
    }));
  });

// ---------------------------------------------------------------------------
// Server Function 2: commitImport
// Insere apenas as linhas não duplicadas.
// ---------------------------------------------------------------------------

const CommitImportInput = z.object({
  rows: z
    .array(
      z.object({
        occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().min(1),
        amount_raw: z.string().min(1),
        kind: z.enum(["income", "expense"]),
        account_id: z.string().uuid(),
        category_id: z.string().uuid(),
        dedup_hash: z.string().min(1),
        notes: z.string().nullable().optional(),
      }),
    )
    .min(1, "Nenhuma linha nova para importar."),
});

export const commitImport = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => CommitImportInput.parse(i))
  .handler(async ({ data }): Promise<{ inserted: number }> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { accountBelongsToUser } = await import("@/lib/finance/active-account.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    // Blindagem: garante que TODAS as linhas apontem para conta do próprio usuário
    const uniqueAccountIds = Array.from(new Set(data.rows.map((r) => r.account_id)));
    for (const accId of uniqueAccountIds) {
      const ok = await accountBelongsToUser(sb, userId, accId);
      if (!ok) throw new Error(`Conta ${accId} não pertence ao usuário ou foi arquivada.`);
    }

    const payload = data.rows.map((row) => ({
      user_id: userId,
      account_id: row.account_id,
      category_id: row.category_id,
      kind: row.kind,
      type: row.kind === "income" ? "credit" : "debit",
      amount: normalizeAmount(row.amount_raw),
      occurred_on: row.occurred_on,
      description: row.description,
      notes: row.notes ?? null,
      dedup_hash: row.dedup_hash,
      source: "import",
    }));

    const { error } = await sb.from("transactions").insert(payload);
    if (error) throw new Error(`Falha ao gravar transações: ${error.message}`);

    return { inserted: payload.length };
  });

// ---------------------------------------------------------------------------
// Server Function 3: getDefaultImportAccount
// Retorna a conta ativa padrão (mesma lógica do Chat IA) para pré-seleção.
// ---------------------------------------------------------------------------

export const getDefaultImportAccount = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; name: string; type: string } | null> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveAccount } = await import("@/lib/finance/active-account.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    try {
      const acc = await resolveActiveAccount(sb, userId);
      return acc;
    } catch {
      return null;
    }
  },
);

