/**
 * Server Function — Chat com Gerente Fina IA (Lovable AI Gateway).
 *
 * Fluxo:
 *  1. Envia mensagem + histórico ao gateway (google/gemini-3-flash-preview)
 *     com uma ferramenta `record_transaction` que a IA pode chamar.
 *  2. Se a IA chamar a ferramenta, resolvemos conta/categoria e gravamos
 *     a transação no banco (numeric 14,2 — sem multiplicar por 100).
 *  3. Regra determinística: descrições contendo "MariaReniele" ou
 *     "Woshington" (case/acento-insensitive) são reclassificadas em
 *     ALIMENTAÇÃO // mercearia com notes = "Compra de temperos e Graos".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import { normalizeAmount } from "@/lib/finance/money";

export interface ChatResponse {
  reply: string;
  transactionCreated: boolean;
  transaction?: {
    id: string;
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

const SYSTEM_PROMPT = `Você é o Gerente Fina, um assistente contábil brasileiro.
Quando o usuário descrever um GASTO ou uma RECEITA em linguagem natural
(ex.: "gastei 50 no posto", "recebi 1200 de freela"), CHAME a ferramenta
record_transaction com os campos extraídos.
- kind: "expense" para gastos, "income" para recebimentos
- amount: valor positivo em reais, formato decimal com ponto (ex: "50.00")
- description: descrição curta e limpa em pt-BR
- occurred_on: data no formato YYYY-MM-DD (use hoje se não informado)
Se for apenas uma pergunta ou conversa, RESPONDA em pt-BR sem chamar a ferramenta.`;

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

/**
 * Lógica original de chamada à IA — inalterada nesta missão. Extraída de
 * dentro do handler para permitir que `sendChatMessage` persista o
 * histórico (Missão 8) em torno dela, sem tocar no fluxo da IA em si.
 */
async function computeReply(data: z.infer<typeof schema>): Promise<ChatResponse> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      reply: "LOVABLE_API_KEY ausente. Configure o secret para ativar a IA.",
      transactionCreated: false,
    };
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...data.history.slice(-16),
    { role: "user", content: data.message },
  ];

  // Chama Lovable AI Gateway
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "record_transaction",
            description: "Registra um lançamento financeiro (receita ou despesa) no livro-caixa.",
            parameters: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["income", "expense"] },
                amount: { type: "string", description: "Valor decimal positivo, ex: '50.00'" },
                description: { type: "string" },
                occurred_on: { type: "string", description: "YYYY-MM-DD" },
              },
              required: ["kind", "amount", "description"],
            },
          },
        },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 429) {
      return {
        reply: "Limite de requisições atingido. Tente novamente em instantes.",
        transactionCreated: false,
      };
    }
    if (resp.status === 402) {
      return {
        reply: "Créditos da IA esgotados. Adicione créditos no workspace da Lovable.",
        transactionCreated: false,
      };
    }
    return {
      reply: `Falha na IA (${resp.status}): ${text.slice(0, 200)}`,
      transactionCreated: false,
    };
  }

  const payload = await resp.json();
  const choice = payload?.choices?.[0]?.message;
  const toolCall = choice?.tool_calls?.[0];

  if (!toolCall) {
    return {
      reply: choice?.content ?? "Não entendi. Pode reformular?",
      transactionCreated: false,
    };
  }

  // Parse tool call
  let args: {
    kind: "income" | "expense";
    amount: string;
    description: string;
    occurred_on?: string;
  };
  try {
    args = JSON.parse(toolCall.function?.arguments ?? "{}");
  } catch {
    return { reply: "Não consegui interpretar os dados do lançamento.", transactionCreated: false };
  }

  const kind = args.kind === "income" ? "income" : "expense";
  const amount = normalizeAmount(args.amount);
  const description = String(args.description ?? "").trim() || data.message.slice(0, 80);
  const occurred_on = /^\d{4}-\d{2}-\d{2}$/.test(args.occurred_on ?? "")
    ? (args.occurred_on as string)
    : todayIso();

  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/client.server");
    const { resolveActiveAccount } = await import("@/lib/finance/active-account.server");
    const sb = getSupabaseAdmin();
    const userId = await resolveActiveUserId();

    let account: { id: string; type: string };
    try {
      account = await resolveActiveAccount(sb, userId);
    } catch (e) {
      return {
        reply: e instanceof Error ? e.message : "Nenhuma conta ativa cadastrada.",
        transactionCreated: false,
      };
    }

    // Categoria — regra dos temperos vem primeiro
    const isTempero = kind === "expense" && matchesTemperoRule(description);
    let categoryId: string | null = null;
    let notes: string | null = null;

    const { data: cats, error: catErr } = await sb
      .from("categories")
      .select("id, name, kind")
      .eq("kind", kind)
      .is("archived_at", null);
    if (catErr) throw new Error(`categorias: ${catErr.message}`);

    if (isTempero) {
      const merc = cats?.find((c) => normalizeText(c.name).includes("mercearia"));
      const alim = cats?.find((c) => normalizeText(c.name).includes("aliment"));
      categoryId = merc?.id ?? alim?.id ?? cats?.[0]?.id ?? null;
      notes = "Compra de temperos e Graos";
    } else {
      categoryId = cats?.[0]?.id ?? null;
    }

    if (!categoryId) {
      return {
        reply: `Não encontrei categoria de ${kind === "income" ? "receita" : "despesa"}. Cadastre uma em /categories.`,
        transactionCreated: false,
      };
    }

    const insertPayload = {
      user_id: userId,
      account_id: account.id,
      category_id: categoryId,
      kind,
      type: kind === "income" ? "credit" : "debit",
      amount, // numeric 14,2 — decimal puro
      occurred_on,
      description,
      notes,
      source: "manual",
    };

    const insertPromise = sb
      .from("transactions")
      .insert(insertPayload)
      .select("id, kind, amount, description, occurred_on")
      .single();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ao gravar (10s). Tente novamente.")), 10_000),
    );

    const { data: inserted, error: insErr } = await Promise.race([insertPromise, timeoutPromise]);

    if (insErr) {
      const raw = insErr.message ?? String(insErr);
      if (raw.includes("foreign key") || raw.includes("violates")) {
        throw new Error(
          "Conta ou categoria inválida (FK). Verifique cadastros em /accounts e /categories.",
        );
      }
      if (raw.includes("dedup") || raw.includes("unique")) {
        throw new Error("Lançamento duplicado — já existe uma transação idêntica.");
      }
      throw new Error(raw);
    }

    const suffix = isTempero
      ? " (categorizado automaticamente em ALIMENTAÇÃO // mercearia — temperos e grãos)"
      : "";
    return {
      reply: `✅ Registrei ${kind === "income" ? "receita" : "despesa"} de R$ ${amount} — ${description}.${suffix}`,
      transactionCreated: true,
      transaction: inserted as ChatResponse["transaction"],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      reply: `❌ Falha ao gravar lançamento: ${msg}`,
      transactionCreated: false,
    };
  }
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
