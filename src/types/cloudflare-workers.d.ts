/**
 * Declaração mínima do módulo `cloudflare:workers`, usada só por
 * src/services/voice.functions.ts para acessar o binding Workers AI
 * (ver wrangler.jsonc, GF-004).
 *
 * Escrita à mão (em vez de incluir o worker-configuration.d.ts gerado por
 * `wrangler types`) de propósito: o arquivo gerado redefine globais como
 * Response/Request/fetch com os tipos do runtime Cloudflare Workers, que
 * conflitam com os tipos DOM usados pelo resto do app (cliente React e
 * outras server functions que fazem `fetch(...).json()` esperando `any`).
 * Regenerar com `npx wrangler types` só serve como referência ao evoluir
 * este binding — não inclua o resultado no tsconfig.
 */
declare module "cloudflare:workers" {
  export const env: {
    AI?: {
      run(
        model: "@cf/openai/whisper",
        inputs: { audio: number[] },
      ): Promise<{ text: string; word_count?: number; words?: unknown[]; vtt?: string }>;
    };
  };
}
