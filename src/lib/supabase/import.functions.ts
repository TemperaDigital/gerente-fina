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
import {
  normalizePattern,
  derivePattern,
  matchDescription,
  loadUserRules,
  learnClassificationRules,
} from "@/lib/supabase/rules.functions";
import { extractInstallmentHint } from "@/lib/finance/csv-mapping";
import { estimateInstallmentSeries } from "@/lib/finance/installment-split";
import { computeInvoiceDueDate } from "@/lib/finance/invoice-due";
import { computeNextRun } from "@/lib/finance/recurrence-schedule";

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

    // Blindagem: idem para categoria (id escolhido pelo cliente)
    const uniqueCategoryIds = Array.from(new Set(data.rows.map((r) => r.category_id)));
    const { data: ownedCats, error: catOwnErr } = await sb
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .in("id", uniqueCategoryIds);
    if (catOwnErr) throw new Error(catOwnErr.message);
    const ownedCatSet = new Set((ownedCats ?? []).map((c) => c.id as string));
    for (const id of uniqueCategoryIds) {
      if (!ownedCatSet.has(id)) throw new Error(`Categoria ${id} não pertence ao usuário.`);
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

// ===========================================================================
// IMPORTADOR INTELIGENTE (Parte 1 — classificação por IA)
// ===========================================================================
// classifyAndCheckImport: hash + dedup + classificação IA em UMA chamada.
// commitSmartImport: cria categorias novas aprovadas e grava os lançamentos.
// Usa o mesmo Lovable AI Gateway do /chat (LOVABLE_API_KEY).
// ===========================================================================

export interface SmartImportRow {
  occurred_on: string;
  description: string;
  amount_raw: string;
  kind: "income" | "expense";
  account_id: string;
  dedup_hash: string;
  is_duplicate: boolean;
  /** UUID de categoria existente sugerida pela IA (null se nenhuma serviu). */
  suggested_category_id: string | null;
  /** Nome de categoria NOVA proposta pela IA (null se usou existente). */
  suggested_new_category: string | null;
  /** Confiança da IA na sugestão. */
  confidence: "high" | "medium" | "low";
  notes?: string | null;
  /**
   * Parcelamento já cadastrado que corresponde a esta linha (mesma conta,
   * mesma quantidade de parcelas, descrição normalizada semelhante) — quando
   * presente, a UI oferece "Vincular ao parcelamento existente". NUNCA cria
   * estrutura nova quando já existe uma correspondente.
   */
  matched_installment_purchase_id: string | null;
  matched_installment_purchase_description: string | null;
  /**
   * true somente quando a linha é a parcela 1/N (início real da compra) e
   * NENHUM parcelamento correspondente foi encontrado — UI oferece
   * "Criar novo parcelamento". Parcelas no meio da série (ex: 8/10) sem
   * correspondência NÃO oferecem criação — evita reconstruir histórico.
   */
  offer_create_installment: boolean;
  /**
   * Recorrência já cadastrada que corresponde a esta linha — vínculo
   * SILENCIOSO (sem ação de UI): o motor de materialização já cuida dos
   * próximos meses, esta ocorrência só entra vinculada a ela.
   */
  matched_recurrence_id: string | null;
  /**
   * true quando a linha parece assinatura/recorrente (categoria
   * "assinaturas" OU descrição+valor idênticos em meses anteriores já
   * importados) mas NENHUMA recorrência correspondente foi encontrada — UI
   * oferece "Converter em recorrência mensal".
   */
  offer_convert_recurrence: boolean;
}

const SmartClassifyInput = z.object({
  account_id: z.string().uuid("Selecione uma conta válida."),
  rows: z
    .array(
      z.object({
        occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
        description: z.string().min(1),
        amount_raw: z.string().min(1),
        kind: z.enum(["income", "expense"]),
      }),
    )
    .min(1)
    .max(400, "Máximo de 400 linhas por importação."),
});

/** Regra determinística legada (mesma do /chat): temperos e grãos. */
function matchesTemperoRuleImport(description: string): boolean {
  const n = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return n.includes("mariareniele") || n.includes("maria reniele") || n.includes("woshington");
}

/** Categoria com nome sugerindo assinatura/recorrência (ex: "Assinaturas Digitais"). */
function looksLikeSubscriptionCategoryName(name: string | undefined | null): boolean {
  return !!name && normalizePattern(name).includes("assinatura");
}

interface AiClassification {
  index: number;
  category_id?: string;
  new_category?: string;
  confidence?: "high" | "medium" | "low";
}

/**
 * Classifica um lote de linhas via Lovable AI Gateway.
 *
 * Sem LOVABLE_API_KEY configurada: retorna vazio silenciosamente — fluxo
 * manual é o comportamento esperado, não um erro. Qualquer OUTRA falha
 * (rede, HTTP não-ok, resposta em formato inesperado) agora PROPAGA como
 * exceção — GF-001 tornou cada lote uma chamada isolada disparada pelo
 * cliente, e o cliente precisa distinguir "este lote falhou, tente de novo"
 * de "sugestão vazia porque a IA não está configurada".
 */
async function classifyBatchWithAI(
  batch: Array<{ index: number; description: string; amount: string; kind: string }>,
  categories: Array<{ id: string; name: string; kind: string }>,
): Promise<Map<number, AiClassification>> {
  const result = new Map<number, AiClassification>();
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return result; // sem chave: fluxo segue manual

  const categoryList = categories.map((c) => `- ${c.id} | ${c.name} | ${c.kind}`).join("\n");

  const systemPrompt = `Você é um classificador contábil brasileiro especializado em extratos bancários e faturas de cartão.
Sua tarefa: para CADA transação da lista, escolher a categoria mais adequada.

CATEGORIAS EXISTENTES DO USUÁRIO (id | nome | tipo):
${categoryList || "(nenhuma cadastrada ainda)"}

REGRAS:
1. Priorize SEMPRE uma categoria existente cujo "tipo" seja igual ao "kind" da transação.
2. Se NENHUMA existente servir bem, proponha uma NOVA com nome curto em pt-BR (ex: "Transporte", "Saúde", "Assinaturas", "Salário"). Não proponha nomes duplicados de existentes.
3. Reconheça padrões brasileiros: PIX, TED, DOC, iFood/Rappi=Alimentação, Uber/99=Transporte, postos=Transporte, farmácias=Saúde, Netflix/Spotify=Assinaturas, supermercados=Alimentação, salário/PGTO=Salário.
4. confidence: "high" quando o padrão é óbvio, "medium" quando provável, "low" quando é chute.
5. CHAME a ferramenta classify_transactions exatamente UMA vez com TODAS as classificações.`;

  const userContent = batch
    .map((r) => `${r.index}: [${r.kind}] R$ ${r.amount} — ${r.description}`)
    .join("\n");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "classify_transactions",
            description: "Retorna a classificação de todas as transações do lote.",
            parameters: {
              type: "object",
              properties: {
                classifications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "integer" },
                      category_id: {
                        type: "string",
                        description: "UUID de categoria EXISTENTE, se alguma servir",
                      },
                      new_category: {
                        type: "string",
                        description: "Nome de categoria NOVA, apenas se nenhuma existente servir",
                      },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["index"],
                  },
                },
              },
              required: ["classifications"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "classify_transactions" } },
    }),
  });

  if (!resp.ok) {
    throw new Error(`IA indisponível (HTTP ${resp.status}) ao classificar este lote.`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{
      message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
    }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) {
    throw new Error("IA não retornou classificação para este lote.");
  }

  let parsed: { classifications?: AiClassification[] };
  try {
    parsed = JSON.parse(args) as { classifications?: AiClassification[] };
  } catch {
    throw new Error("IA retornou uma resposta em formato inesperado para este lote.");
  }
  for (const c of parsed.classifications ?? []) {
    if (typeof c.index === "number") result.set(c.index, c);
  }
  return result;
}

