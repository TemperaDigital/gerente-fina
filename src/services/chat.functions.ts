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

export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data }): Promise<ChatResponse> => {
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
        return { reply: "Limite de requisições atingido. Tente novamente em instantes.", transactionCreated: false };
      }
      if (resp.status === 402) {
        return { reply: "Créditos da IA esgotados. Adicione créditos no workspace da Lovable.", transactionCreated: false };
      }
      return { reply: `Falha na IA (${resp.status}): ${text.slice(0, 200)}`, transactionCreated: false };
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
    let args: { kind: "income" | "expense"; amount: string; description: string; occurred_on?: string };
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

      const { data: inserted, error: insErr } = await Promise.race([
        insertPromise,
        timeoutPromise,
      ]);

      if (insErr) {
        const raw = insErr.message ?? String(insErr);
        if (raw.includes("foreign key") || raw.includes("violates")) {
          throw new Error("Conta ou categoria inválida (FK). Verifique cadastros em /accounts e /categories.");
        }
        if (raw.includes("dedup") || raw.includes("unique")) {
          throw new Error("Lançamento duplicado — já existe uma transação idêntica.");
        }
        throw new Error(raw);
      }


      const suffix = isTempero ? " (categorizado automaticamente em ALIMENTAÇÃO // mercearia — temperos e grãos)" : "";
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
  });
