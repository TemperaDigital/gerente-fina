import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  addAmounts,
  sumAmounts,
  safePercent,
  isNegativeAmount,
  normalizeAmount,
} from "./money";

describe("toCents", () => {
  it("converte null/undefined para 0n", () => {
    expect(toCents(null)).toBe(0n);
    expect(toCents(undefined)).toBe(0n);
  });

  it("converte string vazia ou só espaços para 0n", () => {
    expect(toCents("")).toBe(0n);
    expect(toCents("   ")).toBe(0n);
  });

  it("converte strings maliciosas/inválidas para 0n em vez de lançar", () => {
    expect(toCents("abc")).toBe(0n);
    expect(toCents("R$ --")).toBe(0n);
    expect(toCents("NaN")).toBe(0n);
    expect(toCents("1e10")).toBe(0n);
    expect(toCents("<script>")).toBe(0n);
    expect(toCents("10.")).toBe(0n);
  });

  it("converte números finitos simples", () => {
    expect(toCents(10)).toBe(1000n);
    expect(toCents(10.5)).toBe(1050n);
    expect(toCents(0)).toBe(0n);
  });

  it("números não-finitos (Infinity/NaN) viram 0n", () => {
    expect(toCents(Infinity)).toBe(0n);
    expect(toCents(-Infinity)).toBe(0n);
    expect(toCents(NaN)).toBe(0n);
  });

  it("arredonda números com mais de 2 casas via toFixed(2), não trunca cegamente", () => {
    // (10.555).toFixed(2) === "10.55" (representação float real, não 10.56)
    expect(toCents(10.555)).toBe(1055n);
    // (10.005).toFixed(2) === "10.01"
    expect(toCents(10.005)).toBe(1001n);
    expect(toCents(-10.555)).toBe(-1055n);
  });

  it("converte strings numéricas simples com sinal", () => {
    expect(toCents("1234.56")).toBe(123456n);
    expect(toCents("-1234.56")).toBe(-123456n);
    expect(toCents("+1234.56")).toBe(123456n);
  });

  it("aceita prefixo R$ e espaços internos", () => {
    expect(toCents("R$ 1234,56")).toBe(123456n);
    expect(toCents("R$1234.56")).toBe(123456n);
    expect(toCents("  10  ")).toBe(1000n);
  });

  it("detecta separador decimal pt-BR (milhar com ponto, decimal com vírgula)", () => {
    expect(toCents("1.234,56")).toBe(123456n);
    expect(toCents("-1.234,56")).toBe(-123456n);
    expect(toCents("12.345.678,90")).toBe(1234567890n);
  });

  it("detecta separador decimal en-US (milhar com vírgula, decimal com ponto)", () => {
    expect(toCents("1,234.56")).toBe(123456n);
    expect(toCents("12,345,678.90")).toBe(1234567890n);
  });

  it("vírgula isolada (sem ponto) é tratada como decimal", () => {
    expect(toCents("10,5")).toBe(1050n);
    expect(toCents("0,01")).toBe(1n);
  });

  it("ponto isolado com 3+ casas decimais trunca para 2 (sem arredondar)", () => {
    // Regra real do parser: normalizeNumericString não usa toFixed para
    // strings com dot único — apenas fatia as 2 primeiras casas.
    expect(toCents("1.239")).toBe(123n);
  });

  it("zero à esquerda não quebra o parsing", () => {
    expect(toCents("007.50")).toBe(750n);
    expect(toCents("0.00")).toBe(0n);
  });

  it("valores muito grandes preservam precisão via BigInt", () => {
    expect(toCents("999999999999.99")).toBe(99999999999999n);
  });
});

