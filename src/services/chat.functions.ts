/**
 * Server Function — Chat com Gerente Fina IA (Lovable AI Gateway).
 *
 * Agente multi-turno com ferramentas (Missão 9): a IA nunca decide sozinha
 * conta/categoria/parcelamento — ela PERGUNTA quando falta informação que só
 * o usuário sabe, e só age através de ferramentas (create_transaction,
 * query_transactions_summary, get_income_expense_report,
 * get_installments_report, find_transaction_candidates, delete_transaction).
 *
 * Mesmo padrão de chamada HTTP (tool calling) já usado e testado em
 * `classifyBatchWithAI` (src/lib/supabase/import.functions.ts), mas SEM
 * forçar `tool_choice` — aqui o modelo precisa poder só conversar ou
 * perguntar, não é obrigado a chamar uma ferramenta a cada turno.
 *
 * Regra determinística preexistente: descrições contendo "MariaReniele" ou
 * "Woshington" (case/acento-insensitive) são reclassificadas em
 * ALIMENTAÇÃO // mercearia — preservada do mecanismo anterior.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import { normalizeAmount, toCents, fromCents, sumAmounts } from "@/lib/finance/money";
import { normalizePattern } from "@/lib/supabase/rules.functions";
import { createTransactionEntry } from "@/services/transactions.functions";

type SupabaseClient = import("@supabase/supabase-js").SupabaseClient;

export interface ChatResponse {
  reply: string;
  transactionCreated: boolean;
  transactionDeleted?: boolean;
  transaction?: {
    id?: string;
    kind: "income" | "expense" | "transfer" | "invoice_payment";
    amount: string;
    description: string;
    occurred_on: string;
  };
}

const schema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional()
    .default([]),
  /** Thread já existente ou recém-criada pelo client antes do envio (Missão 8). */
  thread_id: z.string().uuid(),
});

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesTemperoRule(description: string): boolean {
  const n = normalizeText(description);
  return n.includes("mariareniele") || n.includes("maria reniele") || n.includes("woshington");
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Prompt de sistema — inclui contas/categorias REAIS do usuário (mesmo padrão
// de embutir a lista de categorias no prompt já usado em classifyBatchWithAI)
// e as regras inegociáveis do agente.
// ---------------------------------------------------------------------------
function buildSystemPrompt(
  accounts: Array<{ id: string; name: string; type: string }>,
  categories: Array<{ id: string; name: string; kind: string }>,
  todayStr: string,
): string {
  const accountList = accounts.map((a) => `- ${a.id} | ${a.name} | ${a.type}`).join("\n");
  const categoryList = categories.map((c) => `- ${c.id} | ${c.name} | ${c.kind}`).join("\n");

  return `Você é o Gerente Fina, um agente contábil brasileiro com ferramentas para criar, consultar e corrigir lançamentos financeiros do usuário.

DATA DE HOJE: ${todayStr}

CONTAS REAIS DO USUÁRIO (id | nome | tipo):
${accountList || "(nenhuma conta cadastrada — informe isso ao usuário se ele tentar lançar algo)"}

CATEGORIAS EXISTENTES DO USUÁRIO (id | nome | receita ou despesa):
${categoryList || "(nenhuma categoria cadastrada ainda)"}

REGRAS INEGOCIÁVEIS:
1. NUNCA invente account_id, category_id, counterpart_account_id ou paid_invoice_id — só use UUIDs das listas acima ou obtidos via ferramenta nesta própria conversa. Se não estiver claro em qual conta/cartão foi o lançamento, NÃO chame create_transaction — responda perguntando, oferecendo as contas reais acima em linguagem natural (ex.: "Foi no crédito do Inter, no PicPay, ou em dinheiro?").
2. Se a conta escolhida for do tipo credit_card, pergunte se foi parcelado e em quantas vezes ANTES de chamar create_transaction — a menos que o usuário já tenha dito isso na própria mensagem (ex.: "parcelei em 3x"). Se a conta NÃO for credit_card, não pergunte sobre parcelamento.
3. Data: se o usuário não mencionar, use hoje (${todayStr}) sem perguntar, mas deixe isso explícito na confirmação final (ex.: "Registrando para hoje, ${todayStr}"). Se a mensagem sugerir outra data ("semana passada", "dia 20"), calcule a partir de hoje.
4. Categoria: tente casar com uma categoria EXISTENTE da lista acima, do mesmo tipo (income/expense). Se nenhuma servir claramente, PERGUNTE se pode criar uma categoria nova com o nome proposto — só chame create_transaction com new_category_name depois que o usuário confirmar. Nunca use uma categoria genérica tipo "outros"/fallback.
5. Transferência (kind=transfer) exige counterpart_account_id (conta de destino) — pergunte qual, usando a lista de contas. Pagamento de fatura (kind=invoice_payment) exige paid_invoice_id — se você não souber o UUID exato da fatura, NÃO invente: explique ao usuário que esse tipo ainda precisa ser feito pela tela do sistema.
6. NUNCA chame delete_transaction sem que, NO TURNO ANTERIOR, você tenha mostrado ao usuário os detalhes exatos do lançamento candidato (via find_transaction_candidates) e recebido confirmação explícita em texto (ex.: "sim", "pode apagar", "isso mesmo"). Se o pedido for vago (ex.: "apaga o do queijo"), chame find_transaction_candidates, mostre o(s) resultado(s) e pergunte "posso apagar este?" — NUNCA apague no mesmo turno em que identificou o candidato.
7. Nunca execute uma ação destrutiva sem essa confirmação explícita.
8. Sempre responda em português, tom direto e objetivo.
9. Ao criar um lançamento com sucesso, sempre resuma o que foi feito (valor, conta, categoria, data).
10. Nunca reporte números de relatório (totais, contagens, projeções) sem ter chamado a ferramenta correspondente antes — não estime, não arredonde de cabeça.`;
}

// ---------------------------------------------------------------------------
// Definição das ferramentas (tool calling) — sem tool_choice forçado.
// ---------------------------------------------------------------------------
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_transaction",
      description:
        "Cria um lançamento (receita, despesa, transferência ou pagamento de fatura). NUNCA chame sem account_id de uma conta REAL do usuário — se não estiver claro qual conta, pergunte antes.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["income", "expense", "transfer", "invoice_payment"] },
          amount: { type: "string", description: "Valor decimal positivo, ex: '50.00'" },
          description: { type: "string" },
          occurred_on: { type: "string", description: "YYYY-MM-DD" },
          account_id: {
            type: "string",
            description: "UUID de uma conta EXISTENTE do usuário (obrigatório)",
          },
          category_id: {
            type: "string",
            description:
              "UUID de categoria existente, se houver correspondência clara (income/expense)",
          },
          new_category_name: {
            type: "string",
            description:
              "Nome de categoria nova — só se nenhuma existente servir E o usuário já confirmou a criação",
          },
          is_installment: {
            type: "boolean",
            description:
              "true se o usuário disse que foi parcelado (só válido para despesa em cartão de crédito)",
          },
          installments_count: {
            type: "integer",
            description: "Quantidade de parcelas — obrigatório se is_installment=true",
          },
          counterpart_account_id: {
            type: "string",
            description: "UUID da conta de destino — obrigatório se kind=transfer",
          },
          paid_invoice_id: {
            type: "string",
            description: "UUID da fatura sendo paga — obrigatório se kind=invoice_payment",
          },
        },
        required: ["kind", "amount", "description", "account_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_transactions_summary",
      description:
        "Consulta contagem, soma e uma lista resumida de lançamentos com filtros. Use para perguntas como 'quantas compras na farmácia esse mês' ou 'gastos de 1 a 15 de julho'.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          month: { type: "integer", description: "1-12, atalho junto com year" },
          year: { type: "integer" },
          category_name: {
            type: "string",
            description: "Nome (ou parte do nome) de uma categoria existente",
          },
          kind: { type: "string", enum: ["income", "expense", "transfer", "invoice_payment"] },
          account_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_income_expense_report",
      description:
        "Retorna receitas, despesas, resultado líquido e breakdown por categoria de um mês/ano específico (qualquer mês/ano, não só o atual).",
      parameters: {
        type: "object",
        properties: {
          month: { type: "integer", description: "1-12" },
          year: { type: "integer" },
        },
        required: ["month", "year"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_installments_report",
      description:
        "Retorna todos os parcelamentos ativos do usuário: parcelas restantes, valor total comprometido e quanto está reservado por mês nos próximos meses. Baseia-se só em parcelas já cadastradas — nunca estime renda.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_transaction_candidates",
      description:
        "Busca lançamentos por descrição aproximada, valor e/ou data — use antes de excluir algo identificado de forma vaga (ex: 'apaga o do queijo').",
      parameters: {
        type: "object",
        properties: {
          description_query: { type: "string" },
          amount: { type: "string" },
          date_from: { type: "string" },
          date_to: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_transaction",
      description:
        "Exclui um lançamento permanentemente. SÓ chame depois de mostrar os detalhes do lançamento ao usuário E receber confirmação explícita em texto no turno anterior.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "UUID do lançamento (obtido via find_transaction_candidates)",
          },
          confirmed: {
            type: "boolean",
            description: "Só true se o usuário confirmou explicitamente em texto no turno anterior",
          },
        },
        required: ["id", "confirmed"],
      },
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Validação dos argumentos que o modelo envia (defesa em profundidade — não
// confiamos cegamente no JSON retornado pela IA).
// ---------------------------------------------------------------------------
const CreateTxArgs = z.object({
  kind: z.enum(["income", "expense", "transfer", "invoice_payment"]),
  amount: z.string().min(1),
  description: z.string().min(1),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  account_id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  new_category_name: z.string().min(1).max(60).optional(),
  is_installment: z.boolean().optional(),
  installments_count: z.number().int().min(2).max(360).optional(),
  counterpart_account_id: z.string().uuid().optional(),
  paid_invoice_id: z.string().uuid().optional(),
});

const QuerySummaryArgs = z.object({
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  category_name: z.string().optional(),
  kind: z.enum(["income", "expense", "transfer", "invoice_payment"]).optional(),
  account_id: z.string().uuid().optional(),
});

const IncomeExpenseReportArgs = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

const FindCandidatesArgs = z.object({
  description_query: z.string().optional(),
  amount: z.string().optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const DeleteTxArgs = z.object({
  id: z.string().uuid(),
  confirmed: z.boolean(),
});

// ---------------------------------------------------------------------------
// Executores das ferramentas
// ---------------------------------------------------------------------------

/** Categoria criada automaticamente pelo agente: "VARIÁVEL" por padrão, mesma regra da Missão 11. */
const AUTO_CATEGORY_NATURE = "VARIÁVEL";

async function toolCreateTransaction(
  sb: SupabaseClient,
  userId: string,
  categories: Array<{ id: string; name: string; kind: string }>,
  accounts: Array<{ id: string; name: string; type: string }>,
  args: z.infer<typeof CreateTxArgs>,
): Promise<{ result: unknown; created?: NonNullable<ChatResponse["transaction"]> }> {
  const account = accounts.find((a) => a.id === args.account_id);
  if (!account) {
    return {
      result: {
        ok: false,
        error:
          "account_id não corresponde a nenhuma conta real do usuário. Pergunte novamente qual conta.",
      },
    };
  }

  const occurred_on =
    args.occurred_on && /^\d{4}-\d{2}-\d{2}$/.test(args.occurred_on)
      ? args.occurred_on
      : todayIso();
  const amount = normalizeAmount(args.amount);
  const description = args.description.trim();

  let category_id: string | undefined;
  if (args.kind === "income" || args.kind === "expense") {
    // Regra determinística dos temperos tem precedência (preexistente)
    const isTempero = args.kind === "expense" && matchesTemperoRule(description);
    if (isTempero) {
      const merc = categories.find((c) => normalizeText(c.name).includes("mercearia"));
      const alim = categories.find((c) => normalizeText(c.name).includes("aliment"));
      category_id = merc?.id ?? alim?.id ?? undefined;
    }

    if (!category_id && args.category_id) {
      const valid = categories.find((c) => c.id === args.category_id && c.kind === args.kind);
      if (!valid) {
        return {
          result: {
            ok: false,
            error: "category_id não corresponde a uma categoria existente do tipo certo.",
          },
        };
      }
      category_id = valid.id;
    }

    if (!category_id && args.new_category_name) {
      const cleanName = args.new_category_name.trim().slice(0, 60);
      const { data: found } = await sb
        .from("categories")
        .select("id")
        .eq("kind", args.kind)
        .ilike("name", cleanName)
        .is("archived_at", null)
        .limit(1);
      if (found?.[0]?.id) {
        category_id = found[0].id;
      } else {
        const { data: createdCat, error: catCreateErr } = await sb
          .from("categories")
          .insert({
            user_id: userId,
            name: cleanName,
            kind: args.kind,
            nature: AUTO_CATEGORY_NATURE,
          })
          .select("id")
          .single();
        if (catCreateErr) {
          return {
            result: { ok: false, error: `Falha ao criar categoria: ${catCreateErr.message}` },
          };
        }
        category_id = createdCat.id;
      }
    }

    if (!category_id) {
      return {
        result: {
          ok: false,
          error:
            "Nenhuma categoria resolvida. Informe category_id (existente) ou new_category_name (só após confirmação do usuário).",
        },
      };
    }
  }

  try {
    const txResult = await createTransactionEntry({
      data: {
        kind: args.kind,
        amount,
        occurred_on,
        description,
        account_id: args.account_id,
        category_id,
        counterpart_account_id: args.counterpart_account_id,
        paid_invoice_id: args.paid_invoice_id,
        installment:
          args.is_installment && args.installments_count
            ? { count: args.installments_count }
            : undefined,
      },
    });

    return {
      result: {
        ok: true,
        created_count: txResult.created_count,
        account_name: account.name,
        warnings: txResult.warnings,
      },
      created: { kind: args.kind, amount, description, occurred_on },
    };
  } catch (err) {
    return { result: { ok: false, error: err instanceof Error ? err.message : String(err) } };
  }
}

async function toolQuerySummary(
  sb: SupabaseClient,
  categories: Array<{ id: string; name: string; kind: string }>,
  args: z.infer<typeof QuerySummaryArgs>,
): Promise<unknown> {
  let from = args.date_from;
  let to = args.date_to;
  if (args.month && args.year) {
    from = `${args.year}-${String(args.month).padStart(2, "0")}-01`;
    const lastDay = new Date(args.year, args.month, 0).getDate();
    to = `${args.year}-${String(args.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  let category_id: string | null = null;
  if (args.category_name) {
    const needle = normalizeText(args.category_name);
    const match = categories.find((c) => normalizeText(c.name).includes(needle));
    if (!match) {
      return {
        ok: false,
        error: `Nenhuma categoria encontrada com nome parecido com "${args.category_name}".`,
      };
    }
    category_id = match.id;
  }

  let query = sb
    .from("transactions")
    .select("id, description, amount, occurred_on, kind, accounts:account_id ( name )")
    .order("occurred_on", { ascending: false })
    .range(0, 4999); // teto de segurança — app monousuário, não é exportação

  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);
  if (args.kind) query = query.eq("kind", args.kind);
  if (args.account_id) query = query.eq("account_id", args.account_id);
  if (category_id) query = query.eq("category_id", category_id);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as unknown as Array<{
    description: string | null;
    amount: string;
    occurred_on: string;
    accounts?: { name?: string | null } | null;
  }>;

  return {
    ok: true,
    count: rows.length,
    total_amount: sumAmounts(rows, (r) => r.amount),
    sample: rows.slice(0, 10).map((r) => ({
      description: r.description,
      amount: r.amount,
      occurred_on: r.occurred_on,
      account_name: r.accounts?.name ?? null,
    })),
  };
}

async function toolIncomeExpenseReport(
  sb: SupabaseClient,
  args: z.infer<typeof IncomeExpenseReportArgs>,
): Promise<unknown> {
  const referenceMonth = `${args.year}-${String(args.month).padStart(2, "0")}-01`;

  const [dreRes, catRes] = await Promise.all([
    sb
      .from("monthly_dre")
      .select("income, expense, net_result")
      .eq("reference_month", referenceMonth)
      .maybeSingle(),
    sb
      .from("monthly_dre_by_category")
      .select("category_name, kind, total_amount, transactions_count")
      .eq("reference_month", referenceMonth)
      .order("total_amount", { ascending: false }),
  ]);
  if (dreRes.error) return { ok: false, error: dreRes.error.message };
  if (catRes.error) return { ok: false, error: catRes.error.message };

  const rows = (catRes.data ?? []) as Array<{
    category_name: string;
    kind: "income" | "expense";
    total_amount: string;
    transactions_count: number;
  }>;

  return {
    ok: true,
    reference_month: referenceMonth,
    income: dreRes.data?.income ?? "0.00",
    expense: dreRes.data?.expense ?? "0.00",
    net_result: dreRes.data?.net_result ?? "0.00",
    expense_by_category: rows
      .filter((r) => r.kind === "expense")
      .map((r) => ({
        category: r.category_name,
        total: r.total_amount,
        count: r.transactions_count,
      })),
    income_by_category: rows
      .filter((r) => r.kind === "income")
      .map((r) => ({
        category: r.category_name,
        total: r.total_amount,
        count: r.transactions_count,
      })),
  };
}

async function toolInstallmentsReport(sb: SupabaseClient): Promise<unknown> {
  const { data, error } = await sb
    .from("installment_purchases")
    .select(
      `description, total_amount, installments_count,
       installment_items ( amount, due_date, transaction_id )`,
    )
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };

  type Row = {
    description: string;
    total_amount: string;
    installments_count: number;
    installment_items?: Array<{ amount: string; due_date: string; transaction_id: string | null }>;
  };
  const rows = (data ?? []) as unknown as Row[];

  let totalRemainingCents = 0n;
  let totalRemainingCount = 0;
  const byMonth = new Map<string, bigint>();

  const active_purchases = rows.map((p) => {
    const items = p.installment_items ?? [];
    const remaining = items.filter((i) => i.transaction_id == null);
    totalRemainingCount += remaining.length;
    let remainingCents = 0n;
    for (const it of remaining) {
      const c = toCents(it.amount);
      remainingCents += c;
      totalRemainingCents += c;
      const monthKey = it.due_date.slice(0, 7);
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0n) + c);
    }
    return {
      description: p.description,
      total_amount: p.total_amount,
      installments_count: p.installments_count,
      remaining_count: remaining.length,
      remaining_amount: fromCents(remainingCents),
    };
  });

  const committed_by_month = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cents]) => ({ month, amount: fromCents(cents) }));

  return {
    ok: true,
    active_purchases,
    total_remaining_installments: totalRemainingCount,
    total_committed_amount: fromCents(totalRemainingCents),
    committed_by_month,
  };
}

async function toolFindCandidates(
  sb: SupabaseClient,
  args: z.infer<typeof FindCandidatesArgs>,
): Promise<unknown> {
  let query = sb
    .from("transactions")
    .select("id, description, amount, occurred_on, kind, accounts:account_id ( name )")
    .order("occurred_on", { ascending: false })
    .limit(50);

  if (args.amount) query = query.eq("amount", normalizeAmount(args.amount));
  if (args.date_from) query = query.gte("occurred_on", args.date_from);
  if (args.date_to) query = query.lte("occurred_on", args.date_to);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  type Row = {
    id: string;
    description: string | null;
    amount: string;
    occurred_on: string;
    kind: string;
    accounts?: { name?: string | null } | null;
  };
  let rows = (data ?? []) as unknown as Row[];

  if (args.description_query) {
    const needle = normalizePattern(args.description_query);
    rows = rows.filter((r) => normalizePattern(r.description ?? "").includes(needle));
  }

  return {
    ok: true,
    candidates: rows.slice(0, 10).map((r) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      occurred_on: r.occurred_on,
      kind: r.kind,
      account_name: r.accounts?.name ?? null,
    })),
  };
}

async function toolDeleteTransaction(
  sb: SupabaseClient,
  args: z.infer<typeof DeleteTxArgs>,
): Promise<{
  ok: boolean;
  deleted?: { id: string; description: string | null; amount: string };
  error?: string;
}> {
  if (!args.confirmed) {
    return {
      ok: false,
      error: "Confirmação obrigatória ausente — pergunte ao usuário antes de apagar.",
    };
  }
  const { data, error } = await sb
    .from("transactions")
    .delete()
    .eq("id", args.id)
    .select("id, description, amount")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Lançamento não encontrado (já pode ter sido excluído)." };
  return { ok: true, deleted: data };
}

// ---------------------------------------------------------------------------
// Loop do agente — multi-turno com ferramentas, sem tool_choice forçado.
// ---------------------------------------------------------------------------
const MAX_TOOL_ITERATIONS = 6;

async function computeReply(data: z.infer<typeof schema>): Promise<ChatResponse> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      reply: "LOVABLE_API_KEY ausente. Configure o secret para ativar a IA.",
      transactionCreated: false,
    };
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
  const sb = getSupabaseAdmin();
  const userId = await resolveActiveUserId();

  const [accRes, catRes] = await Promise.all([
    sb.from("accounts").select("id, name, type").is("archived_at", null).order("name"),
    sb.from("categories").select("id, name, kind").is("archived_at", null).order("name"),
  ]);
  if (accRes.error)
    return {
      reply: `Falha ao carregar contas: ${accRes.error.message}`,
      transactionCreated: false,
    };
  if (catRes.error)
    return {
      reply: `Falha ao carregar categorias: ${catRes.error.message}`,
      transactionCreated: false,
    };

  const accounts = (accRes.data ?? []) as Array<{ id: string; name: string; type: string }>;
  const categories = (catRes.data ?? []) as Array<{ id: string; name: string; kind: string }>;

  const today = todayIso();
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: buildSystemPrompt(accounts, categories, today) },
    ...data.history.slice(-18),
    { role: "user", content: data.message },
  ];

  let createdTransaction: ChatResponse["transaction"] | undefined;
  let transactionCreated = false;
  let transactionDeleted = false;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: AGENT_TOOLS,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      if (resp.status === 429) {
        return {
          reply: "Limite de requisições atingido. Tente novamente em instantes.",
          transactionCreated,
          transactionDeleted,
          transaction: createdTransaction,
        };
      }
      if (resp.status === 402) {
        return {
          reply: "Créditos da IA esgotados. Adicione créditos no workspace da Lovable.",
          transactionCreated,
          transactionDeleted,
          transaction: createdTransaction,
        };
      }
      return {
        reply: `Falha na IA (${resp.status}): ${text.slice(0, 200)}`,
        transactionCreated,
        transactionDeleted,
        transaction: createdTransaction,
      };
    }

    const payload = await resp.json();
    const choice = payload?.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls as
      Array<{ id: string; function?: { name?: string; arguments?: string } }> | undefined;

    if (!toolCalls || toolCalls.length === 0) {
      return {
        reply: choice?.content ?? "Não entendi. Pode reformular?",
        transactionCreated,
        transactionDeleted,
        transaction: createdTransaction,
      };
    }

    messages.push({ role: "assistant", content: choice.content ?? null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const name = call.function?.name ?? "";
      let rawArgs: Record<string, unknown> = {};
      try {
        rawArgs = JSON.parse(call.function?.arguments ?? "{}");
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: "Argumentos inválidos (JSON malformado)." }),
        });
        continue;
      }

      let toolResult: unknown;
      try {
        switch (name) {
          case "create_transaction": {
            const parsed = CreateTxArgs.safeParse(rawArgs);
            if (!parsed.success) {
              toolResult = { ok: false, error: parsed.error.message };
              break;
            }
            const { result, created } = await toolCreateTransaction(
              sb,
              userId,
              categories,
              accounts,
              parsed.data,
            );
            toolResult = result;
            if (created) {
              createdTransaction = created;
              transactionCreated = true;
            }
            break;
          }
          case "query_transactions_summary": {
            const parsed = QuerySummaryArgs.safeParse(rawArgs);
            toolResult = parsed.success
              ? await toolQuerySummary(sb, categories, parsed.data)
              : { ok: false, error: parsed.error.message };
            break;
          }
          case "get_income_expense_report": {
            const parsed = IncomeExpenseReportArgs.safeParse(rawArgs);
            toolResult = parsed.success
              ? await toolIncomeExpenseReport(sb, parsed.data)
              : { ok: false, error: parsed.error.message };
            break;
          }
          case "get_installments_report": {
            toolResult = await toolInstallmentsReport(sb);
            break;
          }
          case "find_transaction_candidates": {
            const parsed = FindCandidatesArgs.safeParse(rawArgs);
            toolResult = parsed.success
              ? await toolFindCandidates(sb, parsed.data)
              : { ok: false, error: parsed.error.message };
            break;
          }
          case "delete_transaction": {
            const parsed = DeleteTxArgs.safeParse(rawArgs);
            if (!parsed.success) {
              toolResult = { ok: false, error: parsed.error.message };
              break;
            }
            const delResult = await toolDeleteTransaction(sb, parsed.data);
            toolResult = delResult;
            if (delResult.ok) transactionDeleted = true;
            break;
          }
          default:
            toolResult = { ok: false, error: `Ferramenta desconhecida: ${name}` };
        }
      } catch (err) {
        toolResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }

      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult) });
    }
  }

  return {
    reply: "Não consegui concluir dentro do limite de etapas — pode reformular seu pedido?",
    transactionCreated,
    transactionDeleted,
    transaction: createdTransaction,
  };
}

/**
 * Grava uma mensagem na thread e atualiza `updated_at` da thread (o
 * trigger `tg_set_updated_at` sobrescreve o valor com `now()`). Compartilhada
 * entre `appendChatMessage` (exportada) e a persistência automática feita
 * por `sendChatMessage` a cada troca.
 */
async function persistChatMessage(
  sb: import("@supabase/supabase-js").SupabaseClient,
  params: { user_id: string; thread_id: string; role: "user" | "assistant"; content: string },
): Promise<void> {
  const { error: insErr } = await sb.from("chat_messages").insert({
    user_id: params.user_id,
    thread_id: params.thread_id,
    role: params.role,
    content: params.content,
  });
  if (insErr) throw new Error(insErr.message);

  const { error: updErr } = await sb
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.thread_id);
  if (updErr) throw new Error(updErr.message);
}

export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data }): Promise<ChatResponse> => {
    const reply = await computeReply(data);

    // Falha ao persistir histórico não deve impedir a resposta ao usuário —
    // a conversa em si já terminou com sucesso (ou com o erro já embutido
    // em `reply`); o histórico é conveniência de UI, não o fluxo crítico.
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
      const sb = getSupabaseAdmin();
      const userId = await resolveActiveUserId();
      await persistChatMessage(sb, {
        user_id: userId,
        thread_id: data.thread_id,
        role: "user",
        content: data.message,
      });
      await persistChatMessage(sb, {
        user_id: userId,
        thread_id: data.thread_id,
        role: "assistant",
        content: reply.reply,
      });
    } catch (persistErr) {
      console.error("Falha ao persistir histórico do chat:", persistErr);
    }

    return reply;
  });

// ---------------------------------------------------------------------------
// Histórico de conversas (Missão 8) — threads + mensagens
// ---------------------------------------------------------------------------
export interface ChatThreadDTO {
  id: string;
  title: string | null;
  /** Prévia da última mensagem da thread, para exibir na lista lateral. */
  preview: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export const listChatThreads = createServerFn({ method: "GET" }).handler(
  async (): Promise<ChatThreadDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data: threads, error } = await sb
      .from("chat_threads")
      .select("id, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const threadIds = (threads ?? []).map((t) => t.id as string);
    const previewByThread = new Map<string, string>();
    if (threadIds.length > 0) {
      const { data: msgs, error: msgErr } = await sb
        .from("chat_messages")
        .select("thread_id, content, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false });
      if (msgErr) throw new Error(msgErr.message);
      for (const m of (msgs ?? []) as Array<{ thread_id: string; content: string }>) {
        if (!previewByThread.has(m.thread_id)) {
          previewByThread.set(m.thread_id, m.content);
        }
      }
    }

    return (threads ?? []).map((t) => ({
      id: t.id as string,
      title: (t.title as string | null) ?? null,
      preview: previewByThread.get(t.id as string)?.slice(0, 80) ?? null,
      created_at: t.created_at as string,
      updated_at: t.updated_at as string,
    }));
  },
);

export const createChatThread = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ id: string }> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    const { data, error } = await sb
      .from("chat_threads")
      .insert({ user_id: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id as string };
  },
);

const ThreadIdInput = z.object({ thread_id: z.string().uuid() });

export const getChatThreadMessages = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ThreadIdInput.parse(input))
  .handler(async ({ data }): Promise<ChatMessageDTO[]> => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();

    const { data: rows, error } = await sb
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", data.thread_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ChatMessageDTO[];
  });

const AppendInput = z.object({
  thread_id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const appendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AppendInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();
    await persistChatMessage(sb, {
      user_id: userId,
      thread_id: data.thread_id,
      role: data.role,
      content: data.content,
    });
    return { ok: true };
  });

export const deleteChatThread = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ThreadIdInput.parse(input))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("chat_threads").delete().eq("id", data.thread_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
