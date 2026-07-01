/**
 * Server Function stub — Chat com Gerente Fina IA.
 *
 * A ligação real com o Lovable AI Gateway (chat completion + Whisper) ainda
 * não foi implementada. Este stub mantém o contrato tipado para que a rota
 * `/chat` compile e renderize sem quebrar o build, respondendo com uma
 * mensagem informativa em pt-BR.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data }): Promise<ChatResponse> => {
    return {
      reply:
        `Recebi sua mensagem: "${data.message}". O Gerente Fina IA ainda ` +
        "está sendo conectado ao Lovable AI Gateway — em breve responderei " +
        "e registrarei lançamentos por linguagem natural.",
      transactionCreated: false,
    };
  });
