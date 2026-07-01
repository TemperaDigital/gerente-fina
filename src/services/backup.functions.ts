/**
 * Server Functions — Backup / Restore (Governança de Dados).
 *
 * exportBackup: agrega accounts, categories e transactions do usuário
 * autenticado em um objeto JSON serializável.
 *
 * restoreBackup: valida com Zod ULTRA ESTRITO (formato numeric(14,2) real
 * para todos os decimais) e realiza upsert em blocos.
 *
 * Trilha de auditoria: persiste eventos na tabela `audit_log` (migration
 * 0007). Também mantém log estruturado no console para tracing.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// -----------------------------------------------------------------------------
// Schemas Zod — contrato do arquivo .fina-backup.json
// -----------------------------------------------------------------------------

/**
 * Formato numeric(14,2): opcional sinal, até 12 dígitos inteiros e até 2
 * decimais. Aceita string (canônico) OU number (convertido com toFixed(2)).
 */
const MONEY_RE = /^-?\d{1,12}(\.\d{1,2})?$/;
const MoneySchema = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const str = typeof v === "number" ? v.toFixed(2) : v.trim();
  if (!MONEY_RE.test(str)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Valor monetário inválido "${str}" — esperado formato numeric(14,2).`,
    });
    return z.NEVER;
  }
  return str;
});

const MoneyNullable = MoneySchema.nullable().optional();

const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  type: z.enum(["cash", "bank", "credit_card"]),
  currency: z.string().default("BRL"),
  credit_limit: MoneyNullable,
  closing_day: z.number().int().min(1).max(31).nullable().optional(),
  due_day: z.number().int().min(1).max(31).nullable().optional(),
  archived_at: z.string().nullable().optional(),
});

const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  kind: z.enum(["income", "expense"]),
  parent_id: z.string().uuid().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  archived_at: z.string().nullable().optional(),
});

const TransactionSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["income", "expense", "transfer", "invoice_payment"]),
  type: z.enum(["debit", "credit"]),
  amount: MoneySchema,
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  transfer_id: z.string().uuid().nullable().optional(),
  paid_invoice_id: z.string().uuid().nullable().optional(),
});

const BackupSchema = z.object({
  version: z.literal(1),
  generated_at: z.string(),
  accounts: z.array(AccountSchema).max(500),
  categories: z.array(CategorySchema).max(2000),
  transactions: z.array(TransactionSchema).max(50000),
});

export type BackupPayload = z.infer<typeof BackupSchema>;

// -----------------------------------------------------------------------------
// Audit helper — persiste em public.audit_log
// -----------------------------------------------------------------------------
async function writeAudit(
  userId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    await sb.from("audit_log").insert({ user_id: userId, action, payload });
  } catch (err) {
    // audit não deve derrubar a operação principal
    console.error(`[AUDIT] falha ao persistir ${action}:`, err);
  }
  console.info(`[AUDIT] ${action} user=${userId} ${JSON.stringify(payload)}`);
}

// -----------------------------------------------------------------------------
// exportBackup
// -----------------------------------------------------------------------------
export const exportBackup = createServerFn({ method: "GET" }).handler(
  async (): Promise<BackupPayload> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const [accRes, catRes, txRes] = await Promise.all([
      sb.from("accounts").select("id, name, type, currency, credit_limit, closing_day, due_day, archived_at").eq("user_id", userId),
      sb.from("categories").select("id, name, kind, parent_id, icon, color, archived_at").eq("user_id", userId),
      sb.from("transactions").select("id, account_id, category_id, kind, type, amount, occurred_on, description, notes, transfer_id, paid_invoice_id").eq("user_id", userId).order("occurred_on", { ascending: true }),
    ]);

    if (accRes.error) throw new Error(`accounts: ${accRes.error.message}`);
    if (catRes.error) throw new Error(`categories: ${catRes.error.message}`);
    if (txRes.error) throw new Error(`transactions: ${txRes.error.message}`);

    const payload: BackupPayload = {
      version: 1,
      generated_at: new Date().toISOString(),
      accounts: (accRes.data ?? []) as BackupPayload["accounts"],
      categories: (catRes.data ?? []) as BackupPayload["categories"],
      transactions: (txRes.data ?? []) as BackupPayload["transactions"],
    };

    await writeAudit(userId, "backup.export", {
      accounts: payload.accounts.length,
      categories: payload.categories.length,
      transactions: payload.transactions.length,
    });
    return payload;
  },
);

// -----------------------------------------------------------------------------
// restoreBackup
// -----------------------------------------------------------------------------
export interface RestoreReportDTO {
  accounts_upserted: number;
  categories_upserted: number;
  transactions_upserted: number;
}

export const restoreBackup = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const parsed = z.object({ payload: BackupSchema }).safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Arquivo de backup inválido: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }
    return parsed.data;
  })
  .handler(async ({ data }): Promise<RestoreReportDTO> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveUserId } = await import("@/lib/supabase/resolve-user");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { payload } = data;

    try {
      const accounts = payload.accounts.map((a) => ({ ...a, user_id: userId }));
      const categories = payload.categories.map((c) => ({ ...c, user_id: userId }));
      const transactions = payload.transactions.map((t) => ({ ...t, user_id: userId }));

      let accountsUp = 0;
      let categoriesUp = 0;
      let transactionsUp = 0;

      if (accounts.length > 0) {
        const { error, count } = await sb.from("accounts").upsert(accounts, { onConflict: "id", count: "exact" });
        if (error) throw new Error(`Falha ao restaurar contas: ${error.message}`);
        accountsUp = count ?? accounts.length;
      }
      if (categories.length > 0) {
        const { error, count } = await sb.from("categories").upsert(categories, { onConflict: "id", count: "exact" });
        if (error) throw new Error(`Falha ao restaurar categorias: ${error.message}`);
        categoriesUp = count ?? categories.length;
      }
      if (transactions.length > 0) {
        const chunk = 500;
        for (let i = 0; i < transactions.length; i += chunk) {
          const slice = transactions.slice(i, i + chunk);
          const { error, count } = await sb.from("transactions").upsert(slice, { onConflict: "id", count: "exact" });
          if (error) throw new Error(`Falha ao restaurar transações (bloco ${i}): ${error.message}`);
          transactionsUp += count ?? slice.length;
        }
      }

      const report: RestoreReportDTO = {
        accounts_upserted: accountsUp,
        categories_upserted: categoriesUp,
        transactions_upserted: transactionsUp,
      };
      await writeAudit(userId, "backup.restore", report);
      return report;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeAudit(userId, "backup.restore.failed", { error: message });
      throw err;
    }
  });
