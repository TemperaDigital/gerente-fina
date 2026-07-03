/**
 * CategoryDonut — "Para onde foi meu dinheiro este mês".
 *
 * Donut (PieChart com innerRadius) das despesas do mês por categoria.
 * - Fatias usam a COR escolhida pelo usuário na categoria (icon-picker);
 *   categorias sem cor recebem uma paleta de fallback determinística.
 * - Top 6 categorias + agregado "Outros".
 * - Centro exibe o total do mês; legenda lateral com CategoryIcon.
 */
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CategoryIcon } from "@/components/categories/icon-picker";
import type { CategoryBreakdownDTO } from "@/services/dashboard.functions";

const FALLBACK_COLORS = [
  "#818cf8", "#34d399", "#f87171", "#fbbf24",
  "#38bdf8", "#e879f9", "#fb923c", "#a3e635",
];

const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);

interface Slice {
  name: string;
  value: number;
  color: string;
  icon: string | null;
  count: number;
}

function buildSlices(data: CategoryBreakdownDTO[], maxSlices = 6): Slice[] {
  const top = data.slice(0, maxSlices);
  const rest = data.slice(maxSlices);

  const slices: Slice[] = top.map((c, i) => ({
    name: c.category_name,
    value: c.total_amount,
    color: c.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    icon: c.icon,
    count: c.transactions_count,
  }));

  if (rest.length > 0) {
    slices.push({
      name: `Outros (${rest.length})`,
      value: rest.reduce((s, c) => s + c.total_amount, 0),
      color: "#52525b",
      icon: null,
      count: rest.reduce((s, c) => s + c.transactions_count, 0),
    });
  }
  return slices;
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Slice }>;
}) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-sm text-xs min-w-[150px]">
      <p className="font-semibold mb-1 flex items-center gap-1.5" style={{ color: s.color }}>
        <CategoryIcon icon={s.icon} color={s.color} className="size-3.5" />
        {s.name}
      </p>
      <p className="font-mono font-bold text-zinc-100">{BRL(s.value)}</p>
      <p className="text-zinc-500 mt-0.5">{s.count} lançamento{s.count !== 1 ? "s" : ""}</p>
    </div>
  );
}

export function CategoryDonut({ data }: { data: CategoryBreakdownDTO[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-foreground/30 text-center px-4">
        Nenhuma despesa categorizada neste mês.
      </div>
    );
  }

  const slices = buildSlices(data);
  const total = data.reduce((s, c) => s + c.total_amount, 0);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {/* Donut com total no centro */}
      <div className="relative w-[180px] h-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={84}
              paddingAngle={2}
              strokeWidth={0}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} fillOpacity={0.9} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-foreground/40 font-semibold">
            Total
          </span>
          <span className="font-mono text-sm font-bold text-foreground/90">
            {BRL(total)}
          </span>
        </div>
      </div>

      {/* Legenda com ícones e percentuais */}
      <ul className="flex-1 w-full space-y-1.5 text-xs">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.name} className="flex items-center gap-2">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-md"
                style={{ background: `${s.color}1a` }}
              >
                <CategoryIcon icon={s.icon} color={s.color} className="size-3" />
              </span>
              <span className="truncate text-foreground/70 flex-1">{s.name}</span>
              <span className="font-mono text-foreground/40 shrink-0">{pct}%</span>
              <span className="font-mono font-semibold text-foreground/80 shrink-0 min-w-[64px] text-right">
                {BRL(s.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
