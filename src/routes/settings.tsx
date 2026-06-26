/**
 * Rota /settings — Hub de configurações com 4 abas (Master/Detail Otimizado).
 * Aba ativa controlada via search param ?tab=
 */
import { useState } from "react";
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  User,
  Tags,
  Repeat,
  Receipt,
  Plus,
  Trash2,
  Power,
  Calendar,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import {
  listCategories,
  createCategory,
  archiveCategory,
} from "@/services/categories.functions";
import {
  listRecurrences,
  toggleRecurrenceActive,
  deleteRecurrence,
} from "@/services/recurrences.functions";
import {
  listInvoiceMasters,
  getInvoiceDetail,
} from "@/services/invoices.functions";
import { getAccountsLookup } from "@/services/lookups.functions";
import { cn } from "@/lib/utils";

type Tab = "profile" | "categories" | "recurrences" | "invoices";

interface SettingsSearch {
  tab: Tab;
  account_id?: string;
  ref?: string; // YYYY-MM
}

const categoriesQ = () =>
  queryOptions({ queryKey: ["settings", "categories"], queryFn: () => listCategories() });
const recurrencesQ = () =>
  queryOptions({ queryKey: ["settings", "recurrences"], queryFn: () => listRecurrences() });
const invoicesMastersQ = () =>
  queryOptions({ queryKey: ["settings", "invoice-masters"], queryFn: () => listInvoiceMasters() });
const accountsLookupQ = () =>
  queryOptions({ queryKey: ["lookup", "accounts"], queryFn: () => getAccountsLookup() });
const invoiceDetailQ = (account_id?: string, ref?: string) =>
  queryOptions({
    queryKey: ["settings", "invoice-detail", account_id, ref],
    queryFn: () =>
      account_id
        ? getInvoiceDetail({ data: { account_id, reference_month: ref } })
        : Promise.resolve({ months: [], current: null, lines: [] }),
    enabled: !!account_id,
  });

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Configurações — Gerente Fina" }] }),
  validateSearch: (raw): SettingsSearch => {
    const allowed: Tab[] = ["profile", "categories", "recurrences", "invoices"];
    const t = typeof raw.tab === "string" && allowed.includes(raw.tab as Tab)
      ? (raw.tab as Tab)
      : "profile";
    return {
      tab: t,
      account_id: typeof raw.account_id === "string" ? raw.account_id : undefined,
      ref: typeof raw.ref === "string" && /^\d{4}-\d{2}$/.test(raw.ref)
        ? raw.ref
        : undefined,
    };
  },
  component: SettingsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="p-6 text-rose-400">{error.message}</div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-6 text-foreground/60">Configurações indisponíveis.</div>
    </AppShell>
  ),
});

function SettingsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Configurações
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Perfil, categorias, recorrências e faturas.
          </p>
        </header>

        <Tabs
          value={search.tab}
          onValueChange={(v) =>
            navigate({ search: () => ({ tab: v as Tab }) })
          }
        >
          <TabsList className="grid w-full grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1 sm:grid-cols-4">
            <TabsTrigger value="profile" className="gap-2">
              <User className="size-4" /> Perfil
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Tags className="size-4" /> Categorias
            </TabsTrigger>
            <TabsTrigger value="recurrences" className="gap-2">
              <Repeat className="size-4" /> Recorrências
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="size-4" /> Faturas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <ProfileTab />
          </TabsContent>
          <TabsContent value="categories" className="mt-4">
            <CategoriesTab />
          </TabsContent>
          <TabsContent value="recurrences" className="mt-4">
            <RecurrencesTab />
          </TabsContent>
          <TabsContent value="invoices" className="mt-4">
            <InvoicesTab search={search} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------