/** Uma linha pronta para ser enviada a um lote de classifyImportBatch. */
export interface ImportClassificationBatchItem {
  index: number;
  description: string;
  amount: string;
  kind: "income" | "expense";
  /** Já true na preparação (heurística de repetição em meses anteriores) — preservado mesmo se a IA falhar. */
  offer_convert_recurrence_baseline: boolean;
  /** true quando já casou com uma recorrência existente — nunca oferece converter. */
  has_recurrence_match: boolean;
}

/**
 * prepareImportClassification — GF-001 (parte 1/2): faz todo o trabalho
 * determinístico e barato (hash, dedup, regras aprendidas, vínculo
 * estrutural de parcelamento/recorrência) e devolve os lotes que ainda
 * precisam de IA para o cliente disparar um a um contra classifyImportBatch.
 * Substitui o antigo classifyAndCheckImport monolítico, que rodava todos os
 * lotes de IA em sequência DENTRO de uma única invocação — risco real de
 * timeout do Worker em arquivos grandes (ver ATUALIZACOES-UNIFICADO.md, GF-001).
 */
export const prepareImportClassification = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SmartClassifyInput.parse(i))
  .handler(async ({
    data,
  }): Promise<{ rows: SmartImportRow[]; batches: ImportClassificationBatchItem[][] }> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { accountBelongsToUser } = await import("@/lib/finance/active-account.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const okAccount = await accountBelongsToUser(sb, userId, data.account_id);
    if (!okAccount) throw new Error("Conta não pertence ao usuário ou foi arquivada.");

    // 1. Categorias existentes (para a IA e para validar as respostas dela)
    const { data: cats, error: catErr } = await sb
      .from("categories")
      .select("id, name, kind")
      .eq("user_id", userId)
      .is("archived_at", null);
    if (catErr) throw new Error(`Falha ao ler categorias: ${catErr.message}`);
    const categories = cats ?? [];
    const temperoCat = categories.find((c) => c.name.toLowerCase().includes("mercearia"));

    // 2. Hash + dedup (mesma lógica do checkImportDuplicates)
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
        return { ...row, dedup_hash };
      }),
    );

    const hashes = rowsWithHash.map((r) => r.dedup_hash);
    const { data: existing, error: dupErr } = await sb
      .from("transactions")
      .select("dedup_hash")
      .in("dedup_hash", hashes);
    if (dupErr) throw new Error(`Falha ao checar duplicidades: ${dupErr.message}`);
    const existingSet = new Set((existing ?? []).map((t) => t.dedup_hash));

    // 2.5. Regras aprendidas do usuário — precedência sobre a IA, mas não sobre
    //      a regra determinística legada do tempero (checada mais abaixo).
    const userRules = await loadUserRules(sb, userId);
    const ruleMatches = new Map<number, { category_id: string; confidence: "high" }>();
    rowsWithHash.forEach((row, index) => {
      if (existingSet.has(row.dedup_hash)) return;
      if (matchesTemperoRuleImport(row.description) && temperoCat) return;
      const norm = normalizePattern(row.description);
      const rulesForKind = userRules.filter((r) => r.kind === row.kind);
      const match = matchDescription(norm, rulesForKind);
      if (!match) return;
      const cat = categories.find((c) => c.id === match.category_id);
      if (!cat || cat.kind !== row.kind) return; // categoria removida/kind trocado: deixa a IA decidir
      ruleMatches.set(index, match);
    });

    // 2.6. Vínculo estrutural (parcelamento/recorrência) — NUNCA cria
    //      estrutura nova sem antes tentar casar com uma já existente.
    const { data: accountRow } = await sb
      .from("accounts")
      .select("type, closing_day, due_day")
      .eq("id", data.account_id)
      .eq("user_id", userId)
      .maybeSingle();
    const isCardAccount = accountRow?.type === "credit_card";

    const { data: purchaseCandidates } = isCardAccount
      ? await sb
          .from("installment_purchases")
          .select("id, description, installments_count")
          .eq("account_id", data.account_id)
          .eq("user_id", userId)
          .eq("status", "active")
      : { data: [] as Array<{ id: string; description: string; installments_count: number }> };

    const { data: recurrenceCandidates } = await sb
      .from("recurrences")
      .select("id, description, kind")
      .eq("account_id", data.account_id)
      .eq("user_id", userId)
      .eq("active", true);

    // Últimas transações da conta — heurística "descrição+valor repetidos em
    // meses anteriores" para sugerir recorrência quando a categoria não
    // deixa isso óbvio por si só.
    const { data: priorTx } = await sb
      .from("transactions")
      .select("description, amount, kind, occurred_on")
      .eq("account_id", data.account_id)
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .limit(500);

    const installmentMatches = new Map<number, { purchase_id: string; description: string }>();
    const installmentCreateOffers = new Set<number>();
    const recurrenceMatches = new Map<number, string>();
    const recurrenceConvertOffers = new Set<number>();

    rowsWithHash.forEach((row, index) => {
      if (existingSet.has(row.dedup_hash)) return;

      const hint = extractInstallmentHint(row.description);
      if (hint && isCardAccount) {
        const rowPattern = derivePattern(row.description).pattern;
        const match = (purchaseCandidates ?? []).find(
          (p) =>
            p.installments_count === hint.total &&
            derivePattern(p.description).pattern === rowPattern,
        );
        if (match) {
          installmentMatches.set(index, { purchase_id: match.id, description: match.description });
        } else if (hint.current === 1 && hint.total >= 2) {
          // total < 2 (ex.: "1/1") não é parcelamento de verdade — nada a criar.
          installmentCreateOffers.add(index);
        }
        return; // linha de parcelamento nunca também vira candidata a recorrência
      }

      const rowPattern = derivePattern(row.description).pattern;
      const recMatch = (recurrenceCandidates ?? []).find(
        (r) => r.kind === row.kind && derivePattern(r.description).pattern === rowPattern,
      );
      if (recMatch) {
        recurrenceMatches.set(index, recMatch.id);
        return;
      }

      // Heurística "descrição+valor repetidos em meses anteriores" — não
      // depende da classificação da IA, então já dá pra checar aqui. A OUTRA
      // heurística ("categoria assinaturas") só é possível depois que a
      // categoria final é resolvida (regra aprendida OU IA) — ver step 4.
      const normalizedDesc = normalizePattern(row.description);
      const rowAmountCanonical = normalizeAmount(row.amount_raw);
      const hasPriorOccurrence = (priorTx ?? []).some(
        (t) =>
          t.kind === row.kind &&
          t.occurred_on < row.occurred_on &&
          normalizePattern(t.description ?? "") === normalizedDesc &&
          normalizeAmount(t.amount) === rowAmountCanonical,
      );
      if (hasPriorOccurrence) recurrenceConvertOffers.add(index);
    });

    // 3. Linhas que ainda precisam de classificação por IA (não duplicadas,
    //    não resolvidas por regra) — GF-001: em vez de classificar tudo numa
    //    única chamada de servidor (risco de timeout em arquivos grandes),
    //    devolve os lotes prontos para o CLIENTE disparar um a um contra
    //    classifyImportBatch, com barra de progresso e erro isolado por lote.
    const toClassify = rowsWithHash
      .map((r, index) => ({ r, index }))
      .filter(({ r, index }) => !existingSet.has(r.dedup_hash) && !ruleMatches.has(index));
    const needsAi = new Set(toClassify.map(({ index }) => index));

    const BATCH = 40;
    const batches: ImportClassificationBatchItem[][] = [];
    for (let i = 0; i < toClassify.length; i += BATCH) {
      batches.push(
        toClassify.slice(i, i + BATCH).map(({ r, index }) => ({
          index,
          description: r.description,
          amount: normalizeAmount(r.amount_raw),
          kind: r.kind,
          offer_convert_recurrence_baseline: recurrenceConvertOffers.has(index),
          has_recurrence_match: recurrenceMatches.has(index),
        })),
      );
    }

    // 4. Monta o resultado para TODA linha já resolvível sem IA (duplicata,
    //    regra determinística/aprendida). Linhas que precisam de IA saem com
    //    suggested_* nulos — o cliente patcheia via classifyImportBatch.
    const rows: SmartImportRow[] = rowsWithHash.map((row, index) => {
      const isDup = existingSet.has(row.dedup_hash);
      let suggested_category_id: string | null = null;
      const suggested_new_category: string | null = null;
      let confidence: "high" | "medium" | "low" = "low";
      let notes: string | null = null;

      // Regra determinística legada tem precedência (temperos)
      if (!isDup && matchesTemperoRuleImport(row.description) && temperoCat) {
        suggested_category_id = temperoCat.id;
        confidence = "high";
        notes = "Compra de temperos e Graos";
      } else if (!isDup && ruleMatches.has(index)) {
        // Regra aprendida do usuário tem precedência sobre a IA
        const match = ruleMatches.get(index)!;
        suggested_category_id = match.category_id;
        confidence = match.confidence;
      }

      // Heurística "categoria assinaturas" — só dá pra resolver aqui quando a
      // categoria final NÃO depende de IA (senão classifyImportBatch decide).
      let offerConvertRecurrence = !isDup && recurrenceConvertOffers.has(index);
      if (!isDup && !offerConvertRecurrence && !recurrenceMatches.has(index) && !needsAi.has(index)) {
        const finalCatName = suggested_category_id
          ? categories.find((c) => c.id === suggested_category_id)?.name
          : suggested_new_category;
        if (looksLikeSubscriptionCategoryName(finalCatName)) offerConvertRecurrence = true;
      }

      const installmentMatch = !isDup ? installmentMatches.get(index) : undefined;

      return {
        occurred_on: row.occurred_on,
        description: row.description,
        amount_raw: row.amount_raw,
        kind: row.kind,
        account_id: data.account_id,
        dedup_hash: row.dedup_hash,
        is_duplicate: isDup,
        suggested_category_id,
        suggested_new_category,
        confidence,
        notes,
        matched_installment_purchase_id: installmentMatch?.purchase_id ?? null,
        matched_installment_purchase_description: installmentMatch?.description ?? null,
        offer_create_installment: !isDup && installmentCreateOffers.has(index),
        matched_recurrence_id: !isDup ? (recurrenceMatches.get(index) ?? null) : null,
        offer_convert_recurrence: offerConvertRecurrence,
      };
    });

    return { rows, batches };
  });

