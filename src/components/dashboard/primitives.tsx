/**
 * Componentes do Dashboard — Gerente Fina.
 * Visual: Dark Mode Premium / vidro fosco (estilo ZimaOS).
 * Headless: recebe DTOs prontos das server functions, não consulta nada.
 */
import { useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Formatação BRL — opera sobre strings numeric(14,2). Sem Number/parseFloat.
// ---------------------------------------------------------------------------
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(amount: string): string {
  // Number aqui é seguro APENAS para display — todo cálculo já foi feito em
  // BigInt no servidor; aqui só vira pixel.
  const n = Number(amount);
  return BRL.format(Number.isFinite(n) ? n : 0);
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function formatMonthLabel(month: string /* YYYY-MM */): string {
  const [y, m] = month.split("-");
  return `${MONTHS_PT[Number(m) - 1] ?? ""} de ${y}`;
}

// ---------------------------------------------------------------------------
// Glass card — vidro fosco premium
// ---------------------------------------------------------------------------
export function GlassCard({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10",
        "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
        "backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
        "before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none",
        "before:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_60%)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GooglePeriodPicker — seletor de mês flutuante
// ---------------------------------------------------------------------------
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function GooglePeriodPicker({
  value,
  onChange,
}: {
  value: string; // YYYY-MM
  onChange: (next: string) => void;
}) {
  const year = Number(value.split("-")[0]);
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        idx: i,
        label: MONTHS_PT[i].slice(0, 3),
        value: `${year}-${String(i + 1).padStart(2, "0")}`,
      })),
    [year],
  );

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl">
      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-full text-foreground/70 hover:bg-white/10 hover:text-foreground"
        onClick={() => onChange(addMonths(value, -1))}
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-4" />
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 gap-2 rounded-full px-3 text-sm font-medium text-foreground hover:bg-white/10"
          >
            <CalendarDays className="size-4 opacity-70" />
            {formatMonthLabel(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-72 rounded-2xl border-white/10 bg-zinc-900/95 p-3 text-foreground backdrop-blur-xl pointer-events-auto"
        >
          <div className="mb-3 flex items-center justify-between">
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full"
              onClick={() => onChange(`${year - 1}-${value.split("-")[1]}`)}
              aria-label="Ano anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-sm font-semibold tracking-wide">{year}</div>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full"
              onClick={() => onChange(`${year + 1}-${value.split("-")[1]}`)}
              aria-label="Próximo ano"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {months.map((m) => {
              const active = m.value === value;
              return (
                <button
                  key={m.value}
                  onClick={() => onChange(m.value)}
                  className={cn(
                    "h-10 rounded-xl text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                      : "text-foreground/80 hover:bg-white/10",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-full text-foreground/70 hover:bg-white/10 hover:text-foreground"
        onClick={() => onChange(addMonths(value, 1))}
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PeriodPicker — seletor de mês OU ano inteiro (Missão 17, Dashboard)
//
// Reaproveita o mesmo padrão visual/interação do GooglePeriodPicker acima
// (popover + navegação de ano + grade de 12 meses) — não duplica do zero,
// só generaliza o value/onChange pra também representar "ano inteiro" e
// acrescenta o botão correspondente. GooglePeriodPicker continua intocado
// (usado em /transactions, só mês) pra não arriscar regressão lá.
// ---------------------------------------------------------------------------
export type DashboardPeriod = { mode: "month"; month: string } | { mode: "year"; year: number };

export function periodLabel(period: DashboardPeriod): string {
  return period.mode === "year" ? `Ano de ${period.year}` : formatMonthLabel(period.month);
}

function periodYear(period: DashboardPeriod): number {
  return period.mode === "year" ? period.year : Number(period.month.split("-")[0]);
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (next: DashboardPeriod) => void;
}) {
  const year = periodYear(value);
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        idx: i,
        label: MONTHS_PT[i].slice(0, 3),
        value: `${year}-${String(i + 1).padStart(2, "0")}`,
      })),
    [year],
  );

  function step(delta: number) {
    if (value.mode === "year") {
      onChange({ mode: "year", year: value.year + delta });
    } else {
      onChange({ mode: "month", month: addMonths(value.month, delta) });
    }
  }

  function stepYear(delta: number) {
    if (value.mode === "year") {
      onChange({ mode: "year", year: value.year + delta });
    } else {
      onChange({ mode: "month", month: `${year + delta}-${value.month.split("-")[1]}` });
    }
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl">
      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-full text-foreground/70 hover:bg-white/10 hover:text-foreground"
        onClick={() => step(-1)}
        aria-label={value.mode === "year" ? "Ano anterior" : "Mês anterior"}
      >
        <ChevronLeft className="size-4" />
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 gap-2 rounded-full px-3 text-sm font-medium text-foreground hover:bg-white/10"
          >
            <CalendarDays className="size-4 opacity-70" />
            {periodLabel(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-72 rounded-2xl border-white/10 bg-zinc-900/95 p-3 text-foreground backdrop-blur-xl pointer-events-auto"
        >
          <div className="mb-3 flex items-center justify-between">
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full"
              onClick={() => stepYear(-1)}
              aria-label="Ano anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-sm font-semibold tracking-wide">{year}</div>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full"
              onClick={() => stepYear(1)}
              aria-label="Próximo ano"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <button
            onClick={() => onChange({ mode: "year", year })}
            className={cn(
              "mb-2 h-9 w-full rounded-xl text-sm font-medium transition-colors",
              value.mode === "year"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                : "border border-white/10 text-foreground/80 hover:bg-white/10",
            )}
          >
            Ano inteiro
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            {months.map((m) => {
              const active = value.mode === "month" && m.value === value.month;
              return (
                <button
                  key={m.value}
                  onClick={() => onChange({ mode: "month", month: m.value })}
                  className={cn(
                    "h-10 rounded-xl text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                      : "text-foreground/80 hover:bg-white/10",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-full text-foreground/70 hover:bg-white/10 hover:text-foreground"
        onClick={() => step(1)}
        aria-label={value.mode === "year" ? "Próximo ano" : "Próximo mês"}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------
export function KpiCard({
  label,
  amount,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  amount: string; // numeric string
  hint?: string;
  tone?: "neutral" | "positive" | "negative";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
      ? "text-rose-400"
      : "text-foreground";

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
          {label}
        </span>
        {icon && <span className="text-foreground/50">{icon}</span>}
      </div>
      <div className={cn("mt-3 text-3xl font-semibold tracking-tight", toneClass)}>
        {formatBRL(amount)}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-foreground/50">{hint}</div>
      )}
    </GlassCard>
  );
}

export function KpiSkeleton() {
  return (
    <GlassCard className="p-5">
      <Skeleton className="h-3 w-20 bg-white/10" />
      <Skeleton className="mt-4 h-8 w-32 bg-white/10" />
      <Skeleton className="mt-2 h-3 w-24 bg-white/10" />
    </GlassCard>
  );
}