function ProfileTab() {
  return (
    <GlassCard className="p-6">
      <h2 className="text-base font-semibold">Perfil do usuário</h2>
      <p className="mt-1 text-sm text-foreground/60">
        Sistema monousuário. A camada de autenticação será plugada em uma
        rodada futura — por enquanto o Gerente Fina opera sob o primeiro
        usuário cadastrado em <code className="rounded bg-white/10 px-1">auth.users</code>.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs uppercase tracking-wider text-foreground/50">
            Idioma
          </Label>
          <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
            Português do Brasil (pt-BR)
          </div>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-foreground/50">
            Tema
          </Label>
          <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
            Dark Mode Premium (ZimaOS)
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------
function CategoriesTab() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(categoriesQ());
  const createFn = useServerFn(createCategory);
  const archiveFn = useServerFn(archiveCategory);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");

  const create = useMutation({
    mutationFn: () => createFn({ data: { name: name.trim(), kind } }),
    onSuccess: () => {
      toast.success("Categoria criada.");
      setName("");
      qc.invalidateQueries({ queryKey: ["settings", "categories"] });
      qc.invalidateQueries({ queryKey: ["lookup"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: (id: string) => archiveFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Categoria arquivada.");
      qc.invalidateQueries({ queryKey: ["settings", "categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const active = data.filter((c) => !c.archived_at);
  const income = active.filter((c) => c.kind === "income");
  const expense = active.filter((c) => c.kind === "expense");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,2fr]">
      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold">Nova categoria</h3>
        <div className="mt-3 space-y-3">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Mercado"
              className="mt-1 border-white/10 bg-white/[0.04]"
            />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "income" | "expense")}>
              <SelectTrigger className="mt-1 border-white/10 bg-white/[0.04]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Despesa</SelectItem>
                <SelectItem value="income">Receita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="w-full gap-2"
          >
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
      </GlassCard>

      <div className="space-y-4">
        <CategoryList title="Despesas" items={expense} onArchive={(id) => archive.mutate(id)} />
        <CategoryList title="Receitas" items={income} onArchive={(id) => archive.mutate(id)} />
      </div>
    </div>
  );
}

function CategoryList({
  title,
  items,
  onArchive,
}: {
  title: string;
  items: Array<{ id: string; name: string; icon: string | null; color: string | null }>;
  onArchive: (id: string) => void;
}) {
  return (
    <GlassCard className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary" className="bg-white/10 text-foreground/70">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-foreground/50">
          Sem categorias cadastradas.
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
            >
              <div className="flex items-center gap-2 truncate text-sm">
                <span
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ background: c.color ?? "#888" }}
                />
                <span className="truncate">{c.name}</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-foreground/50 hover:text-rose-400"
                onClick={() => onArchive(c.id)}
                aria-label="Arquivar"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Recorrências
// ---------------------------------------------------------------------------
function RecurrencesTab() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(recurrencesQ());
  const toggleFn = useServerFn(toggleRecurrenceActive);
  const deleteFn = useServerFn(deleteRecurrence);

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      toggleFn({ data: v }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "recurrences"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Recorrência removida.");
      qc.invalidateQueries({ queryKey: ["settings", "recurrences"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <GlassCard className="overflow-hidden">
      <div className="border-b border-white/5 px-5 py-4">
        <h3 className="text-sm font-semibold">Recorrências ativas e pausadas</h3>
        <p className="mt-1 text-xs text-foreground/50">
          Crie novas pela tela <span className="text-foreground/80">Novo lançamento</span>.
        </p>
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-foreground/50">
          Nenhuma recorrência cadastrada.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {data.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto]"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.description}</div>
                <div className="mt-0.5 text-xs text-foreground/50">
                  {r.account_name ?? "—"} · {r.category_name ?? "—"}
                </div>
              </div>
              <div className="hidden text-xs text-foreground/60 sm:block">
                {r.frequency === "monthly"
                  ? "Mensal"
                  : r.frequency === "weekly"
                  ? "Semanal"
                  : r.frequency === "daily"
                  ? "Diária"
                  : "Anual"}
                {" · próx. "}
                {r.next_run_on}
              </div>
              <div
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  r.kind === "income" ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {formatBRL(r.amount)}
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                <Switch
                  checked={r.active}
                  onCheckedChange={(active) =>
                    toggle.mutate({ id: r.id, active })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-foreground/50 hover:text-rose-400"
                  onClick={() => remove.mutate(r.id)}
                  aria-label="Excluir"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Faturas — Master/Detail (Seção 4.1 PRD)
// ---------------------------------------------------------------------------
function InvoicesTab({ search }: { search: SettingsSearch }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: masters } = useSuspenseQuery(invoicesMastersQ());

  // Seleção inicial: primeiro cartão com fatura aberta
  const selectedId =
    search.account_id ??
    masters.find((m) => m.open_invoice)?.account_id ??
    masters[0]?.account_id;

  const { data: detail } = useSuspenseQuery(
    invoiceDetailQ(selectedId, search.ref),
  );

  const setAccount = (id: string) =>
    navigate({
      search: () => ({ tab: "invoices" as const, account_id: id }),
    });
  const setRef = (ref: string) =>
    navigate({
      search: (prev: SettingsSearch) => ({
        tab: "invoices" as const,
        account_id: prev.account_id ?? selectedId,
        ref,
      }),
    });

  return (
    <div className="space-y-4">
      {/* Camada Master — cards horizontais compactos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {masters.length === 0 && (
          <GlassCard className="col-span-full p-6 text-center text-sm text-foreground/50">
            Nenhum cartão cadastrado ainda.
          </GlassCard>
        )}
        {masters.map((m) => {
          const active = m.account_id === selectedId;
          return (
            <button
              key={m.account_id}
              onClick={() => setAccount(m.account_id)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-all",
                "border-white/10 bg-white/[0.04] backdrop-blur-xl hover:bg-white/[0.07]",
                active && "border-primary/60 bg-primary/10 shadow-lg shadow-primary/20",
              )}
            >
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span className="truncate">{m.account_name}</span>
                {m.open_invoice && (
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-300">
                    Aberta
                  </Badge>
                )}
              </div>
              <div className="mt-2 text-xl font-semibold tabular-nums">
                {m.open_invoice ? formatBRL(m.open_invoice.total_amount) : "—"}
              </div>
              <div className="mt-1 text-[11px] text-foreground/50">
                {m.open_invoice
                  ? `Vence em ${m.open_invoice.due_date}`
                  : "Sem fatura aberta"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Camada Detail */}
      {selectedId && (
        <GlassCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="size-4 text-foreground/60" />
              Lançamentos da fatura
            </div>
            {detail.months.length > 0 && (
              <Select
                value={detail.current?.reference_month ?? ""}
                onValueChange={(v) => setRef(v.slice(0, 7))}
              >
                <SelectTrigger className="h-8 w-[200px] border-white/10 bg-white/[0.04] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {detail.months.map((m) => (
                    <SelectItem key={m.invoice_id} value={m.reference_month}>
                      {m.reference_month.slice(0, 7)} · {m.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {!detail.current ? (
            <div className="px-5 py-10 text-center text-sm text-foreground/50">
              Sem faturas para este cartão.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 border-b border-white/5 px-5 py-3 text-xs">
                <Stat label="Vencimento" value={detail.current.due_date} />
                <Stat label="Fechamento" value={detail.current.closing_date} />
                <Stat
                  label="Total"
                  value={formatBRL(detail.current.total_amount)}
                  strong
                />
              </div>
              {detail.lines.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-foreground/50">
                  Esta fatura ainda não possui lançamentos.
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {detail.lines.map((l) => (
                    <li
                      key={l.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5"
                    >
                      <span className="text-xs tabular-nums text-foreground/60">
                        {l.occurred_on.slice(5)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm">{l.description}</div>
                        <div className="text-[11px] text-foreground/50">
                          {l.category_name ?? "—"}
                        </div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums text-rose-300">
                        {formatBRL(l.amount)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </GlassCard>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-foreground/50">
        {label}
      </div>
      <div className={cn("mt-0.5 tabular-nums", strong ? "text-base font-semibold" : "text-sm")}>
        {value}
      </div>
    </div>
  );
}

export function _Skeletons() {
  return <Skeleton className="h-4 w-full" />;
}
