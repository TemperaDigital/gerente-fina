/**
 * Componentes da Rota /transactions.
 * Visual: vidro fosco / ZimaOS. Headless — recebe DTOs prontos.
 */
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard as CardIcon,
  Search,
  CheckCircle2,
  Trash2,
  Merge,
  Layers,
  Repeat,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import type {
  TransactionListItemDTO,
  TransactionKind,
  ReviewGroupDTO,
} from "@/services/transactions.functions";
import type {
  AccountLookupDTO,
  CategoryLookupDTO,
} from "@/services/lookups.functions";

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------
export interface FiltersValue {
  search: string;
  account_id?: string;
  category_id?: string;
  kind?: TransactionKind;
}

export function FiltersBar({
  value,
  accounts,
  categories,
  onChange,
}: {
  value: FiltersValue;
  accounts: AccountLookupDTO[];
  categories: CategoryLookupDTO[];
  onChange: (next: FiltersValue) => void;
}) {
  const [localSearch, setLocalSearch] = useState(value.search);
  return (
    <GlassCard className="flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[220px] flex-1">
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-foreground/50">
          Buscar
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
          <Input
            placeholder="Descrição..."
            className="h-9 border-white/10 bg-white/[0.04] pl-9 text-sm text-foreground placeholder:text-foreground/30 focus-visible:ring-primary/40"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onBlur={() => onChange({ ...value, search: localSearch })}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                onChange({ ...value, search: localSearch });
            }}
          />
        </div>
      </div>

      <FilterSelect
        label="Conta"
        value={value.account_id ?? "all"}
        onChange={(v) =>
          onChange({ ...value, account_id: v === "all" ? undefined : v })
        }
        options={[
          { value: "all", label: "Todas" },
          ...accounts.map((a) => ({ value: a.id, label: a.name })),
        ]}
      />

      <FilterSelect
        label="Categoria"
        value={value.category_id ?? "all"}
        onChange={(v) =>
          onChange({ ...value, category_id: v === "all" ? undefined : v })
        }
        options={[
          { value: "all", label: "Todas" },
          ...categories.map((c) => ({
            value: c.id,
            label: `${c.kind === "income" ? "↑" : "↓"} ${c.name}`,
          })),
        ]}
      />

      <FilterSelect
        label="Tipo"
        value={value.kind ?? "all"}
        onChange={(v) =>
          onChange({
            ...value,
            kind: v === "all" ? undefined : (v as TransactionKind),
          })
        }
        options={[
          { value: "all", label: "Todos" },
          { value: "income", label: "Receita" },
          { value: "expense", label: "Despesa" },
          { value: "transfer", label: "Transferência" },
          { value: "invoice_payment", label: "Pgto. Fatura" },
        ]}
      />
    </GlassCard>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-[160px]">
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-foreground/50">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 border-white/10 bg-white/[0.04] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------
function kindMeta(kind: TransactionKind) {
  switch (kind) {
    case "income":
      return { icon: ArrowUpCircle, color: "text-emerald-400", label: "Receita" };
    case "expense":
      return { icon: ArrowDownCircle, color: "text-rose-400", label: "Despesa" };
    case "transfer":
      return { icon: ArrowLeftRight, color: "text-sky-400", label: "Transferência" };
    case "invoice_payment":
      return { icon: CardIcon, color: "text-violet-400", label: "Pgto. Fatura" };
  }
}

