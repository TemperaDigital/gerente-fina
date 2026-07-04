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
import { useRef, type ComponentType } from "react";
import {
  Utensils,
  ShoppingCart,
  ShoppingBag,
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
  Shapes,
  Landmark,
  Wallet,
  ArrowLeftRight,
  Upload,
  X,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Catálogo: nome persistido → { componente, rótulo pt-BR }
// ---------------------------------------------------------------------------
export const CATEGORY_ICONS: Record<
  string,
  { Icon: ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }
> = {
  utensils:       { Icon: Utensils,      label: "Alimentação" },
  "shopping-cart":{ Icon: ShoppingCart,  label: "Supermercado" },
  "shopping-bag": { Icon: ShoppingBag,   label: "Compras" },
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
  shapes:         { Icon: Shapes,        label: "Diversos" },
  landmark:       { Icon: Landmark,      label: "Financeiro" },
  wallet:         { Icon: Wallet,        label: "Receitas" },
  "arrow-left-right": { Icon: ArrowLeftRight, label: "Transferências" },
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
/** Ícone customizado enviado pelo usuário — persistido como data URI em `icon`. */
function isCustomIconDataUri(icon: string): boolean {
  return icon.startsWith("data:image/svg+xml") || icon.startsWith("data:image/png");
}

export function CategoryIcon({
  icon,
  color,
  className,
}: {
  icon: string | null | undefined;
  color?: string | null;
  className?: string;
}) {
  // Ícone customizado: SEMPRE via <img src="data:...">, nunca innerHTML — um
  // SVG carregado como <img> não executa <script>/handlers embutidos, então
  // isso é seguro mesmo aceitando upload livre do usuário.
  if (icon && isCustomIconDataUri(icon)) {
    return (
      <img
        src={icon}
        alt=""
        className={cn("size-4 object-contain", className)}
      />
    );
  }

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
// Upload de ícone customizado (.svg/.png, máx. 50 KB) — validado no cliente
// ANTES de processar. Persistido como data URI direto em `categories.icon`
// (coluna já aceita texto longo). Nunca renderizado via innerHTML — sempre
// <img src="data:...">, que não executa script embutido em SVG.
// ---------------------------------------------------------------------------
const MAX_CUSTOM_ICON_BYTES = 50 * 1024;
const ALLOWED_CUSTOM_ICON_TYPES = ["image/svg+xml", "image/png"];
const ICON_IMPORT_ERROR_MESSAGE =
  "Não foi possível importar o ícone. O arquivo deve ser um SVG ou PNG válido e ter um tamanho máximo de 50 KB para evitar lentidão no painel.";

function isValidCustomIconFile(file: File): boolean {
  const nameLower = file.name.toLowerCase();
  const extOk = nameLower.endsWith(".svg") || nameLower.endsWith(".png");
  const typeOk = file.type === "" || ALLOWED_CUSTOM_ICON_TYPES.includes(file.type);
  return extOk && typeOk && file.size > 0 && file.size <= MAX_CUSTOM_ICON_BYTES;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleCustomIconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isValidCustomIconFile(file)) {
      toast.error(ICON_IMPORT_ERROR_MESSAGE);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChangeIcon(reader.result);
    };
    reader.onerror = () => toast.error(ICON_IMPORT_ERROR_MESSAGE);
    reader.readAsDataURL(file);
  }

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

      {/* Upload de ícone customizado */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".svg,.png,image/svg+xml,image/png"
            className="hidden"
            onChange={handleCustomIconChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <Upload className="size-3.5" /> Carregar ícone personalizado
          </button>
          {value && isCustomIconDataUri(value) && (
            <button
              type="button"
              onClick={() => onChangeIcon(null)}
              title="Remover ícone personalizado"
              className="text-zinc-500 transition-colors hover:text-rose-400"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-zinc-600">Aceita SVG ou PNG · máximo 50 KB</p>
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
