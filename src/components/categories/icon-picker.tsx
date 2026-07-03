/**
 * IconPicker — Galeria curada de ícones e cores para categorias.
 *
 * Persistência: guardamos apenas o NOME do ícone (string, ex: "utensils") na
 * coluna `categories.icon` e o hex na coluna `categories.color`. O componente
 * <CategoryIcon /> mapeia nome → componente lucide, com fallback <Tag />.
 *
 * <CategoryIcon /> é exportado para reúso em qualquer tela que exiba
 * categorias (lançamentos, orçamentos, dashboard, importador...).
 */
import type { ComponentType } from "react";
import {
  Utensils,
  ShoppingCart,
  Car,
  Fuel,
  Bus,
  Home,
  Zap,
  Droplets,
  Wifi,
  Smartphone,
  HeartPulse,
  Pill,
  GraduationCap,
  BookOpen,
  Shirt,
  Gamepad2,
  Clapperboard,
  Plane,
  PawPrint,
  Gift,
  Wrench,
  Briefcase,
  Banknote,
  TrendingUp,
  PiggyBank,
  HandCoins,
  Receipt,
  CreditCard,
  Baby,
  Dumbbell,
  Scissors,
  Coffee,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Catálogo: nome persistido → { componente, rótulo pt-BR }
// ---------------------------------------------------------------------------
export const CATEGORY_ICONS: Record<
  string,
  { Icon: ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }
> = {
  utensils:       { Icon: Utensils,      label: "Alimentação" },
  "shopping-cart":{ Icon: ShoppingCart,  label: "Mercado" },
  coffee:         { Icon: Coffee,        label: "Café/Lanches" },
  car:            { Icon: Car,           label: "Carro" },
  fuel:           { Icon: Fuel,          label: "Combustível" },
  bus:            { Icon: Bus,           label: "Transporte" },
  home:           { Icon: Home,          label: "Moradia" },
  zap:            { Icon: Zap,           label: "Energia" },
  droplets:       { Icon: Droplets,      label: "Água" },
  wifi:           { Icon: Wifi,          label: "Internet" },
  smartphone:     { Icon: Smartphone,    label: "Telefone" },
  "heart-pulse":  { Icon: HeartPulse,    label: "Saúde" },
  pill:           { Icon: Pill,          label: "Farmácia" },
  "graduation-cap":{ Icon: GraduationCap,label: "Educação" },
  "book-open":    { Icon: BookOpen,      label: "Livros/Cursos" },
  shirt:          { Icon: Shirt,         label: "Vestuário" },
  gamepad:        { Icon: Gamepad2,      label: "Lazer/Games" },
  clapperboard:   { Icon: Clapperboard,  label: "Streaming" },
  plane:          { Icon: Plane,         label: "Viagem" },
  "paw-print":    { Icon: PawPrint,      label: "Pets" },
  gift:           { Icon: Gift,          label: "Presentes" },
  wrench:         { Icon: Wrench,        label: "Manutenção" },
  briefcase:      { Icon: Briefcase,     label: "Trabalho" },
  banknote:       { Icon: Banknote,      label: "Salário" },
  "hand-coins":   { Icon: HandCoins,     label: "Freelas" },
  "trending-up":  { Icon: TrendingUp,    label: "Investimentos" },
  "piggy-bank":   { Icon: PiggyBank,     label: "Poupança" },
  receipt:        { Icon: Receipt,       label: "Impostos/Taxas" },
  "credit-card":  { Icon: CreditCard,    label: "Cartão/Anuidade" },
  baby:           { Icon: Baby,          label: "Filhos" },
  dumbbell:       { Icon: Dumbbell,      label: "Academia" },
  scissors:       { Icon: Scissors,      label: "Beleza" },
};

// Paleta compacta (hex persistido em categories.color)
export const CATEGORY_COLORS = [
  "#818cf8", // índigo (padrão)
  "#34d399", // esmeralda
  "#f87171", // vermelho
  "#fbbf24", // âmbar
  "#38bdf8", // céu
  "#e879f9", // fúcsia
  "#fb923c", // laranja
  "#a3e635", // lima
] as const;

// ---------------------------------------------------------------------------
// CategoryIcon — renderiza o ícone de uma categoria em qualquer tela
// ---------------------------------------------------------------------------
export function CategoryIcon({
  icon,
  color,
  className,
}: {
  icon: string | null | undefined;
  color?: string | null;
  className?: string;
}) {
  const entry = icon ? CATEGORY_ICONS[icon] : undefined;
  const Cmp = entry?.Icon ?? Tag;
  return (
    <Cmp
      className={cn("size-4", className)}
      style={color ? { color } : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// IconPicker — grade de seleção para o modal de categoria
// ---------------------------------------------------------------------------
export function IconPicker({
  value,
  color,
  onChangeIcon,
  onChangeColor,
}: {
  value: string | null;
  color: string | null;
  onChangeIcon: (icon: string | null) => void;
  onChangeColor: (color: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Grade de ícones */}
      <div className="grid grid-cols-8 gap-1.5 max-h-[136px] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2">
        {Object.entries(CATEGORY_ICONS).map(([name, { Icon, label }]) => {
          const active = value === name;
          return (
            <button
              key={name}
              type="button"
              title={label}
              onClick={() => onChangeIcon(active ? null : name)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-lg transition-all",
                active
                  ? "bg-white/10 ring-1 ring-inset scale-105"
                  : "hover:bg-white/5 text-zinc-500 hover:text-zinc-300",
              )}
              style={active ? { color: color ?? CATEGORY_COLORS[0], boxShadow: `inset 0 0 0 1px ${color ?? CATEGORY_COLORS[0]}` } : undefined}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>

      {/* Paleta de cores */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Cor</span>
        <div className="flex gap-1.5">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChangeColor(color === c ? null : c)}
              className={cn(
                "size-5 rounded-full transition-transform",
                color === c ? "scale-125 ring-2 ring-white/40 ring-offset-1 ring-offset-zinc-900" : "hover:scale-110 opacity-70 hover:opacity-100",
              )}
              style={{ background: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
