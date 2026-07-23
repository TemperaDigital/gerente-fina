/**
 * Cobertura de GF-001 (import assíncrono em chunks).
 *
 * Testa o núcleo de negócio (`prepareImportClassificationImpl`,
 * `classifyImportBatchImpl`) — NÃO os wrappers `createServerFn` exportados
 * (`prepareImportClassification`, `classifyImportBatch`). Confirmado
 * empiricamente: chamar uma server function `createServerFn(...).handler()`
 * diretamente fora de uma request real lança "No Start context found in
 * AsyncLocalStorage" (o contexto vem de um AsyncLocalStorage que só existe
 * dentro do runtime de request do TanStack Start, inexistente em vitest).
 * Por isso os handlers em import.functions.ts foram divididos: o wrapper
 * `createServerFn` só resolve `sb`/`userId`/posse da conta (via os imports
 * dinâmicos exigidos pelo sufixo `.server.ts`) e delega pro `*Impl`, que
 * recebe tudo já resolvido — mesmo padrão de injeção de dependência já usado
 * por `accountBelongsToUser`/`loadUserRules` (ver active-account.server.ts
 * e active-account.server.test.ts, único precedente de teste de service
 * layer no repo antes deste arquivo — o resto da suíte cobre só o motor
 * matemático puro de src/lib/finance/).
 *
 * O fake Supabase abaixo filtra um dataset em memória de verdade através de
 * `.eq()/.is()/.in()/.order()/.limit()` — mesma filosofia do fake usado em
 * active-account.server.test.ts — em vez de mockar respostas fixas por
 * chamada, o que deixaria a regra de negócio de fora do teste.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  prepareImportClassificationImpl,
  classifyImportBatchImpl,
  type ImportClassificationBatchItem,
} from "./import.functions";
import { hashTransaction } from "@/lib/finance/hash";
import { normalizeAmount } from "@/lib/finance/money";

// ---------------------------------------------------------------------------
// Fake Supabase — filtra tabelas em memória de verdade.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function makeFakeSupabase(tables: Tables): SupabaseClient {
  function builder(table: string) {
    const filters: Array<
      | { type: "eq"; col: string; val: unknown }
      | { type: "is"; col: string; val: unknown }
      | { type: "in"; col: string; val: unknown[] }
    > = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;

    function applyFilters(): Row[] {
      let rows = tables[table] ?? [];
      for (const f of filters) {
        if (f.type === "eq") rows = rows.filter((r) => r[f.col] === f.val);
        else if (f.type === "is") rows = rows.filter((r) => (r[f.col] ?? null) === f.val);
        else if (f.type === "in") rows = rows.filter((r) => f.val.includes(r[f.col]));
      }
      if (orderCol) {
        const col = orderCol;
        rows = [...rows].sort((a, b) => {
          const av = a[col] as string;
          const bv = b[col] as string;
          if (av < bv) return orderAsc ? -1 : 1;
          if (av > bv) return orderAsc ? 1 : -1;
          return 0;
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    }

    const api = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push({ type: "eq", col, val });
        return api;
      },
      is(col: string, val: unknown) {
        filters.push({ type: "is", col, val });
        return api;
      },
      in(col: string, val: unknown[]) {
        filters.push({ type: "in", col, val });
        return api;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending ?? true;
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      async maybeSingle() {
        const rows = applyFilters();
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve: (v: { data: Row[]; error: null }) => unknown) {
        return resolve({ data: applyFilters(), error: null });
      },
    };
    return api;
  }

  return { from: (table: string) => builder(table) } as unknown as SupabaseClient;
}

const USER_ID = "user-1";
const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";

function baseTables(overrides: Partial<Tables> = {}): Tables {
  return {
    categories: [],
    classification_rules: [],
    accounts: [
      {
        id: ACCOUNT_ID,
        user_id: USER_ID,
        type: "bank",
        closing_day: null,
        due_day: null,
        archived_at: null,
      },
    ],
    installment_purchases: [],
    recurrences: [],
    transactions: [],
    ...overrides,
  };
}

function row(
  description: string,
  overrides: Partial<{
    occurred_on: string;
    amount_raw: string;
    kind: "income" | "expense";
  }> = {},
) {
  return {
    occurred_on: "2026-01-15",
    description,
    amount_raw: "100.00",
    kind: "expense" as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// prepareImportClassificationImpl
// ---------------------------------------------------------------------------
describe("prepareImportClassificationImpl", () => {
  it("marca como duplicata a linha cujo hash já existe em transactions", async () => {
    const dupRow = row("PIX RECEBIDO JOAO");
    const existingHash = await hashTransaction({
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      occurred_on: dupRow.occurred_on,
      amount: normalizeAmount(dupRow.amount_raw),
      type: dupRow.kind === "income" ? "credit" : "debit",
      description: dupRow.description,
    });

    const sb = makeFakeSupabase(
      baseTables({ transactions: [{ dedup_hash: existingHash }] }),
    );

    const result = await prepareImportClassificationImpl(sb, USER_ID, {
      account_id: ACCOUNT_ID,
      rows: [dupRow, row("OUTRA LINHA DIFERENTE")],
    });

    expect(result.rows[0].is_duplicate).toBe(true);
    expect(result.rows[0].dedup_hash).toBe(existingHash);
    expect(result.rows[0].suggested_category_id).toBeNull();
    expect(result.rows[1].is_duplicate).toBe(false);
    // Duplicata nunca entra num lote de classificação por IA.
    const flatIndices = result.batches.flat().map((b) => b.index);
    expect(flatIndices).not.toContain(0);
  });

  it("precedência tempero > regra aprendida > IA", async () => {
    const temperoRow = row("PIX MARIA RENIELE MERCEARIA");
    const ruleRow = row("UBER TRIP 12345 SAO PAULO");
    const aiRow = row("LOJA XPTO COMPRA 999");

    const sb = makeFakeSupabase(
      baseTables({
        categories: [
          { id: "cat-tempero", user_id: USER_ID, name: "Mercearia", kind: "expense" },
          { id: "cat-transporte", user_id: USER_ID, name: "Transporte", kind: "expense" },
          { id: "cat-outra", user_id: USER_ID, name: "Outra", kind: "expense" },
        ],
        classification_rules: [
          // Também bateria no temperoRow ("reniele" é substring da descrição) —
          // prova que o tempero vence mesmo quando uma regra aprendida casaria.
          {
            id: "rule-reniele",
            user_id: USER_ID,
            pattern: "reniele",
            match_type: "contains",
            category_id: "cat-outra",
            kind: "expense",
            hit_count: 3,
          },
          {
            id: "rule-uber",
            user_id: USER_ID,
            pattern: "uber",
            match_type: "contains",
            category_id: "cat-transporte",
            kind: "expense",
            hit_count: 10,
          },
        ],
      }),
    );

    const result = await prepareImportClassificationImpl(sb, USER_ID, {
      account_id: ACCOUNT_ID,
      rows: [temperoRow, ruleRow, aiRow],
    });

    // Linha 0: tempero vence mesmo com regra aprendida concorrente.
    expect(result.rows[0].suggested_category_id).toBe("cat-tempero");
    expect(result.rows[0].confidence).toBe("high");
    expect(result.rows[0].notes).toMatch(/tempero/i);

    // Linha 1: regra aprendida do usuário (sem IA envolvida).
    expect(result.rows[1].suggested_category_id).toBe("cat-transporte");
    expect(result.rows[1].confidence).toBe("high");

    // Linha 2: nem tempero nem regra bateram — precisa de IA.
    expect(result.rows[2].suggested_category_id).toBeNull();
    expect(result.rows[2].suggested_new_category).toBeNull();

    const flatIndices = result.batches.flat().map((b) => b.index);
    expect(flatIndices).toEqual([2]);
    expect(flatIndices).not.toContain(0);
    expect(flatIndices).not.toContain(1);
  });

  describe("agrupamento em lotes de até 40 linhas para IA", () => {
    async function prepareWithNRows(n: number) {
      const rows = Array.from({ length: n }, (_, i) => row(`LOJA UNICA NUMERO ${i} SEM PADRAO`));
      const sb = makeFakeSupabase(baseTables());
      return prepareImportClassificationImpl(sb, USER_ID, {
        account_id: ACCOUNT_ID,
        rows,
      });
    }

    it("exatamente 40 linhas → 1 lote de 40", async () => {
      const result = await prepareWithNRows(40);
      expect(result.batches).toHaveLength(1);
      expect(result.batches[0]).toHaveLength(40);
      expect(result.batches[0].map((b) => b.index)).toEqual(
        Array.from({ length: 40 }, (_, i) => i),
      );
    });

    it("41 linhas → 2 lotes (40 + 1)", async () => {
      const result = await prepareWithNRows(41);
      expect(result.batches).toHaveLength(2);
      expect(result.batches[0]).toHaveLength(40);
      expect(result.batches[1]).toHaveLength(1);
      expect(result.batches[1][0].index).toBe(40);
    });

    it("menos que 40 linhas (5) → 1 lote de 5", async () => {
      const result = await prepareWithNRows(5);
      expect(result.batches).toHaveLength(1);
      expect(result.batches[0]).toHaveLength(5);
      expect(result.batches[0].map((b) => b.index)).toEqual([0, 1, 2, 3, 4]);
    });

    it("cada item do lote carrega description/amount/kind corretos", async () => {
      const result = await prepareWithNRows(2);
      expect(result.batches[0][0]).toMatchObject({
        index: 0,
        description: "LOJA UNICA NUMERO 0 SEM PADRAO",
        amount: "100.00",
        kind: "expense",
      });
    });
  });
});

// ---------------------------------------------------------------------------
// classifyImportBatchImpl
// ---------------------------------------------------------------------------
describe("classifyImportBatchImpl", () => {
  const categories = [
    { id: "cat-transporte", user_id: USER_ID, name: "Transporte", kind: "expense" },
    { id: "cat-salario", user_id: USER_ID, name: "Salário", kind: "income" },
    { id: "cat-assinaturas", user_id: USER_ID, name: "Assinaturas Digitais", kind: "expense" },
  ];

  function makeBatchItem(overrides: Partial<ImportClassificationBatchItem> = {}) {
    return {
      index: 0,
      description: "UBER TRIP",
      amount: "50.00",
      kind: "expense" as const,
      offer_convert_recurrence_baseline: false,
      has_recurrence_match: false,
      ...overrides,
    };
  }

  function mockToolCallResponse(classifications: unknown[]) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              tool_calls: [
                { function: { arguments: JSON.stringify({ classifications }) } },
              ],
            },
          },
        ],
      }),
    };
  }

  beforeEach(() => {
    process.env.LOVABLE_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LOVABLE_API_KEY;
  });

  it("processa um lote isolado corretamente (categoria existente, categoria nova, kind incompatível, nome já existente)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockToolCallResponse([
        { index: 0, category_id: "cat-transporte", confidence: "high" },
        { index: 1, new_category: "Academia", confidence: "medium" },
        // kind errado (categoria é expense, linha é income) — deve ser rejeitada
        { index: 2, category_id: "cat-transporte", confidence: "high" },
        // nome já existe (case-insensitive) — deve ser rejeitada como "nova"
        { index: 3, new_category: "TRANSPORTE", confidence: "high" },
      ]),
    );

    const sb = makeFakeSupabase(baseTables({ categories }));
    const batch = [
      makeBatchItem({ index: 0, description: "UBER TRIP", kind: "expense" }),
      makeBatchItem({ index: 1, description: "ACADEMIA SMART FIT", kind: "expense" }),
      makeBatchItem({ index: 2, description: "PGTO SALARIO", kind: "income" }),
      makeBatchItem({ index: 3, description: "ALGO", kind: "expense" }),
    ];

    const patches = await classifyImportBatchImpl(sb, USER_ID, batch);

    expect(patches).toHaveLength(4);
    expect(patches[0]).toMatchObject({
      index: 0,
      suggested_category_id: "cat-transporte",
      confidence: "high",
    });
    expect(patches[1]).toMatchObject({
      index: 1,
      suggested_new_category: "Academia",
      confidence: "medium",
    });
    // kind incompatível: sugestão descartada
    expect(patches[2].suggested_category_id).toBeNull();
    // nome duplicado (case-insensitive): sugestão descartada
    expect(patches[3].suggested_new_category).toBeNull();
  });

  it("upgrade de offer_convert_recurrence quando a categoria resolvida parece assinatura", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockToolCallResponse([{ index: 0, category_id: "cat-assinaturas", confidence: "high" }]),
    );
    const sb = makeFakeSupabase(baseTables({ categories }));
    const batch = [
      makeBatchItem({
        index: 0,
        offer_convert_recurrence_baseline: false,
        has_recurrence_match: false,
      }),
    ];

    const [patch] = await classifyImportBatchImpl(sb, USER_ID, batch);
    expect(patch.offer_convert_recurrence).toBe(true);
  });

  it("preserva offer_convert_recurrence_baseline mesmo sem categoria de assinatura", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockToolCallResponse([]));
    const sb = makeFakeSupabase(baseTables({ categories }));
    const batch = [
      makeBatchItem({
        index: 0,
        offer_convert_recurrence_baseline: true,
        has_recurrence_match: false,
      }),
    ];

    const [patch] = await classifyImportBatchImpl(sb, USER_ID, batch);
    expect(patch.offer_convert_recurrence).toBe(true);
  });

  describe("propagação de erro real (não engole silenciosamente)", () => {
    it("HTTP não-ok lança, não retorna vazio silenciosamente", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 503,
      });
      const sb = makeFakeSupabase(baseTables({ categories }));
      await expect(
        classifyImportBatchImpl(sb, USER_ID, [makeBatchItem()]),
      ).rejects.toThrow(/503/);
    });

    it("resposta sem tool_calls lança", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: {} }] }),
      });
      const sb = makeFakeSupabase(baseTables({ categories }));
      await expect(
        classifyImportBatchImpl(sb, USER_ID, [makeBatchItem()]),
      ).rejects.toThrow(/não retornou classificação/);
    });

    it("JSON malformado nos argumentos da tool call lança", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            { message: { tool_calls: [{ function: { arguments: "{not valid json" } }] } },
          ],
        }),
      });
      const sb = makeFakeSupabase(baseTables({ categories }));
      await expect(
        classifyImportBatchImpl(sb, USER_ID, [makeBatchItem()]),
      ).rejects.toThrow(/formato inesperado/);
    });

    it("falha de rede (fetch rejeita) propaga, não é engolida", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
      const sb = makeFakeSupabase(baseTables({ categories }));
      await expect(
        classifyImportBatchImpl(sb, USER_ID, [makeBatchItem()]),
      ).rejects.toThrow(/network down/);
    });
  });

  it("sem LOVABLE_API_KEY: fluxo manual silencioso, sem chamar a IA e sem lançar", async () => {
    delete process.env.LOVABLE_API_KEY;
    const sb = makeFakeSupabase(baseTables({ categories }));
    const batch = [
      makeBatchItem({ index: 0, offer_convert_recurrence_baseline: true }),
      makeBatchItem({ index: 1 }),
    ];

    const patches = await classifyImportBatchImpl(sb, USER_ID, batch);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(patches).toEqual([
      {
        index: 0,
        suggested_category_id: null,
        suggested_new_category: null,
        confidence: "low",
        offer_convert_recurrence: true, // baseline preservado
      },
      {
        index: 1,
        suggested_category_id: null,
        suggested_new_category: null,
        confidence: "low",
        offer_convert_recurrence: false,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Integração: prepare + múltiplos lotes — nenhuma linha perdida nem duplicada
// ---------------------------------------------------------------------------
describe("integração: prepareImportClassificationImpl + classifyImportBatchImpl em cadeia", () => {
  beforeEach(() => {
    process.env.LOVABLE_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LOVABLE_API_KEY;
  });

  it("classifica 45 linhas via 2 lotes sem perder nem duplicar índices", async () => {
    const categories = [{ id: "cat-x", user_id: USER_ID, name: "Geral", kind: "expense" }];
    const rows = Array.from({ length: 45 }, (_, i) => row(`LANCAMENTO NUMERO ${i} UNICO`));
    const sb = makeFakeSupabase(baseTables({ categories }));

    const prepared = await prepareImportClassificationImpl(sb, USER_ID, {
      account_id: ACCOUNT_ID,
      rows,
    });
    expect(prepared.batches).toHaveLength(2);
    expect(prepared.batches[0]).toHaveLength(40);
    expect(prepared.batches[1]).toHaveLength(5);

    // Mock de fetch que devolve uma classificação por índice recebido no
    // corpo da requisição — simula a IA respondendo por lote de verdade.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body) as { messages: Array<{ content: string }> };
        const userContent = body.messages[1].content;
        const indices = [...userContent.matchAll(/^(\d+):/gm)].map((m) => Number(m[1]));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      function: {
                        arguments: JSON.stringify({
                          classifications: indices.map((index) => ({
                            index,
                            category_id: "cat-x",
                            confidence: "high",
                          })),
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }),
    );

    const allPatches = new Map<number, Awaited<ReturnType<typeof classifyImportBatchImpl>>[number]>();
    for (const batch of prepared.batches) {
      const patches = await classifyImportBatchImpl(sb, USER_ID, batch);
      for (const p of patches) {
        // Nenhum índice deve aparecer em mais de um lote.
        expect(allPatches.has(p.index)).toBe(false);
        allPatches.set(p.index, p);
      }
    }

    // Nenhuma linha perdida: todos os 45 índices originais foram cobertos.
    expect(allPatches.size).toBe(45);
    const coveredIndices = Array.from(allPatches.keys()).sort((a, b) => a - b);
    expect(coveredIndices).toEqual(Array.from({ length: 45 }, (_, i) => i));

    // E todas vieram classificadas corretamente (prova que o merge por índice funciona).
    for (let i = 0; i < 45; i++) {
      expect(allPatches.get(i)?.suggested_category_id).toBe("cat-x");
    }
  });
});