// ---------------------------------------------------------------------------
// classifyImportBatch — GF-001: classifica UM lote (até 40 linhas) por vez.
// Chamado repetidamente pelo cliente (loop sequencial com barra de progresso)
// em vez de tudo numa chamada só — evita a server function ficar presa numa
// sequência longa de chamadas de IA e permite mostrar erro por lote em vez de
// derrubar a importação inteira quando um lote falha.
// ---------------------------------------------------------------------------

const ImportClassifyBatchInput = z.object({
  account_id: z.string().uuid("Selecione uma conta válida."),
  batch: z
    .array(
      z.object({
        index: z.number().int().min(0),
        description: z.string().min(1),
        amount: z.string().min(1),
        kind: z.enum(["income", "expense"]),
        offer_convert_recurrence_baseline: z.boolean(),
        has_recurrence_match: z.boolean(),
      }),
    )
    .min(1)
    .max(40, "Lote de classificação não pode exceder 40 linhas."),
});

export interface ImportClassificationPatch {
  index: number;
  suggested_category_id: string | null;
  suggested_new_category: string | null;
  confidence: "high" | "medium" | "low";
  offer_convert_recurrence: boolean;
}

export const classifyImportBatch = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ImportClassifyBatchInput.parse(i))
  .handler(async ({ data }): Promise<ImportClassificationPatch[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { accountBelongsToUser } = await import("@/lib/finance/active-account.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const okAccount = await accountBelongsToUser(sb, userId, data.account_id);
    if (!okAccount) throw new Error("Conta não pertence ao usuário ou foi arquivada.");

    const { data: cats, error: catErr } = await sb
      .from("categories")
      .select("id, name, kind")
      .eq("user_id", userId)
      .is("archived_at", null);
    if (catErr) throw new Error(`Falha ao ler categorias: ${catErr.message}`);
    const categories = cats ?? [];
    const validCatIds = new Set(categories.map((c) => c.id));
    const catNamesLower = new Set(categories.map((c) => c.name.toLowerCase()));

    // Se falhar (rede, HTTP, formato), classifyBatchWithAI agora LANÇA — a
    // exceção sobe intacta pro cliente, que mostra o erro preso a este lote
    // específico (não ao import inteiro) e permite tentar de novo só ele.
    const aiResults = await classifyBatchWithAI(
      data.batch.map((b) => ({
        index: b.index,
        description: b.description,
        amount: b.amount,
        kind: b.kind,
      })),
      categories,
    );

    return data.batch.map((item): ImportClassificationPatch => {
      let suggested_category_id: string | null = null;
      let suggested_new_category: string | null = null;
      let confidence: "high" | "medium" | "low" = "low";

      const ai = aiResults.get(item.index);
      if (ai?.category_id && validCatIds.has(ai.category_id)) {
        // Valida que a categoria sugerida tem o kind certo
        const cat = categories.find((c) => c.id === ai.category_id);
        if (cat?.kind === item.kind) {
          suggested_category_id = ai.category_id;
          confidence = ai.confidence ?? "medium";
        }
      }
      if (!suggested_category_id && ai?.new_category) {
        const cleaned = ai.new_category.trim().slice(0, 60);
        // Não propõe nome que já existe (IA às vezes erra nisso)
        if (cleaned && !catNamesLower.has(cleaned.toLowerCase())) {
          suggested_new_category = cleaned;
          confidence = ai.confidence ?? "medium";
        }
      }

      // Heurística "categoria assinaturas" resolvida agora que a categoria
      // final (vinda da IA) já é conhecida — baseline já cobre os outros casos.
      let offerConvertRecurrence = item.offer_convert_recurrence_baseline;
      if (!offerConvertRecurrence && !item.has_recurrence_match) {
        const finalCatName = suggested_category_id
          ? categories.find((c) => c.id === suggested_category_id)?.name
          : suggested_new_category;
        if (looksLikeSubscriptionCategoryName(finalCatName)) offerConvertRecurrence = true;
      }

      return {
        index: item.index,
        suggested_category_id,
        suggested_new_category,
        confidence,
        offer_convert_recurrence: offerConvertRecurrence,
      };
    });
  });

// ---------------------------------------------------------------------------
// commitSmartImport — cria categorias novas aprovadas e grava os lançamentos.
// Cada linha traz OU category_id (existente) OU new_category_name (a criar).
// ---------------------------------------------------------------------------

const StructuralActionInput = z.union([
  z.object({
    type: z.literal("link_installment"),
    purchase_id: z.string().uuid(),
    installment_number: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("create_installment"),
    installments_count: z.number().int().min(2).max(360),
  }),
  z.object({ type: z.literal("convert_recurrence") }),
]);

const SmartCommitInput = z.object({
  rows: z
    .array(
      z
        .object({
          occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          description: z.string().min(1),
          amount_raw: z.string().min(1),
          kind: z.enum(["income", "expense"]),
          account_id: z.string().uuid(),
          dedup_hash: z.string().min(1),
          category_id: z.string().uuid().nullable().optional(),
          new_category_name: z.string().min(1).max(60).nullable().optional(),
          notes: z.string().nullable().optional(),
          /** Vínculo estrutural escolhido pelo usuário na pré-visualização — nunca cria sem tentar casar primeiro (já feito em classifyAndCheckImport). */
          structural_action: StructuralActionInput.nullable().optional(),
          /** Recorrência já existente casada automaticamente — vínculo silencioso, sem ação do usuário. */
          matched_recurrence_id: z.string().uuid().nullable().optional(),
        })
        .refine((r) => r.category_id || r.new_category_name, {
          message: "Cada linha precisa de uma categoria (existente ou nova).",
        }),
    )
    .min(1, "Nenhuma linha para importar."),
});

export const commitSmartImport = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SmartCommitInput.parse(i))
  .handler(
    async ({
      data,
    }): Promise<{
      inserted: number;
      categories_created: number;
      installments_linked: number;
      installments_created: number;
      recurrences_created: number;
      warnings: string[];
    }> => {
      const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
      const { accountBelongsToUser } = await import("@/lib/finance/active-account.server");
      const sb = getSupabaseAdmin();
      const userId = await resolveActiveUserId();

      // Blindagem de conta
      const uniqueAccountIds = Array.from(new Set(data.rows.map((r) => r.account_id)));
      for (const accId of uniqueAccountIds) {
        const ok = await accountBelongsToUser(sb, userId, accId);
        if (!ok) throw new Error(`Conta ${accId} não pertence ao usuário.`);
      }

      // Blindagem de categoria/recorrência existentes (ids escolhidos pelo
      // cliente) — nunca confia em ids vindos do request sem checar dono.
      const uniqueCategoryIds = Array.from(
        new Set(data.rows.map((r) => r.category_id).filter((id): id is string => !!id)),
      );
      if (uniqueCategoryIds.length > 0) {
        const { data: ownedCats, error: catOwnErr } = await sb
          .from("categories")
          .select("id")
          .eq("user_id", userId)
          .in("id", uniqueCategoryIds);
        if (catOwnErr) throw new Error(catOwnErr.message);
        const ownedCatSet = new Set((ownedCats ?? []).map((c) => c.id as string));
        for (const id of uniqueCategoryIds) {
          if (!ownedCatSet.has(id)) throw new Error(`Categoria ${id} não pertence ao usuário.`);
        }
      }

      const uniqueRecurrenceIds = Array.from(
        new Set(data.rows.map((r) => r.matched_recurrence_id).filter((id): id is string => !!id)),
      );
      if (uniqueRecurrenceIds.length > 0) {
        const { data: ownedRecs, error: recOwnErr } = await sb
          .from("recurrences")
          .select("id")
          .eq("user_id", userId)
          .in("id", uniqueRecurrenceIds);
        if (recOwnErr) throw new Error(recOwnErr.message);
        const ownedRecSet = new Set((ownedRecs ?? []).map((r) => r.id as string));
        for (const id of uniqueRecurrenceIds) {
          if (!ownedRecSet.has(id)) throw new Error(`Recorrência ${id} não pertence ao usuário.`);
        }
      }

      // 1. Resolve categorias novas: agrupa por (nome+kind), cria uma vez só.
      //    Case-insensitive e reaproveita se já existir no banco (corrida segura).
      const newCatKeys = new Map<string, { name: string; kind: "income" | "expense" }>();
      for (const row of data.rows) {
        if (!row.category_id && row.new_category_name) {
          const key = `${row.new_category_name.trim().toLowerCase()}|${row.kind}`;
          if (!newCatKeys.has(key)) {
            newCatKeys.set(key, { name: row.new_category_name.trim(), kind: row.kind });
          }
        }
      }

      const createdMap = new Map<string, string>(); // key → category_id
      let categoriesCreated = 0;

      for (const [key, cat] of newCatKeys) {
        // Já existe com esse nome/kind? (evita duplicar em importações repetidas)
        const { data: found } = await sb
          .from("categories")
          .select("id")
          .eq("user_id", userId)
          .eq("kind", cat.kind)
          .ilike("name", cat.name)
          .is("archived_at", null)
          .limit(1);

        if (found?.[0]?.id) {
          createdMap.set(key, found[0].id);
          continue;
        }

        const { data: created, error: createErr } = await sb
          .from("categories")
          // Categoria criada automaticamente pelo importador: "VARIÁVEL" por
          // padrão (maioria dos casos reais); usuário reclassifica manualmente
          // como FIXA depois, em /categories, quando perceber a exceção.
          .insert({ user_id: userId, name: cat.name, kind: cat.kind, nature: "VARIÁVEL" })
          .select("id")
          .single();
        if (createErr)
          throw new Error(`Falha ao criar categoria "${cat.name}": ${createErr.message}`);
        createdMap.set(key, created.id);
        categoriesCreated++;
      }

      // 1.5. Vínculo estrutural — PRÉ-PASSO. Cria recorrência/parcelamento
      // ANTES de inserir as transações (nenhum dos dois depende do id da
      // transação ainda), guardando o que cada linha vai precisar depois de
      // inserida. NUNCA cria estrutura nova para "link_installment" — nesse
      // caso só localizamos o item já existente a preencher.
      const warnings: string[] = [];
      let recurrencesCreated = 0;
      let installmentsCreated = 0;
      let installmentsLinked = 0;

      // rowIndex → recurrence_id a gravar direto no insert da transação
      const recurrenceIdByRow = new Map<number, string>();
      // rowIndex → id do installment_items cujo transaction_id precisa ser
      // preenchido DEPOIS que a transação for inserida (link OU criação nova)
      const pendingItemLinkByRow = new Map<number, string>();

      for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i];

        if (row.matched_recurrence_id) {
          recurrenceIdByRow.set(i, row.matched_recurrence_id);
          continue;
        }

        const action = row.structural_action;
        if (!action) continue;

        if (action.type === "convert_recurrence") {
          const dayOfMonth = Number(row.occurred_on.split("-")[2]);
          const nextRun = computeNextRun(row.occurred_on, {
            frequency: "monthly",
            interval_count: 1,
            day_of_month: dayOfMonth,
          });
          const categoryId =
            row.category_id ??
            createdMap.get(`${(row.new_category_name ?? "").trim().toLowerCase()}|${row.kind}`) ??
            null;
          if (!categoryId) {
            warnings.push(
              `Linha "${row.description}": sem categoria resolvida, recorrência não criada.`,
            );
            continue;
          }
          const { data: rec, error: recErr } = await sb
            .from("recurrences")
            .insert({
              user_id: userId,
              account_id: row.account_id,
              category_id: categoryId,
              kind: row.kind,
              type: row.kind === "income" ? "credit" : "debit",
              amount: normalizeAmount(row.amount_raw),
              description: row.description,
              frequency: "monthly",
              interval_count: 1,
              day_of_month: dayOfMonth,
              start_on: row.occurred_on,
              next_run_on: nextRun,
            })
            .select("id")
            .single();
          if (recErr) {
            warnings.push(
              `Linha "${row.description}": falha ao criar recorrência (${recErr.message}).`,
            );
            continue;
          }
          recurrenceIdByRow.set(i, rec.id);
          recurrencesCreated++;
        } else if (action.type === "link_installment") {
          const { data: targetItem, error: itemErr } = await sb
            .from("installment_items")
            .select("id")
            .eq("purchase_id", action.purchase_id)
            .eq("installment_number", action.installment_number)
            .eq("user_id", userId)
            .is("transaction_id", null)
            .maybeSingle();
          if (itemErr || !targetItem) {
            warnings.push(
              `Linha "${row.description}": parcela ${action.installment_number} não encontrada no parcelamento (ou já vinculada) — importada como lançamento simples.`,
            );
            continue;
          }
          pendingItemLinkByRow.set(i, targetItem.id);
        } else if (action.type === "create_installment") {
          const categoryId =
            row.category_id ??
            createdMap.get(`${(row.new_category_name ?? "").trim().toLowerCase()}|${row.kind}`) ??
            null;
          if (!categoryId) {
            warnings.push(
              `Linha "${row.description}": sem categoria resolvida, parcelamento não criado.`,
            );
            continue;
          }

          const { data: accRow } = await sb
            .from("accounts")
            .select("closing_day, due_day")
            .eq("id", row.account_id)
            .eq("user_id", userId)
            .maybeSingle();

          const { totalAmount, amounts } = estimateInstallmentSeries(
            normalizeAmount(row.amount_raw),
            action.installments_count,
          );

          const { data: purchase, error: purchaseErr } = await sb
            .from("installment_purchases")
            .insert({
              user_id: userId,
              account_id: row.account_id,
              category_id: categoryId,
              description: row.description,
              total_amount: totalAmount,
              installments_count: action.installments_count,
              purchased_on: row.occurred_on,
            })
            .select("id")
            .single();
          if (purchaseErr) {
            warnings.push(
              `Linha "${row.description}": falha ao criar parcelamento (${purchaseErr.message}).`,
            );
            continue;
          }

          const [py, pm, pd] = row.occurred_on.split("-").map(Number);
          const purchaseDate = new Date(py, pm - 1, pd);
          let firstItemId: string | null = null;

          for (let n = 1; n <= action.installments_count; n++) {
            const installmentDate = new Date(purchaseDate);
            installmentDate.setMonth(installmentDate.getMonth() + (n - 1));
            const dueDate =
              accRow?.closing_day && accRow?.due_day
                ? computeInvoiceDueDate({
                    purchaseDate: installmentDate,
                    closingDay: accRow.closing_day,
                    dueDay: accRow.due_day,
                  })
                : installmentDate;
            const dueStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}-${String(dueDate.getDate()).padStart(2, "0")}`;

            const { data: item, error: itemErr } = await sb
              .from("installment_items")
              .insert({
                user_id: userId,
                purchase_id: purchase.id,
                installment_number: n,
                amount: amounts[n - 1],
                due_date: dueStr,
              })
              .select("id")
              .single();
            if (itemErr) {
              warnings.push(
                `Parcela ${n}/${action.installments_count} de "${row.description}": ${itemErr.message}`,
              );
              continue;
            }
            if (n === 1) firstItemId = item.id;
          }

          if (firstItemId) {
            pendingItemLinkByRow.set(i, firstItemId);
            installmentsCreated++;
          }
        }
      }

      // 2. Monta payload final com todas as categorias resolvidas
      const payload = data.rows.map((row, i) => {
        let categoryId = row.category_id ?? null;
        if (!categoryId && row.new_category_name) {
          const key = `${row.new_category_name.trim().toLowerCase()}|${row.kind}`;
          categoryId = createdMap.get(key) ?? null;
        }
        if (!categoryId) {
          throw new Error(`Linha "${row.description}" ficou sem categoria resolvida.`);
        }
        return {
          user_id: userId,
          account_id: row.account_id,
          category_id: categoryId,
          kind: row.kind,
          type: row.kind === "income" ? "credit" : "debit",
          amount: normalizeAmount(row.amount_raw),
          occurred_on: row.occurred_on,
          description: row.description,
          notes: row.notes ?? null,
          dedup_hash: row.dedup_hash,
          source: "import",
          recurrence_id: recurrenceIdByRow.get(i) ?? null,
        };
      });

      const { data: insertedRows, error } = await sb
        .from("transactions")
        .insert(payload)
        .select("id, dedup_hash");
      if (error) throw new Error(`Falha ao gravar transações: ${error.message}`);

      // Correlaciona por dedup_hash (único por linha) em vez de confiar na
      // ordem de retorno do insert em lote — mais seguro que indexação posicional.
      const txIdByHash = new Map(
        (insertedRows ?? []).map((r) => [r.dedup_hash as string, r.id as string]),
      );

      // 3. Pós-passo: agora que temos os ids das transações recém-inseridas,
      // preenche installment_items pendentes de vínculo (link OU primeira
      // parcela de criação nova).
      for (const [rowIndex, itemId] of pendingItemLinkByRow) {
        const txId = txIdByHash.get(data.rows[rowIndex].dedup_hash);
        if (!txId) continue;
        const { data: updated, error: linkErr } = await sb
          .from("installment_items")
          .update({ transaction_id: txId })
          .eq("id", itemId)
          .eq("user_id", userId)
          .is("transaction_id", null)
          .select("id");
        if (linkErr || !updated?.length) {
          warnings.push(
            `Linha "${data.rows[rowIndex].description}": falha ao vincular a parcela (${linkErr?.message ?? "já vinculada por outra transação"}).`,
          );
        } else if (data.rows[rowIndex].structural_action?.type === "link_installment") {
          installmentsLinked++;
        }
      }

      // Aprende com as linhas confirmadas (best-effort — não pode derrubar
      // uma importação que já foi gravada com sucesso).
      try {
        await learnClassificationRules({
          data: {
            rows: payload.map((p) => ({
              description: p.description,
              category_id: p.category_id,
              kind: p.kind,
            })),
          },
        });
      } catch {
        // aprendizado é best-effort; a importação já foi gravada com sucesso
      }

      return {
        inserted: payload.length,
        categories_created: categoriesCreated,
        installments_linked: installmentsLinked,
        installments_created: installmentsCreated,
        recurrences_created: recurrencesCreated,
        warnings,
      };
    },
  );
