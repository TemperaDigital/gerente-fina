import { describe, it, expect } from "vitest";
import {
  base64ToBytes,
  validateAudioBytes,
  formatElapsedSeconds,
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
} from "./voice-transcription";

describe("base64ToBytes — decodifica áudio recebido do navegador", () => {
  it("decodifica um base64 simples de volta para os bytes originais", () => {
    const original = new TextEncoder().encode("gerente fina");
    const base64 = btoa(String.fromCharCode(...original));
    expect(Array.from(base64ToBytes(base64))).toEqual(Array.from(original));
  });

  it("string vazia decodifica para array vazio (não lança)", () => {
    expect(base64ToBytes("").byteLength).toBe(0);
  });
});

describe("validateAudioBytes — checagens antes de chamar o Lovable AI Gateway", () => {
  it("rejeita áudio vazio", () => {
    expect(validateAudioBytes(new Uint8Array(0))).toMatch(/vazio/i);
  });

  it("aceita um áudio de tamanho normal", () => {
    expect(validateAudioBytes(new Uint8Array(1024))).toBeNull();
  });

  it("rejeita áudio maior que MAX_AUDIO_BYTES", () => {
    expect(validateAudioBytes(new Uint8Array(MAX_AUDIO_BYTES + 1))).toMatch(/longo/i);
  });

  it("aceita exatamente MAX_AUDIO_BYTES (limite inclusivo)", () => {
    expect(validateAudioBytes(new Uint8Array(MAX_AUDIO_BYTES))).toBeNull();
  });
});

describe("formatElapsedSeconds — contador de gravação da UI", () => {
  it("formata segundos abaixo de um minuto", () => {
    expect(formatElapsedSeconds(0)).toBe("0:00");
    expect(formatElapsedSeconds(5)).toBe("0:05");
    expect(formatElapsedSeconds(59)).toBe("0:59");
  });

  it("formata um minuto exato e acima", () => {
    expect(formatElapsedSeconds(60)).toBe("1:00");
    expect(formatElapsedSeconds(MAX_RECORDING_SECONDS)).toBe("1:00");
  });

  it("trunca frações e nunca fica negativo", () => {
    expect(formatElapsedSeconds(12.9)).toBe("0:12");
    expect(formatElapsedSeconds(-3)).toBe("0:00");
  });
});
