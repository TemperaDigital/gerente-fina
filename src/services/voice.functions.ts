/**
 * Server Function — Transcrição de voz para o /chat (Missão GF-004 v2).
 *
 * v1 usava o binding Workers AI (`env.AI` + `@cf/openai/whisper`) — abandonada
 * porque não há garantia de que o `wrangler.jsonc` do repo é mesclado no
 * Worker publicado pelo pipeline da Lovable, e bindings especiais (Workers AI,
 * R2, KV, D1) exigem provisionamento manual da equipe deles, que a própria
 * Lovable confirmou não conseguir garantir. v2 usa o AI Gateway da Lovable
 * (`LOVABLE_API_KEY` + `ai.gateway.lovable.dev`), o MESMO mecanismo já
 * comprovado funcionando neste app para o chat de texto
 * (`src/services/chat.functions.ts`) e o import de PDF
 * (`src/lib/supabase/pdf-statement.functions.ts`) — sem depender de nenhum
 * binding especial de infraestrutura.
 *
 * Endpoint dedicado `/v1/audio/transcriptions` (multipart/form-data, campos
 * `file` + `model`), diferente do `/v1/chat/completions` usado no resto do
 * app. Modelo `openai/gpt-4o-mini-transcribe` por padrão (mais barato;
 * `gpt-4o-transcribe` é mais preciso mas ~10x o custo — não compensa para
 * ditado de chat curto). `whisper-1` NÃO é aceito pelo gateway da Lovable.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import {
  base64ToBytes,
  validateAudioBytes,
  type AudioMimeType,
} from "@/lib/audio/voice-transcription";

const MIME_TO_EXTENSION: Record<AudioMimeType, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
};

const schema = z.object({
  /** Áudio gravado no navegador (MediaRecorder), codificado em base64. */
  audio_base64: z.string().min(1),
  /** MIME real reportado pelo MediaRecorder do cliente — define a extensão do arquivo enviado ao gateway. */
  audio_mime: z.enum(["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg"]).default("audio/webm"),
});

export const transcribeVoiceMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data }): Promise<{ text: string }> => {
    // Autenticação obrigatória — cada chamada consome créditos reais da
    // Lovable AI, não pode ficar aberta a quem não tem sessão.
    await resolveActiveUserId();

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY ausente. Configure o secret para ativar a transcrição.");
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(data.audio_base64);
    } catch {
      throw new Error("Áudio inválido (base64 malformado).");
    }
    const sizeError = validateAudioBytes(bytes);
    if (sizeError) {
      throw new Error(sizeError);
    }

    const extension = MIME_TO_EXTENSION[data.audio_mime];
    // Cast: TS tipa Uint8Array como genérico sobre ArrayBufferLike (inclui
    // SharedArrayBuffer), mas BlobPart exige ArrayBuffer — base64ToBytes
    // sempre devolve um Uint8Array normal (nunca compartilhado).
    const file = new File([bytes] as BlobPart[], `recording.${extension}`, {
      type: data.audio_mime,
    });

    const form = new FormData();
    form.append("file", file);
    form.append("model", "openai/gpt-4o-mini-transcribe");

    // Sem Content-Type manual — o runtime define o boundary do multipart sozinho.
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!resp.ok) {
      if (resp.status === 402) {
        throw new Error(
          "Créditos Lovable AI esgotados. Adicione créditos em Settings → Plans & credits.",
        );
      }
      if (resp.status === 429) {
        throw new Error("Muitas requisições, aguarde um instante e tente novamente.");
      }
      if (resp.status === 400) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `Áudio rejeitado pelo provedor: ${text.slice(0, 200) || "formato inválido"}`,
        );
      }
      if (resp.status >= 500) {
        throw new Error("Falha temporária na transcrição, tente de novo.");
      }
      const text = await resp.text().catch(() => "");
      throw new Error(`Falha na transcrição (${resp.status}): ${text.slice(0, 200)}`);
    }

    const payload = (await resp.json()) as { text?: string };
    const text = payload?.text?.trim();
    if (!text) {
      throw new Error("Não consegui entender o áudio. Tente falar mais perto do microfone.");
    }
    return { text };
  });