function formatBR(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function TransactionsTable({
  items,
  page,
  pageSize,
  total,
  onPageChange,
}: {
  items: TransactionListItemDTO[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const grouped = useMemo(() => {
    const m = new Map<string, TransactionListItemDTO[]>();
    for (const it of items) {
      const key = it.occurred_on;
      m.set(key, [...(m.get(key) ?? []), it]);
    }
    return Array.from(m.entries());
  }, [items]);

  return (
    <GlassCard className="overflow-hidden p-0">
      {items.length === 0 ? (
        <div className="p-12 text-center text-sm text-foreground/50">
          Nenhum lançamento encontrado com os filtros aplicados.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {grouped.map(([day, dayItems]) => (
            <li key={day}>
              <div className="bg-white/[0.02] px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/50">
                {formatBR(day)}
              </div>
              <ul className="divide-y divide-white/5">
                {dayItems.map((it) => (
                  <TransactionRow key={it.id} it={it} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between border-t border-white/5 px-5 py-3 text-xs text-foreground/60">
        <div>
          {total} lançamento{total === 1 ? "" : "s"} · página {page} de{" "}
          {lastPage}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="h-8 border border-white/10 bg-white/[0.04] hover:bg-white/10"
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
            className="h-8 border border-white/10 bg-white/[0.04] hover:bg-white/10"
          >
            Próxima
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}

function TransactionRow({ it }: { it: TransactionListItemDTO }) {
  const meta = kindMeta(it.kind);
  const Icon = meta.icon;
  const amountSign =
    it.kind === "income" ? "+" : it.kind === "expense" ? "−" : "";
  const amountColor =
    it.kind === "income"
      ? "text-emerald-400"
      : it.kind === "expense"
      ? "text-rose-400"
      : it.kind === "transfer"
      ? "text-sky-300"
      : "text-violet-300";

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.04]">
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-xl border border-white/5",
          "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
        )}
      >
        <Icon className={cn("size-4", meta.color)} />
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {it.description || meta.label}
          </span>
          {it.installment_progress && (
            <Badge
              variant="outline"
              className="gap-1 border-amber-400/30 bg-amber-400/10 px-1.5 py-0 text-[10px] font-semibold text-amber-300"
            >
              <Layers className="size-3" /> {it.installment_progress}
            </Badge>
          )}
          {it.recurrence_id && (
            <Badge
              variant="outline"
              className="gap-1 border-sky-400/30 bg-sky-400/10 px-1.5 py-0 text-[10px] font-semibold text-sky-300"
            >
              <Repeat className="size-3" /> Recorrente
            </Badge>
          )}
          {it.kind === "transfer" && it.transfer_counterpart_name && (
            <Badge
              variant="outline"
              className="border-sky-400/30 bg-sky-400/10 px-1.5 py-0 text-[10px] font-semibold text-sky-300"
            >
              🔁 {it.type === "debit" ? "Para" : "De"}:{" "}
              {it.transfer_counterpart_name}
            </Badge>
          )}
          {it.kind === "invoice_payment" && (
            <Badge
              variant="outline"
              className="border-violet-400/30 bg-violet-400/10 px-1.5 py-0 text-[10px] font-semibold text-violet-300"
            >
              Fatura
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-foreground/50">
          {it.account_name ?? "—"}
          {it.category_name ? ` · ${it.category_name}` : ""}
        </div>
      </div>

      <div className={cn("text-right text-sm font-semibold tabular-nums", amountColor)}>
        {amountSign}
        {formatBRL(it.amount)}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Review Queue (fila de conciliação)
// ---------------------------------------------------------------------------
export function ReviewQueue({
  groups,
  onDiscard,
  onMerge,
}: {
  groups: ReviewGroupDTO[];
  onDiscard: (id: string, description: string) => void;
  onMerge: (keepId: string, absorbIds: string[]) => void;
}) {
  if (groups.length === 0) {
    return (
      <GlassCard className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-emerald-400" />
          <div>
            <div className="text-sm font-semibold text-foreground">
              Fila de conciliação limpa
            </div>
            <div className="text-xs text-foreground/50">
              Nenhuma duplicidade pendente de revisão.
            </div>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Fila de Revisão de Conciliação
          </h2>
          <p className="text-xs text-foreground/50">
            {groups.length} grupo{groups.length === 1 ? "" : "s"} com possível
            duplicidade detectada pelo hash.
          </p>
        </div>
      </div>
      <ul className="space-y-3">
        {groups.map((g) => (
          <li
            key={g.dedup_hash}
            className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3"
          >
            <div className="mb-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-amber-300/70">
              <span>hash {g.dedup_hash.slice(0, 12)}…</span>
              <span className="text-amber-300/50">
                Escolha qual lançamento manter — os demais serão absorvidos.
              </span>
            </div>
            <ul className="space-y-2">
              {g.items.map((it) => {
                const others = g.items.filter((x) => x.id !== it.id).map((x) => x.id);
                return (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2"
                  >
                    <div className="min-w-0 text-xs">
                      <div className="truncate font-medium text-foreground">
                        {it.description ?? "—"}
                      </div>
                      <div className="text-foreground/50">
                        {formatBR(it.occurred_on)} · {it.account_name ?? "—"} ·{" "}
                        {formatBRL(it.amount)}
                        {it.source && (
                          <span className="ml-2 rounded bg-white/5 px-1 py-px text-[10px] uppercase tracking-wider text-foreground/60">
                            {it.source}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs text-emerald-400 hover:bg-emerald-400/10"
                        onClick={() => onMerge(it.id, others)}
                        title="Manter este e absorver os demais"
                      >
                        <Merge className="size-3.5" /> Manter este
                      </Button>
                      <DiscardButton
                        description={it.description ?? "lançamento sem descrição"}
                        onConfirm={() =>
                          onDiscard(it.id, it.description ?? "lançamento")
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function DiscardButton({
  description,
  onConfirm,
}: {
  description: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 text-xs text-rose-400 hover:bg-rose-400/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" /> Descartar
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar lançamento?</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/60">
              Você está prestes a remover permanentemente o lançamento{" "}
              <span className="font-semibold text-foreground">
                "{description}"
              </span>
              . Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/[0.04] hover:bg-white/10">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-600"
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function TransactionsTableSkeleton() {
  return (
    <GlassCard className="p-5">
      <Skeleton className="h-5 w-40 bg-white/10" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-white/5" />
        ))}
      </div>
    </GlassCard>
  );
}
