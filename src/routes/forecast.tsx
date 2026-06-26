/**
 * Rota /forecast — Visualização preditiva simples do fluxo de caixa.
 * Gráfico de linha SVG nativo (sem libs pesadas) baseado em recorrências e parcelas.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getForecast, type ForecastPointDTO } from "@/services/forecast.functions";

interface ForecastSearch {
  days: number;
}

const forecastQ = (days: number) =>
  queryOptions({
    queryKey: ["forecast", days],
    queryFn: () => getForecast({ data: { days } }),
  });

export const Route = createFileRoute("/forecast")({
  head: () => ({ meta: [{ title: "Previsão — Gerente Fina" }] }),
  validateSearch: (raw): ForecastSearch => {
    const n = Number(raw.days);
    return { days: [30, 60, 90, 180].includes(n) ? n : 60 };
  },
  loaderDeps: ({ search: { days } }) => ({ days }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(forecastQ(deps.days));
  },
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="p-6 text-rose-400">{error.message}</div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-6 text-foreground/60">Indisponível.</div>
    </AppShell>
  ),
  component: ForecastPage,
});

function ForecastPage() {
  const { days } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: points } = useSuspenseQuery(forecastQ(days));

  const last = points[points.length - 1];
  const first = points[0];
  const totalIncome = sumStr(points.map((p) => p.income));
  const totalExpense = sumStr(points.map((p) => p.expense));

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              Previsão de Fluxo de Caixa
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Projeção determinística baseada em recorrências e parcelas pendentes.
            </p>
          </div>
          <Select
            value={String(days)}
            onValueChange={(v) =>
              navigate({ search: () => ({ days: Number(v) }) })
            }
          >
            <SelectTrigger className="w-[140px] border-white/10 bg-white/[0.04]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="180">180 dias</SelectItem>
            </SelectContent>
          </Select>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <Mini
            label="Saldo final projetado"
            value={last?.cumulative ?? "0.00"}
            tone={last?.cumulative.startsWith("-") ? "rose" : "emerald"}
          />
          <Mini
            label={`Entradas no período`}
            value={totalIncome}
            icon={<TrendingUp className="size-4 text-emerald-400" />}
          />
          <Mini
            label={`Saídas no período`}
            value={totalExpense}
            icon={<TrendingDown className="size-4 text-rose-400" />}
          />
        </div>

        <GlassCard className="mt-4 p-4 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold">
            Curva de saldo projetado
          </h2>
          <ForecastChart points={points} />
          <div className="mt-3 flex items-center justify-between text-[11px] text-foreground/50">
            <span>{first?.date}</span>
            <span>{last?.date}</span>
          </div>
        </GlassCard>

        <GlassCard className="mt-4 overflow-hidden">
          <div className="border-b border-white/5 px-5 py-3 text-sm font-semibold">
            Dias com movimentação prevista
          </div>
          <ul className="divide-y divide-white/5">
            {points
              .filter((p) => p.income !== "0.00" || p.expense !== "0.00")
              .slice(0, 30)
              .map((p) => (
                <li
                  key={p.date}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2 text-sm"
                >
                  <span className="tabular-nums text-foreground/60">{p.date}</span>
                  <div className="flex gap-3 text-xs">
                    {p.income !== "0.00" && (
                      <span className="text-emerald-300 tabular-nums">
                        +{formatBRL(p.income)}
                      </span>
                    )}
                    {p.expense !== "0.00" && (
                      <span className="text-rose-300 tabular-nums">
                        −{formatBRL(p.expense)}
                      </span>
                    )}
                  </div>
                  <span
                    className={
                      p.cumulative.startsWith("-")
                        ? "text-sm font-semibold tabular-nums text-rose-300"
                        : "text-sm font-semibold tabular-nums"
                    }
                  >
                    {formatBRL(p.cumulative)}
                  </span>
                </li>
              ))}
            {points.every((p) => p.income === "0.00" && p.expense === "0.00") && (
              <li className="px-5 py-8 text-center text-sm text-foreground/50">
                Nenhum evento previsto no horizonte.
              </li>
            )}
          </ul>
        </GlassCard>
      </div>
    </AppShell>
  );
}

function Mini({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "rose";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "rose"
      ? "text-rose-400"
      : tone === "emerald"
      ? "text-emerald-400"
      : "text-foreground";
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-foreground/60">
        <span className="truncate">{label}</span>
        {icon}
      </div>
      <div className={`mt-2 text-xl font-semibold tabular-nums ${toneClass}`}>
        {formatBRL(value)}
      </div>
    </GlassCard>
  );
}

function ForecastChart({ points }: { points: ForecastPointDTO[] }) {
  if (points.length === 0) return null;
  const values = points.map((p) => Number(p.cumulative));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const W = 1000;
  const H = 220;
  const PAD = 10;

  const path = points
    .map((p, i) => {
      const x = PAD + (i / (points.length - 1 || 1)) * (W - 2 * PAD);
      const y =
        H - PAD - ((Number(p.cumulative) - min) / range) * (H - 2 * PAD);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const zeroY = H - PAD - ((0 - min) / range) * (H - 2 * PAD);

  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-black/30 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full sm:h-56" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(99,102,241,0.55)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </linearGradient>
        </defs>
        <line
          x1={PAD}
          x2={W - PAD}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(255,255,255,0.15)"
          strokeDasharray="4 4"
        />
        <path
          d={`${path} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`}
          fill="url(#gFill)"
        />
        <path d={path} stroke="rgb(129,140,248)" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
}

function sumStr(arr: string[]): string {
  let cents = 0;
  for (const s of arr) cents += Math.round(Number(s) * 100);
  return (cents / 100).toFixed(2);
}
