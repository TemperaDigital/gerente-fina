/**
 * Rota /calculadora — calculadora básica + financeira (estilo HP12C) em
 * tela própria. O mesmo componente também abre em qualquer tela via o
 * botão flutuante global (ver AppShell).
 */
import { createFileRoute } from "@tanstack/react-router";
import { Calculator } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { GlassCard } from "@/components/dashboard/primitives";
import { FinancialCalculator } from "@/components/calculator/financial-calculator";

export const Route = createFileRoute("/_app/calculadora")({
  head: () => ({ meta: [{ title: "Calculadora — Gerente Fina" }] }),
  component: CalculadoraPage,
});

function CalculadoraPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-center gap-2.5">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Calculator className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Calculadora</h1>
            <p className="mt-0.5 text-sm text-foreground/50">
              Básica e financeira (estilo HP12C).
            </p>
          </div>
        </header>

        <GlassCard className="border border-white/10 p-5 sm:p-6">
          <FinancialCalculator />
        </GlassCard>
      </div>
    </AppShell>
  );
}
