/**
 * Server Function — Detecção de schema de CSV genérico (Fase B do
 * Importador Universal).
 *
 * Roda UMA VEZ por arquivo: recebe as primeiras linhas cruas (já parseadas
 * pelo PapaParse com header:true) e devolve o mapeamento de colunas +
 * convenções de formato. A aplicação desse mapa em TODAS as linhas do
 * arquivo é feita depois, deterministicamente, em
 * `@/lib/finance/csv-mapping` — nenhuma chamada de IA por linha.
 *
 * Mesmo gateway do /chat (Lovable AI Gateway) — ver chat.functions.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { validateCsvSchemaMap, type CsvSchemaMap } from "@/lib/finance/csv-mapping";

const SampleRow = z.record(z.string(), z.string());

const Input = z.object({
  sample_rows: z.array(SampleRow).min(1).max(10),
});

const SYSTEM_PROMPT = `Você analisa amostras de CSVs de bancos e cartões brasileiros e identifica
o mapeamento de colunas para um formato canônico.

Responda chamando a ferramenta detect_csv_schema com:
- date_key: a CHAVE EXATA do objeto (nome da coluna) que contém a data da transação
- description_key: a chave que contém a descrição/histórico da transação
- amount_key: a chave que contém o valor monetário
- date_format: um destes valores exatos: "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YY"
- negative_convention: como valores negativos aparecem no texto — um destes:
  "minus_prefix" (ex: "-123.45" ou "- 662,79"), "minus_suffix" (ex: "123.45-"),
  "parentheses" (ex: "(123.45)"), "none" (nenhum valor negativo aparece nesta amostra)
- statement_type: "bank_statement" (extrato de conta corrente/poupança) ou
  "credit_card_invoice" (fatura de cartão de crédito)

As chaves retornadas em date_key/description_key/amount_key DEVEM ser
exatamente iguais (case-sensitive) a uma das chaves presentes nos objetos de
amostra. Nunca invente uma chave que não existe.`;

export const detectCsvSchema = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<CsvSchemaMap> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "IA indisponível (LOVABLE_API_KEY ausente) — não é possível detectar automaticamente as colunas deste CSV.",
      );
    }

    const sampleKeys = Array.from(new Set(data.sample_rows.flatMap((r) => Object.keys(r))));
    if (sampleKeys.length === 0) {
      throw new Error("A amostra do CSV não tem colunas.");
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Colunas disponíveis: ${sampleKeys.join(", ")}\n\nAmostra (JSON):\n${JSON.stringify(data.sample_rows, null, 2)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "detect_csv_schema",
              description: "Retorna o mapeamento de colunas do CSV para o formato canônico.",
              parameters: {
                type: "object",
                properties: {
                  date_key: { type: "string" },
                  description_key: { type: "string" },
                  amount_key: { type: "string" },
                  date_format: {
                    type: "string",
                    enum: ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YY"],
                  },
                  negative_convention: {
                    type: "string",
                    enum: ["minus_prefix", "minus_suffix", "parentheses", "none"],
                  },
                  statement_type: {
                    type: "string",
                    enum: ["bank_statement", "credit_card_invoice"],
                  },
                },
                required: [
                  "date_key",
                  "description_key",
                  "amount_key",
                  "date_format",
                  "negative_convention",
                  "statement_type",
                ],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "detect_csv_schema" } },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Falha ao consultar a IA (${resp.status}): ${text.slice(0, 200)}`);
    }

    const json = (await resp.json()) as {
      choices?: Array<{
        message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
      }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      throw new Error("A IA não retornou um mapeamento de colunas. Tente novamente.");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(args);
    } catch {
      throw new Error("A IA retornou um mapeamento em formato inválido.");
    }

    return validateCsvSchemaMap(parsed, sampleKeys);
  });
