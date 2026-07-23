/**
 * Server Function — Transcrição de voz para o /chat (Missão GF-004).
 *
 * Usa o binding Workers AI (`env.AI`, ver wrangler.jsonc) rodando
 * `@cf/openai/whisper` — sem custo de infraestrutura própria (nem ZimaOS
 * nem chave de API paga), cobrado só por minuto de áudio pela Cloudflare.
 *
 * Modelo `@cf/openai/whisper` (não a variante `-large-v3-turbo`) escolhido
 * de propósito: seu contrato de entrada é o único documentado sem ambiguidade
 * pela Cloudflare (array de bytes do áudio) — a variante turbo aceita um
 * `audio: string | { body, contentType }` cujo formato exato de string não
 * está documentado publicamente, e não há como testar contra o binding real
 * nesta sessão (sem login Cloudflare) para descobrir por tentativa. Trade-off
 * aceito: sem parâmetro `language` explícito (o modelo detecta o idioma
 * automaticamente — funciona bem para PT-BR na prática, mas não é forçado).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveActiveUserId } from "@/lib/supabase/resolve-user";
import { base64ToBytes, validateAudioBytes } from "@/lib/audio/voice-transcription";

const schema = z.object({
  /** Áudio gravado no navegador (MediaRecorder), codificado em base64. */
  audio_base64: z.string().min(1),
});

export const transcribeVoiceMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data }): Promise<{ text: string }> => {
    // Autenticação obrigatória — cada chamada tem custo real na conta
    // Cloudflare do usuário, não pode ficar aberta a quem não tem sessão.
    await resolveActiveUserId();

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

    let env: typeof import("cloudflare:workers").env | undefined;
    try {
      ({ env } = await import("cloudflare:workers"));
    } catch {
      // Não estamos rodando num Cloudflare Worker (ex.: `vite dev` local) —
      // cai no erro amigável abaixo, igual ao caso de binding ausente.
    }
    if (!env?.AI) {
      throw new Error(
        "Transcrição por voz indisponível neste ambiente (binding Workers AI não configurado). " +
          "Funciona em produção/`wrangler dev`.",
      );
    }

    const result = await env.AI.run("@cf/openai/whisper", {
      audio: Array.from(bytes),
    });

    const text = result?.text?.trim();
    if (!text) {
      throw new Error("Não consegui entender o áudio. Tente falar mais perto do microfone.");
    }
    return { text };
  });