describe("fromCents", () => {
  it("formata centavos positivos e negativos", () => {
    expect(fromCents(123456n)).toBe("1234.56");
    expect(fromCents(-123456n)).toBe("-1234.56");
  });

  it("formata zero como 0.00", () => {
    expect(fromCents(0n)).toBe("0.00");
  });

  it("preenche zero à esquerda nos centavos", () => {
    expect(fromCents(5n)).toBe("0.05");
    expect(fromCents(-5n)).toBe("-0.05");
    expect(fromCents(100n)).toBe("1.00");
  });

  it("é a inversa exata de toCents para valores canônicos", () => {
    expect(fromCents(toCents("1234.56"))).toBe("1234.56");
    expect(fromCents(toCents("-0.01"))).toBe("-0.01");
  });
});

describe("addAmounts", () => {
  it("soma múltiplos valores evitando o bug clássico de ponto flutuante", () => {
    // 0.1 + 0.2 !== 0.3 em float puro — via BigInt de centavos, é exato.
    expect(addAmounts(0.1, 0.2)).toBe("0.30");
  });

  it("soma strings com sinais variados", () => {
    expect(addAmounts("10.00", "20.50", "-5.25")).toBe("25.25");
  });

  it("retorna 0.00 sem argumentos", () => {
    expect(addAmounts()).toBe("0.00");
  });

  it("ignora entradas nulas/undefined na soma", () => {
    expect(addAmounts(null, undefined, "10")).toBe("10.00");
  });

  it("resulta em negativo quando a soma total é negativa (saldo devedor)", () => {
    expect(addAmounts("-1000.00", "-500.00")).toBe("-1500.00");
    expect(addAmounts("100.00", "-250.00")).toBe("-150.00");
  });
});

describe("sumAmounts", () => {
  it("soma uma lista de objetos com seletor", () => {
    const items = [{ amount: "10.00" }, { amount: "20.00" }, { amount: "-5.00" }];
    expect(sumAmounts(items, (i) => i.amount)).toBe("25.00");
  });

  it("retorna 0.00 para lista vazia", () => {
    expect(sumAmounts([], (i: { amount: string }) => i.amount)).toBe("0.00");
  });
});

describe("safePercent", () => {
  it("calcula percentual simples", () => {
    expect(safePercent("50", "200")).toBe(25);
  });

  it("divisor zero retorna 0 em vez de Infinity/NaN", () => {
    expect(safePercent("50", "0")).toBe(0);
    expect(safePercent("0", "0")).toBe(0);
  });

  it("entradas nulas retornam 0", () => {
    expect(safePercent(null, "100")).toBe(0);
    expect(safePercent(undefined, undefined)).toBe(0);
  });

  it("satura em 100 quando a parte excede o total (estouro de orçamento)", () => {
    expect(safePercent("300", "200")).toBe(100);
  });

  it("nunca retorna negativo mesmo com 'parte' negativa", () => {
    expect(safePercent("-50", "200")).toBe(0);
  });

  it("mantém 2 casas decimais de precisão no percentual", () => {
    expect(safePercent("1", "3")).toBeCloseTo(33.33, 2);
  });
});

describe("isNegativeAmount", () => {
  it("identifica negativo, zero e positivo corretamente", () => {
    expect(isNegativeAmount("-1")).toBe(true);
    expect(isNegativeAmount("-0.01")).toBe(true);
    expect(isNegativeAmount("0")).toBe(false);
    expect(isNegativeAmount("1")).toBe(false);
  });

  it("entradas nulas/vazias não são negativas", () => {
    expect(isNegativeAmount(null)).toBe(false);
    expect(isNegativeAmount(undefined)).toBe(false);
    expect(isNegativeAmount("")).toBe(false);
  });

  it("detecta saldo devedor e limite de cheque especial estourado", () => {
    expect(isNegativeAmount("-1500.00")).toBe(true);
    expect(isNegativeAmount(-1)).toBe(true);
  });
});

describe("normalizeAmount", () => {
  it("saneia entrada bagunçada para o formato canônico numeric(14,2)", () => {
    expect(normalizeAmount(" R$ 1.234,50 ")).toBe("1234.50");
    expect(normalizeAmount("abc")).toBe("0.00");
    expect(normalizeAmount(null)).toBe("0.00");
    expect(normalizeAmount(-10)).toBe("-10.00");
  });
});
