/**
 * Motor da calculadora financeira estilo HP12C — funções puras (TVM: Time
 * Value of Money) + uma calculadora de 4 operações básica.
 *
 * Convenção de sinal (mesma do HP12C real): dinheiro que ENTRA no seu bolso
 * é positivo, dinheiro que SAI é negativo. Um financiamento típico tem PV
 * positivo (você recebe o empréstimo) e PMT negativo (você paga as
 * parcelas) — ou vice-versa, dependendo do que está calculando. A
 * calculadora não corrige o sinal por você, igual a uma HP12C de verdade.
 *
 * Equação padrão de anuidade (fim de período — modo "END", o único
 * suportado aqui; "BEGIN" fica fora de escopo por ora):
 *
 *   PV·(1+i)ⁿ + PMT·[(1+i)ⁿ − 1]/i + FV = 0        (i ≠ 0)
 *   PV + PMT·n + FV = 0                              (i = 0)
 *
 * `i` é a taxa por período em fração decimal (0.01 = 1%), NÃO em percentual
 * — a camada de UI converte de/para percentual ao exibir.
 */

export interface TvmKnowns {
  n?: number;
  i?: number; // taxa por período, fração decimal (0.01 = 1%)
  pv?: number;
  pmt?: number;
  fv?: number;
}

function growthFactor(i: number, n: number): number {
  return Math.pow(1 + i, n);
}

export function solveFV({ n, i, pv, pmt }: Required<Omit<TvmKnowns, "fv">>): number {
  if (i === 0) return -(pv + pmt * n);
  const g = growthFactor(i, n);
  return -(pv * g + (pmt * (g - 1)) / i);
}

export function solvePV({ n, i, pmt, fv }: Required<Omit<TvmKnowns, "pv">>): number {
  if (i === 0) return -(fv + pmt * n);
  const g = growthFactor(i, n);
  return -(fv + (pmt * (g - 1)) / i) / g;
}

export function solvePMT({ n, i, pv, fv }: Required<Omit<TvmKnowns, "pmt">>): number {
  if (i === 0) {
    if (n === 0) throw new Error("N não pode ser zero para calcular PMT com i = 0.");
    return -(pv + fv) / n;
  }
  const g = growthFactor(i, n);
  if (g === 1) throw new Error("Combinação de N e i inválida (sem solução para PMT).");
  return (-(pv * g + fv) * i) / (g - 1);
}

export function solveN({ i, pv, pmt, fv }: Required<Omit<TvmKnowns, "n">>): number {
  if (i === 0) {
    if (pmt === 0) throw new Error("PMT não pode ser zero para calcular N com i = 0.");
    return -(pv + fv) / pmt;
  }
  const numerator = pmt / i - fv;
  const denominator = pv + pmt / i;
  if (denominator === 0 || numerator / denominator <= 0) {
    throw new Error("Não há solução real para N com esses valores.");
  }
  const g = numerator / denominator;
  return Math.log(g) / Math.log(1 + i);
}

/**
 * Resolve i (taxa por período) numericamente — não há fórmula fechada.
 * Newton-Raphson com derivada numérica (diferença central); cai pra
 * bisseção num intervalo amplo se Newton não convergir. Lança erro claro
 * se não convergir (ex.: fluxos de caixa sem troca de sinal — não há
 * taxa que resolva a equação).
 */
