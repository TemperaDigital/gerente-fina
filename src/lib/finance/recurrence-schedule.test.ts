import { describe, it, expect } from "vitest";
import { computeNextRun, occurrencesUntil } from "./recurrence-schedule";

describe("computeNextRun", () => {
  it("avança frequência diária pelo interval_count", () => {
    expect(
      computeNextRun("2026-07-01", { frequency: "daily", interval_count: 3, day_of_month: null }),
    ).toBe("2026-07-04");
  });

  it("avança frequência mensal respeitando day_of_month", () => {
    expect(
      computeNextRun("2026-01-31", { frequency: "monthly", interval_count: 1, day_of_month: 31 }),
    ).toBe("2026-02-28"); // fevereiro não tem 31 — cai no último dia
  });

  it("avança frequência anual", () => {
    expect(
      computeNextRun("2026-03-10", { frequency: "yearly", interval_count: 1, day_of_month: 10 }),
    ).toBe("2027-03-10");
  });

  it("lança erro para frequência 'once' — não há próxima ocorrência", () => {
    expect(() =>
      computeNextRun("2026-07-01", { frequency: "once", interval_count: 1, day_of_month: null }),
    ).toThrow();
  });
});

describe("occurrencesUntil — caso especial 'once'", () => {
  const onceRec = { frequency: "once" as const, interval_count: 1, day_of_month: null };

  it("retorna a própria data quando já chegou", () => {
    expect(occurrencesUntil("2026-07-01", "2026-07-05", onceRec, null)).toEqual(["2026-07-01"]);
  });

  it("retorna vazio quando a data ainda não chegou", () => {
    expect(occurrencesUntil("2026-07-10", "2026-07-05", onceRec, null)).toEqual([]);
  });

  it("nunca chama computeNextRun (não lança erro mesmo sendo 'once')", () => {
    expect(() => occurrencesUntil("2026-07-01", "2026-07-01", onceRec, null)).not.toThrow();
  });
});

describe("occurrencesUntil — frequências recorrentes (regressão)", () => {
  it("gera múltiplas ocorrências mensais em atraso", () => {
    const rec = { frequency: "monthly" as const, interval_count: 1, day_of_month: 5 };
    expect(occurrencesUntil("2026-01-05", "2026-03-05", rec, null)).toEqual([
      "2026-01-05",
      "2026-02-05",
      "2026-03-05",
    ]);
  });

  it("respeita end_on como limite", () => {
    const rec = { frequency: "monthly" as const, interval_count: 1, day_of_month: 5 };
    expect(occurrencesUntil("2026-01-05", "2026-06-05", rec, "2026-02-05")).toEqual([
      "2026-01-05",
      "2026-02-05",
    ]);
  });
});
