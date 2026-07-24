import { describe, it, expect } from "vitest";
import { validatePdfExtraction, anchorTransactionYear } from "./pdf-statement";

describe("anchorTransactionYear — ancora o ano de lançamentos sem ano explícito", () => {
  it("mês do lançamento <= mês da âncora → mesmo ano da âncora", () => {
    expect(anchorTransactionYear(1, 15, "2026-03-10")).toBe("2026-01-15");
    expect(anchorTransactionYear(3, 10, "2026-03-10")).toBe("2026-03-10");
  });

  it("mês do lançamento > mês da âncora → ano anterior (fatura cruzando virada de ano)", () => {
    expect(anchorTransactionYear(12, 20, "2026-01-05")).toBe("2025-12-20");
  });

  it("rejeita mês fora de 1-12", () => {
    expect(() => anchorTransactionYear(0, 10, "2026-03-10")).toThrow(/Mês inválido/);
    expect(() => anchorTransactionYear(13, 10, "2026-03-10")).toThrow(/Mês inválido/);
  });

  it("rejeita dia fora de 1-31", () => {
    expect(() => anchorTransactionYear(3, 0, "2026-03-10")).toThrow(/Dia inválido/);
    expect(() => anchorTransactionYear(3, 32, "2026-03-10")).toThrow(/Dia inválido/);
  });

  it("rejeita data-âncora em formato inválido", () => {
    expect(() => anchorTransactionYear(3, 10, "10/03/2026")).toThrow(/Data-âncora inválida/);
    expect(() => anchorTransactionYear(3, 10, "")).toThrow(/Data-âncora inválida/);
  });

  it("rejeita data que não existe no calendário (dia inválido pro mês)", () => {
    expect(() => anchorTransactionYear(2, 30, "2026-03-01")).toThrow(/não existe/);
    expect(() => anchorTransactionYear(4, 31, "2026-05-01")).toThrow(/não existe/);
  });

  it("aceita 29 de fevereiro em ano bissexto e rejeita em ano comum", () => {
    expect(anchorTransactionYear(2, 29, "2028-03-01")).toBe("2028-02-29");
    expect(() => anchorTransactionYear(2, 29, "2026-03-01")).toThrow(/não existe/);
  });
});

describe("validatePdfExtraction — valida o retorno bruto da IA", () => {
  const validRaw = {
    document_date: "2026-03-10",
    statement_type: "bank_statement",
    negative_convention: "minus_prefix",
    transactions: [{ day: 5, month: 3, description: "  Mercado  ", amount_text: " -32,10 " }],
  };

  it("aceita um payload válido e normaliza (trim) description/amount_text", () => {
    const result = validatePdfExtraction(validRaw);
    expect(result.document_date).toBe("2026-03-10");
    expect(result.statement_type).toBe("bank_statement");
    expect(result.negative_convention).toBe("minus_prefix");
    expect(result.transactions).toEqual([
      { day: 5, month: 3, description: "Mercado", amount_text: "-32,10" },
    ]);
  });

  it("rejeita document_date ausente ou em formato errado", () => {
    expect(() => validatePdfExtraction({ ...validRaw, document_date: undefined })).toThrow(
      /data de vencimento\/fechamento/,
    );
    expect(() => validatePdfExtraction({ ...validRaw, document_date: "10/03/2026" })).toThrow(
      /data de vencimento\/fechamento/,
    );
  });

  it("rejeita statement_type desconhecido", () => {
    expect(() => validatePdfExtraction({ ...validRaw, statement_type: "invoice" })).toThrow(
      /Tipo de documento não reconhecido/,
    );
  });

  it("rejeita negative_convention desconhecida", () => {
    expect(() => validatePdfExtraction({ ...validRaw, negative_convention: "weird" })).toThrow(
      /Convenção de sinal negativo não reconhecida/,
    );
  });

  it("rejeita transactions vazio ou ausente", () => {
    expect(() => validatePdfExtraction({ ...validRaw, transactions: [] })).toThrow(
      /Nenhum lançamento foi encontrado/,
    );
    expect(() => validatePdfExtraction({ ...validRaw, transactions: undefined })).toThrow(
      /Nenhum lançamento foi encontrado/,
    );
  });

  it("rejeita lançamento com dia/mês/descrição/valor inválido, apontando o índice", () => {
    expect(() =>
      validatePdfExtraction({
        ...validRaw,
        transactions: [{ day: 40, month: 3, description: "x", amount_text: "1" }],
      }),
    ).toThrow(/Lançamento 1: dia inválido/);

    expect(() =>
      validatePdfExtraction({
        ...validRaw,
        transactions: [{ day: 5, month: 13, description: "x", amount_text: "1" }],
      }),
    ).toThrow(/Lançamento 1: mês inválido/);

    expect(() =>
      validatePdfExtraction({
        ...validRaw,
        transactions: [{ day: 5, month: 3, description: "  ", amount_text: "1" }],
      }),
    ).toThrow(/Lançamento 1: descrição vazia/);

    expect(() =>
      validatePdfExtraction({
        ...validRaw,
        transactions: [{ day: 5, month: 3, description: "x", amount_text: "  " }],
      }),
    ).toThrow(/Lançamento 1: valor vazio/);
  });
});