export function solveI({ n, pv, pmt, fv }: Required<Omit<TvmKnowns, "i">>): number {
  if (n <= 0) throw new Error("N deve ser maior que zero para calcular i.");

  const f = (i: number): number => {
    if (Math.abs(i) < 1e-12) return pv + pmt * n + fv;
    const g = growthFactor(i, n);
    return pv * g + (pmt * (g - 1)) / i + fv;
  };

  // Newton-Raphson a partir de um chute inicial (10% ao período — mesmo
  // ponto de partida usado por implementações de referência como RATE()).
  let i = 0.1;
  const h = 1e-6;
  for (let iter = 0; iter < 50; iter++) {
    const fi = f(i);
    if (!Number.isFinite(fi)) break;
    if (Math.abs(fi) < 1e-9) return i;
    const derivative = (f(i + h) - f(i - h)) / (2 * h);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    const next = i - fi / derivative;
    if (!Number.isFinite(next) || next <= -1) break;
    i = next;
  }

  // Fallback: bisseção entre -99% e um teto amplo (1000% ao período).
  let lo = -0.99;
  let hi = 10;
  let flo = f(lo);
  let fhi = f(hi);
  if (Number.isFinite(flo) && Number.isFinite(fhi) && flo * fhi <= 0) {
    for (let iter = 0; iter < 200; iter++) {
      const mid = (lo + hi) / 2;
      const fmid = f(mid);
      if (Math.abs(fmid) < 1e-9) return mid;
      if (flo * fmid <= 0) {
        hi = mid;
        fhi = fmid;
      } else {
        lo = mid;
        flo = fmid;
      }
    }
    return (lo + hi) / 2;
  }

  throw new Error(
    "Não foi possível calcular i com esses valores — confira os sinais (dinheiro que entra é positivo, que sai é negativo).",
  );
}

// -----------------------------------------------------------------------------
// Calculadora básica (4 operações + %) — reducer puro, testável isoladamente.
// -----------------------------------------------------------------------------

export type BasicOp = "+" | "-" | "×" | "÷";

export interface BasicCalcState {
  display: string;
  /** Valor acumulado antes do operador pendente. */
  accumulator: number | null;
  /** Operador aguardando o próximo operando. */
  pendingOp: BasicOp | null;
  /** true logo após um operador ser pressionado — próximo dígito começa um número novo. */
  awaitingOperand: boolean;
}

export const INITIAL_BASIC_CALC_STATE: BasicCalcState = {
  display: "0",
  accumulator: null,
  pendingOp: null,
  awaitingOperand: false,
};

function applyOp(op: BasicOp, a: number, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
  }
}

export function inputDigit(state: BasicCalcState, digit: string): BasicCalcState {
  if (state.awaitingOperand) {
    return { ...state, display: digit === "." ? "0." : digit, awaitingOperand: false };
  }
  if (digit === "." && state.display.includes(".")) return state;
  if (state.display === "0" && digit !== ".") return { ...state, display: digit };
  return { ...state, display: state.display + digit };
}

export function inputOperator(state: BasicCalcState, op: BasicOp): BasicCalcState {
  const current = Number(state.display);
  if (state.accumulator === null) {
    return { display: state.display, accumulator: current, pendingOp: op, awaitingOperand: true };
  }
  if (state.awaitingOperand) {
    // Troca o operador pendente sem recalcular (padrão comum de calculadora).
    return { ...state, pendingOp: op };
  }
  const result = applyOp(state.pendingOp!, state.accumulator, current);
  return {
    display: formatCalcResult(result),
    accumulator: result,
    pendingOp: op,
    awaitingOperand: true,
  };
}

export function inputEquals(state: BasicCalcState): BasicCalcState {
  if (state.pendingOp === null || state.accumulator === null) return state;
  const current = Number(state.display);
  const result = applyOp(state.pendingOp, state.accumulator, current);
  return {
    display: formatCalcResult(result),
    accumulator: null,
    pendingOp: null,
    awaitingOperand: true,
  };
}

export function inputPercent(state: BasicCalcState): BasicCalcState {
  const current = Number(state.display);
  const base = state.accumulator ?? current;
  const result = (base * current) / 100;
  return { ...state, display: formatCalcResult(result) };
}

export function inputToggleSign(state: BasicCalcState): BasicCalcState {
  if (state.display === "0") return state;
  return {
    ...state,
    display: state.display.startsWith("-") ? state.display.slice(1) : `-${state.display}`,
  };
}

export function inputClear(): BasicCalcState {
  return INITIAL_BASIC_CALC_STATE;
}

export function formatCalcResult(value: number): string {
  if (!Number.isFinite(value)) return "Erro";
  // Evita ruído de ponto flutuante (0.1 + 0.2) sem exagerar em casas decimais.
  const rounded = Math.round(value * 1e10) / 1e10;
  return String(rounded);
}
