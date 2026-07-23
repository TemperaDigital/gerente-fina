/**
 * Lógica pura de gravação/transcrição de voz do /chat (Missão GF-004) —
 * extraída para ser testável sem precisar do binding Workers AI real nem
 * do MediaRecorder do navegador.
 */

/** Bem acima do esperado para um áudio webm/opus de até 60s — só uma rede de segurança. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Limite de duração de gravação no navegador — MediaRecorder para sozinho ao atingir. */
export const MAX_RECORDING_SECONDS = 60;

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Devolve a mensagem de erro se o áudio não passar nas checagens, ou `null` se estiver ok. */
export function validateAudioBytes(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return "Áudio vazio — grave novamente.";
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return "Áudio muito longo — grave uma mensagem mais curta.";
  }
  return null;
}

/** Formata segundos decorridos como "0:00", "0:59", "1:00"... para o contador da UI. */
export function formatElapsedSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
