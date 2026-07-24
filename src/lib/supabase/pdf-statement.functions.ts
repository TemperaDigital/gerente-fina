/**
 * Server Function — Extração de lançamentos de extratos/faturas em PDF
 * (Fase C do Importador Universal).
 *
 * Extração de texto roda no SERVIDOR via `unpdf` (build serverless do
 * PDF.js — zero dependências nativas, canvas mockado; escolhida sobre
 * pdf-parse/pdfjs-dist crus justamente para não trazer binário nativo pro
 * bundle serverless). A IA (mesmo Lovable AI Gateway do /chat) lê o texto
 * bruto e devolve os lançamentos + a data-âncora (vencimento/fechamento). O
 * ANO de cada lançamento é calculado depois, deterministicamente, em
 * `@/lib/finance/pdf-statement` — nunca confiado à IA. O sinal de cada valor
 * reaproveita `parseCsvAmount` (mesma convenção da Fase B) em vez de
 * reinventar parsing de sinal para PDF.
 *
 * PROTEÇÃO POR SENHA:
 *  - Owner password (comum — ex.: PDF só restringe impressão/edição): abre
 *    normalmente, sem exigir nada aqui — unpdf/pdfjs já leem o conteúdo.
 *  - User password (ex.: extratos da Caixa Econômica): unpdf propaga a
 *    PasswordException do pdfjs-dist por baixo, com `.code` tipado —
 *    NEED_PASSWORD (sem senha enviada) ou INCORRECT_PASSWORD (senha errada).
 *    Detectamos pelo `.code` (nunca por texto de mensagem) e devolvemos
 *    `{ requires_password: true }` estruturado em vez de lançar erro genérico.
 *    A senha só existe na memória desta requisição — nunca é logada nem
 *    persistida em banco, cache ou estado global.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  validatePdfExtraction,
  anchorTransactionYear,
  type PdfStatementType,
} from "@/lib/finance/pdf-statement";
import { parseCsvAmount } from "@/lib/finance/csv-mapping";

const Input = z.object({
  file_base64: z.string().min(1),
  password: z.string().optional(),
});

export interface PdfStatementRow {
  occurred_on: string;
  description: string;
  amount_raw: string;
  is_negative: boolean;
}

export interface PdfExtractResultDTO {
  requires_password: boolean;
  /** true somente quando uma senha FOI enviada e ainda assim estava incorreta. */
  password_incorrect?: boolean;
  rows?: PdfStatementRow[];
  statement_type?: PdfStatementType;
  /** Lançamentos descartados por data/valor incompatível com o formato detectado. */
  skipped_count?: number;
  /** true quando o texto extraído passou de MAX_CHARS e foi cortado antes de ir pra IA — pode ter perdido lançamentos das últimas páginas. */
  truncated?: boolean;
}

const SYSTEM_PROMPT = `Você lê o texto extraído de um extrato bancário ou fatura de cartão de
crédito brasileiro em PDF (o texto pode vir com ruído de layout: cabeçalhos,
rodapés, juros de boleto, propaganda).

Responda chamando a ferramenta extract_pdf_statement com:
- document_date: a data de VENCIMENTO ou FECHAMENTO do documento (procure no
  cabeçalho/rodapé — geralmente aparece UMA vez, fora da tabela de
  lançamentos), no formato YYYY-MM-DD. É OBRIGATÓRIA: sem ela não é possível
  calcular o ano dos lançamentos, que aparecem sem ano (ex: "02/08"). Nunca
  invente — se não encontrar com confiança, ainda assim retorne sua melhor
  estimativa (não deixe vazio).
- statement_type: "bank_statement" (extrato de conta corrente/poupança) ou
  "credit_card_invoice" (fatura de cartão de crédito).
- negative_convention: como valores negativos aparecem no texto — um destes
  exatos: "minus_prefix" (ex: "-123.45"), "minus_suffix" (ex: "123.45-"),
  "parentheses" (ex: "(123.45)"), "none" (nenhum valor negativo aparece).
- transactions: lista dos lançamentos REAIS (ignore juros de boleto,
  propaganda, cabeçalho/rodapé, saldo anterior/total), cada um com:
  - day: dia do mês (1-31)
  - month: mês (1-12)
  - description: descrição limpa do lançamento
  - amount_text: o valor EXATAMENTE como aparece no texto, com sinal ou
    parênteses se houver (ex: "-32,10" ou "(150,00)")`;

