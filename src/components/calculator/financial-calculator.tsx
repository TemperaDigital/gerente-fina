/**
 * FinancialCalculator — calculadora básica + financeira estilo HP12C.
 * Componente único reaproveitado tanto na rota dedicada (/calculadora)
 * quanto no botão flutuante global (AppShell) — mesma UI nos dois lugares.
 */
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  INITIAL_BASIC_CALC_STATE,
  inputDigit,
  inputOperator,
  inputEquals,
  inputPercent,
  inputToggleSign,
  inputClear,
  formatCalcResult,
  solveFV,
  solvePV,
  solvePMT,
  solveN,
  solveI,
  type BasicOp,
  type BasicCalcState,
} from "@/lib/finance/hp12c";

// ---------------------------------------------------------------------------
// Calculadora básica (4 operações + %)
// ---------------------------------------------------------------------------
function CalcKey({
  label,
  onClick,
  variant = "default",
  className,
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "muted" | "op" | "equals";
  className?: string;
}) {
  const variantClass =
    variant === "op"
      ? "bg-primary/15 text-primary hover:bg-primary/25"
      : variant === "equals"
        ? "bg-primary text-primary-foreground hover:bg-primary/90"
        : variant === "muted"
          ? "bg-white/[0.04] text-foreground/60 hover:bg-white/10"
          : "bg-white/[0.06] text-foreground hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-12 rounded-xl text-base font-medium tabular-nums transition-colors",
        variantClass,
        className,
      )}
    >
      {label}
    </button>
  );
}

function BasicCalculatorPad() {
  const [state, setState] = useState<BasicCalcState>(INITIAL_BASIC_CALC_STATE);

  const digit = (d: string) => setState((s) => inputDigit(s, d));
  const op = (o: BasicOp) => setState((s) => inputOperator(s, o));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-right">
        <div className="truncate font-mono text-3xl font-semibold tabular-nums text-emerald-300">
          {state.display}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <CalcKey label="C" variant="muted" onClick={() => setState(inputClear())} />
        <CalcKey label="±" variant="muted" onClick={() => setState((s) => inputToggleSign(s))} />
        <CalcKey label="%" variant="muted" onClick={() => setState((s) => inputPercent(s))} />
        <CalcKey label="÷" variant="op" onClick={() => op("÷")} />

        <CalcKey label="7" onClick={() => digit("7")} />
        <CalcKey label="8" onClick={() => digit("8")} />
        <CalcKey label="9" onClick={() => digit("9")} />
        <CalcKey label="×" variant="op" onClick={() => op("×")} />

        <CalcKey label="4" onClick={() => digit("4")} />
        <CalcKey label="5" onClick={() => digit("5")} />
        <CalcKey label="6" onClick={() => digit("6")} />
        <CalcKey label="−" variant="op" onClick={() => op("-")} />

        <CalcKey label="1" onClick={() => digit("1")} />
        <CalcKey label="2" onClick={() => digit("2")} />
        <CalcKey label="3" onClick={() => digit("3")} />
        <CalcKey label="+" variant="op" onClick={() => op("+")} />

        <CalcKey label="0" className="col-span-2" onClick={() => digit("0")} />
        <CalcKey label="," onClick={() => digit(".")} />
        <CalcKey label="=" variant="equals" onClick={() => setState((s) => inputEquals(s))} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculadora financeira (TVM — N, i, PV, PMT, FV)
// ---------------------------------------------------------------------------
type RegKey = "n" | "i" | "pv" | "pmt" | "fv";

const REG_LABELS: Record<RegKey, string> = {
  n: "N — períodos",
  i: "i — % ao período",
  pv: "PV — valor presente",
  pmt: "PMT — parcela",
  fv: "FV — valor futuro",
};

const REG_ORDER: RegKey[] = ["n", "i", "pv", "pmt", "fv"];

function FinancialCalculatorPad() {
  const [values, setValues] = useState<Record<RegKey, string>>({
    n: "",
    i: "",
    pv: "",
    pmt: "",
    fv: "",
  });
  const [error, setError] = useState<string | null>(null);

  function updateValue(key: RegKey, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setError(null);
  }

  function clearAll() {
    setValues({ n: "", i: "", pv: "", pmt: "", fv: "" });
    setError(null);
  }

  function solveFor(target: RegKey) {
    setError(null);
    const num = (key: RegKey): number => {
      const raw = values[key].trim().replace(",", ".");
      if (raw === "") throw new Error(`Preencha "${REG_LABELS[key]}" antes de resolver.`);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) throw new Error(`Valor inválido em "${REG_LABELS[key]}".`);
      return parsed;
    };

    try {
      let result: number;
      switch (target) {
        case "fv":
          result = solveFV({ n: num("n"), i: num("i") / 100, pv: num("pv"), pmt: num("pmt") });
          break;
        case "pv":
          result = solvePV({ n: num("n"), i: num("i") / 100, pmt: num("pmt"), fv: num("fv") });
          break;
        case "pmt":
          result = solvePMT({ n: num("n"), i: num("i") / 100, pv: num("pv"), fv: num("fv") });
          break;
        case "n":
          result = solveN({ i: num("i") / 100, pv: num("pv"), pmt: num("pmt"), fv: num("fv") });
          break;
        case "i":
          result = solveI({ n: num("n"), pv: num("pv"), pmt: num("pmt"), fv: num("fv") }) * 100;
          break;
      }
      setValues((prev) => ({ ...prev, [target]: formatCalcResult(result) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao calcular.");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-foreground/50">
        Convenção HP12C: dinheiro que <strong>entra</strong> no seu bolso é positivo, que{" "}
        <strong>sai</strong> é negativo. Preencha os outros 4 campos e toque "Resolver" no que
        quer calcular.
      </p>

      <div className="space-y-2">
        {REG_ORDER.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <Label htmlFor={`hp12c-${key}`} className="w-36 shrink-0 text-xs text-foreground/70">
              {REG_LABELS[key]}
            </Label>
            <Input
              id={`hp12c-${key}`}
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => updateValue(key, e.target.value)}
              placeholder="0"
              className="font-mono tabular-nums"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => solveFor(key)}
            >
              Resolver
            </Button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="button" variant="ghost" size="sm" className="w-full" onClick={clearAll}>
        Limpar tudo
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function FinancialCalculator() {
  return (
    <Tabs defaultValue="basica" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="basica">Básica</TabsTrigger>
        <TabsTrigger value="financeira">Financeira (HP12C)</TabsTrigger>
      </TabsList>
      <TabsContent value="basica" className="pt-3">
        <BasicCalculatorPad />
      </TabsContent>
      <TabsContent value="financeira" className="pt-3">
        <FinancialCalculatorPad />
      </TabsContent>
    </Tabs>
  );
}
