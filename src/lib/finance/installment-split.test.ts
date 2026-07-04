import { describe, it, expect } from "vitest";
import { estimateInstallmentSeries } from "./installment-split";

describe("estimateInstallmentSeries", () => {
  it("estima o total multiplicando a parcela conhecida pela quantidade", () => {
    const result = estimateInstallmentSeries("83.33", 12);
    expect(result.totalAmount).toBe("999.96");
    expect(result.amounts).toHaveLength(12);
    expect(result.amounts.every((a) => a === "83.33")).toBe(true);
  });

  it("funciona com 1 parcela (caso degenerado)", () => {
    const result = estimateInstallmentSeries("100.00", 1);
    expect(result.totalAmount).toBe("100.00");
    expect(result.amounts).toEqual(["100.00"]);
  });

  it("lança erro para quantidade de parcelas inválida", () => {
    expect(() => estimateInstallmentSeries("100.00", 0)).toThrow();
    expect(() => estimateInstallmentSeries("100.00", -1)).toThrow();
  });

  it("lança erro para valor de parcela inválido", () => {
    expect(() => estimateInstallmentSeries("abc", 12)).toThrow();
    expect(() => estimateInstallmentSeries("0", 12)).toThrow();
    expect(() => estimateInstallmentSeries("-10.00", 12)).toThrow();
  });
});
