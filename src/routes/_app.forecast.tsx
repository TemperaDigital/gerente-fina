/**
 * Rota /forecast — Motor Preditivo Real.
 * Consome getForecast() (média móvel diária + parcelas em aberto).
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  LineChart,
  RefreshCw,
  ArrowDownRight,
  Scale,
  Info,
  TrendingDown,
  CalendarClock,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getForecast, type ForecastResultDTO } from "@/services/forecast.functions";
import { toCents } from "@/lib/finance/money";

const forecastQuery = () =>
  queryOptions({
    queryKey: ["forecast", 90],
    queryFn: () => getForecast({ data: { days: 90 } }),
  });

export const Route = createFileRoute("/_app/forecast")({
  head: () => ({ meta: [{ title: "Previsões — Gerente Fina" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(forecastQuery()),
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="p-8 text-rose-400 text-sm">
        Falha ao carregar previsões: {(error as Error).message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-8 text-zinc-400 text-sm">Recurso não encontrado.</div>
    </AppShell>
  ),
  component: () => (
    <AppShell>
      <ForecastComponent />
    </AppShell>
  ),
});

function fmtBRL(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ForecastComponent() {
  const { data, refetch, isFetching } = useSuspenseQuery(forecastQuery());
  const result: ForecastResultDTO = data;

  // Amostragem: pontos a cada ~7 dias para a tabela
  const sampleStep = Math.max(1, Math.floor(result.points.length / 12));
  const sample = result.points.filter((_, i) => i % sampleStep === 0);

  // SVG polyline dos saldos projetados
  const cents = result.points.map((p) => Number(toCents(p.projected_balance)));
  const startCents = Number(toCents(result.current_balance));
  const allCents = [startCents, ...cents];
  const minC = Math.min(...allCents);
  const maxC = Math.max(...allCents);
  const range = Math.max(1, maxC - minC);
  const W = 500;
  const H = 220;
  const pad = 20;
  const pts = allCents.map((c, i) => {
    const x = pad + (i * (W - 2 * pad)) / (allCents.length - 1);
    const y = H - pad - ((c - minC) * (H - 2 * pad)) / range;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = pts.join(" ");
  const area = `${pad},${H - pad} ${polyline} ${W - pad},${H - pad}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            Motor Preditivo de Caixa
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Projeção diária dos próximos 90 dias baseada em média móvel de despesas e parcelas comprometidas.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="bg-zinc-900 border border-white/[0.06] hover:bg-white/[0.08] disabled:opacity-50 text-zinc-200 px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-400 ${isFetching ? "animate-spin" : ""}`} />
          <span>Recalcular</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard icon={<Scale className="w-5 h-5" />} label="Saldo Atual" value={fmtBRL(result.current_balance)} tone="indigo" />
        <KpiCard icon={<TrendingDown className="w-5 h-5" />} label="Média Diária de Gastos" value={fmtBRL(result.avg_daily_expense)} tone="rose" />
        <KpiCard icon={<CalendarClock className="w-5 h-5" />} label="Parcelas em Aberto (90d)" value={fmtBRL(result.total_installments_pending)} tone="amber" />
        <KpiCard icon={<ArrowDownRight className="w-5 h-5" />} label="Saldo Projetado (Fim)" value={fmtBRL(result.final_projected_balance)} tone={Number(result.final_projected_balance) < 0 ? "rose" : "emerald"} />
      </div>

      {result.days_of_runway !== null && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-sm text-rose-300 flex items-center gap-2">
          <Info className="w-4 h-4" /> Alerta: no ritmo atual, seu saldo consolidado zera em {result.days_of_runway} dias.
        </div>
      )}

      {/* Gráfico */}
      <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-4">
        <h2 className="text-base font-bold text-zinc-300 flex items-center gap-2">
          <LineChart className="w-4 h-4 text-zinc-500" /> Curva Projetada de Saldo (90 dias)
        </h2>
        <div className="w-full bg-zinc-950/40 rounded-xl border border-zinc-900 p-4 overflow-x-auto">
          <div className="min-w-[500px]">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-60">
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={area} fill="url(#g1)" />
              <polyline points={polyline} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Tabela amostrada */}
      <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-zinc-900/60 text-xs text-zinc-500 uppercase tracking-wider">
              <tr>
                <th className="p-4 text-left">Data</th>
                <th className="p-4 text-right">Escoamento Diário</th>
                <th className="p-4 text-right">Parcelas do Dia</th>
                <th className="p-4 text-right">Saldo Projetado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-sm text-zinc-300">
              {sample.map((p) => {
                const negative = Number(p.projected_balance) < 0;
                return (
                  <tr key={p.date} className="hover:bg-white/[0.01]">
                    <td className="p-4 font-semibold text-white">
                      {new Date(p.date + "T00:00:00Z").toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-4 text-right text-rose-400 font-mono">-{fmtBRL(p.daily_burn).replace("R$", "R$ ")}</td>
                    <td className="p-4 text-right text-amber-400 font-mono">
                      {Number(p.installments_due) > 0 ? `-${fmtBRL(p.installments_due)}` : "—"}
                    </td>
                    <td className={`p-4 text-right font-mono font-bold ${negative ? "text-rose-400" : "text-emerald-400"}`}>
                      {fmtBRL(p.projected_balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-zinc-900 flex items-start gap-2 text-xs text-zinc-500">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p>
            A média diária é calculada sobre os últimos 90 dias de despesas reais. Parcelas em aberto (installment_items sem transação vinculada) são deduzidas exatamente em suas datas de vencimento.
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "rose" | "emerald" | "amber";
}) {
  const map = {
    indigo: "bg-indigo-500/10 text-indigo-400",
    rose: "bg-rose-500/10 text-rose-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
  } as const;
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between shadow-lg">
      <div>
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold font-mono text-white mt-1">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${map[tone]}`}>{icon}</div>
    </div>
  );
}