export const extractPdfStatement = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<PdfExtractResultDTO> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "IA indisponível (LOVABLE_API_KEY ausente) — não é possível extrair lançamentos deste PDF.",
      );
    }

    const { getDocumentProxy, extractText, getResolvedPDFJS } = await import("unpdf");

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(data.file_base64, "base64"));
    } catch {
      throw new Error("Arquivo PDF inválido (falha ao decodificar).");
    }

    let text: string;
    try {
      const doc = await getDocumentProxy(bytes, data.password ? { password: data.password } : {});
      const extracted = await extractText(doc, { mergePages: true });
      text = extracted.text;
    } catch (err: unknown) {
      const pdfjs = await getResolvedPDFJS();
      const code = (err as { name?: string; code?: number } | null)?.code;
      const isPasswordError =
        (err as { name?: string } | null)?.name === "PasswordException" &&
        (code === pdfjs.PasswordResponses.NEED_PASSWORD ||
          code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);

      if (isPasswordError) {
        return {
          requires_password: true,
          password_incorrect: code === pdfjs.PasswordResponses.INCORRECT_PASSWORD,
        };
      }
      throw new Error(`Falha ao ler o PDF: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!text || text.trim().length < 20) {
      throw new Error(
        "Não foi possível extrair texto deste PDF (pode ser uma imagem escaneada, sem camada de texto).",
      );
    }

    // Protege o contexto da IA: extratos muito longos (muitos meses/páginas)
    // são cortados — melhor um resultado parcial do que estourar o limite.
    // `truncated` avisa o cliente (nunca cortar em silêncio — lançamentos das
    // últimas páginas podem ter ficado de fora).
    const MAX_CHARS = 18_000;
    const truncated = text.length > MAX_CHARS;
    const textForAI = truncated ? text.slice(0, MAX_CHARS) : text;

    // Timeout explícito: sem isso, uma trava no gateway prenderia a requisição
    // indefinidamente e o usuário só veria um erro genérico de rede no browser.
    const AI_TIMEOUT_MS = 30_000;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), AI_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: timeoutController.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: textForAI },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_pdf_statement",
                description:
                  "Retorna os lançamentos extraídos do documento + metadados de formato.",
                parameters: {
                  type: "object",
                  properties: {
                    document_date: { type: "string", description: "YYYY-MM-DD" },
                    statement_type: {
                      type: "string",
                      enum: ["bank_statement", "credit_card_invoice"],
                    },
                    negative_convention: {
                      type: "string",
                      enum: ["minus_prefix", "minus_suffix", "parentheses", "none"],
                    },
                    transactions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          day: { type: "integer" },
                          month: { type: "integer" },
                          description: { type: "string" },
                          amount_text: { type: "string" },
                        },
                        required: ["day", "month", "description", "amount_text"],
                      },
                    },
                  },
                  required: [
                    "document_date",
                    "statement_type",
                    "negative_convention",
                    "transactions",
                  ],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "extract_pdf_statement" } },
        }),
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          `Tempo esgotado ao consultar a IA (${AI_TIMEOUT_MS / 1000}s). Tente novamente em instantes.`,
        );
      }
      throw new Error(
        `Falha de rede ao consultar a IA: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!resp.ok) {
      if (resp.status === 429) {
        throw new Error("Limite de requisições da IA atingido. Tente novamente em instantes.");
      }
      if (resp.status === 402) {
        throw new Error("Créditos da IA esgotados. Adicione créditos no workspace da Lovable.");
      }
      const errText = await resp.text().catch(() => "");
      throw new Error(`Falha ao consultar a IA (${resp.status}): ${errText.slice(0, 200)}`);
    }

    const json = (await resp.json()) as {
      choices?: Array<{
        message?: { tool_calls?: Array<{ function?: { arguments?: string } }> };
      }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      throw new Error("A IA não retornou lançamentos. Tente novamente.");
    }

    let rawParsed: Record<string, unknown>;
    try {
      rawParsed = JSON.parse(args);
    } catch {
      throw new Error("A IA retornou um resultado em formato inválido.");
    }

    const extraction = validatePdfExtraction(rawParsed);

    const rows: PdfStatementRow[] = [];
    let skippedCount = 0;
    for (const t of extraction.transactions) {
      try {
        const occurred_on = anchorTransactionYear(t.month, t.day, extraction.document_date);
        const { absAmount, isNegative } = parseCsvAmount(
          t.amount_text,
          extraction.negative_convention,
        );
        rows.push({ occurred_on, description: t.description, amount_raw: absAmount, is_negative: isNegative });
      } catch {
        skippedCount++;
      }
    }

    if (rows.length === 0) {
      throw new Error(
        "Nenhum lançamento válido pôde ser extraído do PDF (datas ou valores incompatíveis com o formato detectado).",
      );
    }

    return {
      requires_password: false,
      rows,
      statement_type: extraction.statement_type,
      skipped_count: skippedCount,
      truncated,
    };
  });
