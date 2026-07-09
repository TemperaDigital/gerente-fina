import { describe, it, expect } from "vitest";
import {
  solveFV,
  solvePV,
  solvePMT,
  solveN,
  solveI,
  inputDigit,
  inputOperator,
  inputEquals,
  inputPercent,
  inputToggleSign,
  inputClear,
  INITIAL_BASIC_CALC_STATE,
  type BasicCalcState,
} from "./hp12c";

describe("TVM — solveFV", () => {
  it("juros compostos simples (sem PMT): 1000 a 1%/mês por 12 meses", () => {
    const fv = solveFV({ n: 12, i: 0.01, pv: -1000, pmt: 0 });
    expect(fv).toBeCloseTo(1126.8250301, 5);
  });

  it("i = 0 é degenerado (soma linear)", () => {
    const fv = solveFV({ n: 12, i: 0, pv: -1000, pmt: -50 });
    expect(fv).toBeCloseTo(1600, 8);
  });
});

describe("TVM — solvePMT (parcela de financiamento)", () => {
  it("financiamento de 1000 a 2%/mês em 12 parcelas", () => {
    const pmt = solvePMT({ n: 12, i: 0.02, pv: 1000, fv: 0 });
    expect(pmt).toBeCloseTo(-94.5596, 3);
  });
});

describe("TVM — solveN", () => {
  it("recupera N a partir do cenário do financiamento acima", () => {
    const n = solveN({ i: 0.02, pv: 1000, pmt: -94.5596, fv: 0 });
    expect(n).toBeCloseTo(12, 2);
  });
});

describe("TVM — solveI", () => {
  it("recupera i a partir do cenário do financiamento acima", () => {
    const i = solveI({ n: 12, pv: 1000, pmt: -94.5596, fv: 0 });
    expect(i).toBeCloseTo(0.02, 4);
  });

  it("lança erro quando não há troca de sinal nos fluxos (sem solução)", () => {
    expect(() => solveI({ n: 12, pv: 1000, pmt: 50, fv: 500 })).toThrow();
  });
});

describe("TVM — solvePV", () => {
  it("é a inversa de solveFV", () => {
    const fv = solveFV({ n: 24, i: 0.015, pv: -2000, pmt: -30 });
    const pv = solvePV({ n: 24, i: 0.015, pmt: -30, fv });
    expect(pv).toBeCloseTo(-2000, 6);
  });
});

describe("Calculadora básica", () => {
  const type = (state: BasicCalcState, s: string): BasicCalcState =>
    s.split("").reduce((acc, ch) => inputDigit(acc, ch), state);

  it("2 + 3 = 5", () => {
    let s = INITIAL_BASIC_CALC_STATE;
    s = type(s, "2");
    s = inputOperator(s, "+");
    s = type(s, "3");
    s = inputEquals(s);
    expect(s.display).toBe("5");
  });

  it("encadeia operações: 2 + 3 × 4 = 20 (avaliação sequencial, sem precedência)", () => {
    let s = INITIAL_BASIC_CALC_STATE;
    s = type(s, "2");
    s = inputOperator(s, "+");
    s = type(s, "3");
    s = inputOperator(s, "×");
    s = type(s, "4");
    s = inputEquals(s);
    expect(s.display).toBe("20");
  });

  it("divisão por zero mostra Erro", () => {
    let s = INITIAL_BASIC_CALC_STATE;
    s = type(s, "5");
    s = inputOperator(s, "÷");
    s = type(s, "0");
    s = inputEquals(s);
    expect(s.display).toBe("Erro");
  });

  it("porcentagem: 200 + 10% = 220", () => {
    let s = INITIAL_BASIC_CALC_STATE;
    s = type(s, "200");
    s = inputOperator(s, "+");
    s = type(s, "10");
    s = inputPercent(s);
    s = inputEquals(s);
    expect(s.display).toBe("220");
  });

  it("troca de sinal", () => {
    let s = INITIAL_BASIC_CALC_STATE;
    s = type(s, "7");
    s = inputToggleSign(s);
    expect(s.display).toBe("-7");
    s = inputToggleSign(s);
    expect(s.display).toBe("7");
  });

  it("clear volta ao estado inicial", () => {
    let s = INITIAL_BASIC_CALC_STATE;
    s = type(s, "123");
    s = inputClear();
    expect(s).toEqual(INITIAL_BASIC_CALC_STATE);
  });
});
