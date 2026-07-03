/**
 * Server Functions — Regras de Classificação (memória do importador).
 *
 * Fluxo de aprendizado:
 *   1. Ao importar, resolveRulesForDescriptions() casa cada descrição contra as
 *      regras do usuário ANTES de acionar a IA (mais rápido, sem token, exato).
 *   2. Ao confirmar a importação, learnFromConfirmedRows() grava/reforça uma
 *      regra por lançamento — a próxima importação já vem classificada sozinha.
 *
 * A tabela classification_rules guarda o padrão SEMPRE normalizado. Toda
 * comparação passa por normalizePattern() para casar de forma robusta
 * (maiúsculas, acentos e espaços não atrapalham).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";

// ---------------------------------------------------------------------------
// Normalização — precisa ser idêntica na gravação e na leitura
// ---------------------------------------------------------------------------
export function normalizePattern(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deriva um padrão "aprendível" a partir de uma descrição bancária.
 * Remove ruído volátil (datas, números de parcela, sufixos de transação) para
 * que "UBER *TRIP 12/03" e "UBER *TRIP 15/04" gerem a MESMA regra.
 */
export function derivePattern(description: string): { pattern: string; match_type: "contains" } {
  let p = normalizePattern(description);
  // Remove tokens numéricos longos, datas e códigos de parcela comuns em extratos
  p = p
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, " ") // datas
    .replace(/\bparc(ela)?\s*\d+\/\d+/g, " ")  // "parcela 3/12"
    .replace(/\b\d{4,}\b/g, " ")               // números longos (ids, cartões)
    .replace(/\s+/g, " ")
    .trim();
  // Se sobrou muito pouco, usa a descrição normalizada inteira
  if (p.length < 3) p = normalizePattern(description);
  return { pattern: p, match_type: "contains" };
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
export interface ClassificationRule {
  id: string;
  pattern: string;
  match_type: "contains" | "exact" | "prefix";
  category_id: string;
  kind: "income" | "expense";
  hit_count: number;
}

export interface RuleMatch {
  category_id: string;
  confidence: "high"; // regra do próprio usuário = alta confiança
}

/**
 * Casa uma descrição normalizada contra uma lista de regras.
 * Precedência: exact > prefix > contains; desempate por hit_count.
 */
export function matchDescription(
  normalizedDesc: string,
  rules: ClassificationRule[],
): RuleMatch | null {
  const candidates = rules
    .filter((r) => {
      if (r.match_type === "exact") return normalizedDesc === r.pattern;
      if (r.match_type === "prefix") return normalizedDesc.startsWith(r.pattern);
      return normalizedDesc.includes(r.pattern); // contains
    })
    .sort((a, b) => {
      const rank = { exact: 3, prefix: 2, contains: 1 };
      if (rank[a.match_type] !== rank[b.match_type]) {
        return rank[b.match_type] - rank[a.match_type];
      }
      // Padrão mais longo é mais específico; depois hit_count
      if (a.pattern.length !== b.pattern.length) {
        return b.pattern.length - a.pattern.length;
      }
      return b.hit_count - a.hit_count;
    });

  const best = candidates[0];
  return best ? { category_id: best.category_id, confidence: "high" } : null;
}

// ---------------------------------------------------------------------------
// Server Function: listar regras do usuário (para a tela de gestão, Parte 3)
// ---------------------------------------------------------------------------
export interface RuleListItemDTO extends ClassificationRule {
  category_name: string;
  last_used_at: string;
}

export const listClassificationRules = createServerFn({ method: "GET" }).handler(
  async (): Promise<RuleListItemDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data, error } = await sb
      .from("classification_rules")
      .select("id, pattern, match_type, category_id, kind, hit_count, last_used_at, categories(name)")
      .eq("user_id", userId)
      .order("hit_count", { ascending: false });

    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      pattern: r.pattern as string,
      match_type: r.match_type as ClassificationRule["match_type"],
      category_id: r.category_id as string,
      kind: r.kind as "income" | "expense",
      hit_count: r.hit_count as number,
      last_used_at: r.last_used_at as string,
      category_name:
        (r.categories as { name?: string } | null)?.name ?? "(categoria removida)",
    }));
  },
);

// ---------------------------------------------------------------------------
// Server Function: deletar uma regra
// ---------------------------------------------------------------------------
export const deleteClassificationRule = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    const { error } = await sb
      .from("classification_rules")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Server Function: aprender com linhas confirmadas
// Chamada pela commitSmartImport após gravar os lançamentos.
// Faz upsert: se a regra já existe, incrementa hit_count; senão, cria.
// ---------------------------------------------------------------------------
const LearnInput = z.object({
  rows: z
    .array(
      z.object({
        description: z.string().min(1),
        category_id: z.string().uuid(),
        kind: z.enum(["income", "expense"]),
      }),
    )
    .min(1),
});

export const learnClassificationRules = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => LearnInput.parse(i))
  .handler(async ({ data }): Promise<{ learned: number }> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    // Agrupa por (pattern, category, kind) para não gravar a mesma regra N vezes
    const grouped = new Map<
      string,
      { pattern: string; category_id: string; kind: "income" | "expense"; count: number }
    >();

    for (const row of data.rows) {
      const { pattern } = derivePattern(row.description);
      if (pattern.length < 2) continue;
      const key = `${pattern}|${row.kind}|${row.category_id}`;
      const cur = grouped.get(key);
      if (cur) cur.count++;
      else grouped.set(key, { pattern, category_id: row.category_id, kind: row.kind, count: 1 });
    }

    let learned = 0;
    for (const g of grouped.values()) {
      // Existe regra para (user, pattern, contains, kind)?
      const { data: existing } = await sb
        .from("classification_rules")
        .select("id, hit_count, category_id")
        .eq("user_id", userId)
        .eq("pattern", g.pattern)
        .eq("match_type", "contains")
        .eq("kind", g.kind)
        .maybeSingle();

      if (existing) {
        // Reforça: incrementa hit_count e atualiza a categoria (última correção vence)
        await sb
          .from("classification_rules")
          .update({
            hit_count: (existing.hit_count as number) + g.count,
            category_id: g.category_id,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", existing.id as string);
      } else {
        await sb.from("classification_rules").insert({
          user_id: userId,
          pattern: g.pattern,
          match_type: "contains",
          category_id: g.category_id,
          kind: g.kind,
          hit_count: g.count,
        });
        learned++;
      }
    }

    return { learned };
  });

// ---------------------------------------------------------------------------
// Helper interno: carrega todas as regras do usuário (usado pelo importador).
// Não é uma server function — chamado de dentro de outra server function.
// ---------------------------------------------------------------------------
export async function loadUserRules(
  sb: { from: (t: string) => any }, // SupabaseClient admin
  userId: string,
): Promise<ClassificationRule[]> {
  const { data, error } = await sb
    .from("classification_rules")
    .select("id, pattern, match_type, category_id, kind, hit_count")
    .eq("user_id", userId);
  if (error) return [];
  return (data ?? []) as ClassificationRule[];
}
