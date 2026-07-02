/**
 * CashflowChart — Gráfico de Fluxo de Caixa do Dashboard.
 *
 * Gráfico de barras agrupadas (Receitas × Despesas) + linha de resultado
 * líquido. Usa recharts puro (sem o wrapper shadcn/chart) para controle
 * total de cores e tooltip customizado no dark theme.
 *
 * Props:
 *   data   — array de MonthlyDreDTO (últimos N meses, já preenchido com zeros)
 *   height — altura do SVG em px (default: 220)
 */
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type { MonthlyDreDTO } from "@/services/dashboard.functions";

interface CashflowChartProps {
  data: MonthlyDreDTO[];
  height?: number;
}

const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);

// Tooltip customizado no dark theme do projeto
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-sm text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-zinc-200 border-b border-white/10 pb-1.5 mb-1.5 capitalize">
        {label}
      </p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5" style={{ color: p.color }}>
            <span
              className="inline-block size-2 rounded-sm"
              style={{ background: p.color }}
            />
            {p.name}
          </span>
          <span className="font-mono font-semibold text-zinc-200">
            {BRL(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CashflowChart({ data, height = 220 }: CashflowChartProps) {
  if (!data.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-foreground/30"
      >
        Nenhum lançamento encontrado no período.
      </div>
    );
  }

  // Formata os dados para recharts (valores positivos)
  const chartData = data.map((d) => ({
    label: d.label,
    Receitas: d.income,
    Despesas: d.expense,
    Resultado: d.net_result,
  }));

  const hasNegative = data.some((d) => d.net_result < 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={chartData}
        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        barGap={3}
        barCategoryGap="28%"
      >
        {/* Grid */}
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.05)"
          vertical={false}
        />

        {/* Eixos */}
        <XAxis
          dataKey="label"
          tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          dy={6}
        />
        <YAxis
          tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
          }
          width={38}
        />

        {/* Linha de zero quando há resultado negativo */}
        {hasNegative && (
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 2" />
        )}

        {/* Barras */}
        <Bar
          dataKey="Receitas"
          fill="#10b981"
          radius={[4, 4, 0, 0]}
          fillOpacity={0.85}
          maxBarSize={40}
        />
        <Bar
          dataKey="Despesas"
          fill="#f43f5e"
          radius={[4, 4, 0, 0]}
          fillOpacity={0.85}
          maxBarSize={40}
        />

        {/* Linha de resultado líquido */}
        <Line
          type="monotone"
          dataKey="Resultado"
          stroke="#818cf8"
          strokeWidth={2}
          dot={{ r: 3, fill: "#818cf8", strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 0 }}
        />

        {/* Tooltip e legenda */}
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value: string) => (
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{value}</span>
          )}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
