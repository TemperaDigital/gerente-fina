/**
 * Rota /agendamentos — Contas a Vencer (Missão 7, Parte 2).
 *
 * Lista recurrences ativos agrupados por status (atrasado/próximos 30
 * dias/mais adiante). Ação por item depende do tipo de conta vinculada:
 *  - bank/cash: botão "Marcar como pago/recebido" (confirmScheduledItem) —
 *    o sistema NUNCA lança sozinho, precisa de confirmação contra o extrato.
 *  - credit_card: só um indicador informativo — o motor já lança sozinho.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { GlassCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  listScheduledItems,
  createScheduledItem,
  updateScheduledItem,
  deleteScheduledItem,
  confirmScheduledItem,
  type ScheduledItemDTO,
} from "@/services/scheduled-items.functions";
import { getAccountsLookup, getCategoriesLookup } from "@/services/lookups.functions";
import type { AccountLookupDTO, CategoryLookupDTO } from "@/services/lookups.functions";
import type { RecurrenceFrequency } from "@/lib/finance/recurrence-schedule";

const FREQ_LABEL: Record<RecurrenceFrequency, string> = {
  once: "Uma vez",
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

const formatBRL = (value: string | number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0) || 0,
  );

function formatBR(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(base: string, days: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function itemsQO(fn: () => Promise<ScheduledItemDTO[]>) {
  return queryOptions({ queryKey: ["agendamentos"], queryFn: fn });
}
function accountsQO(fn: () => Promise<AccountLookupDTO[]>) {
  return queryOptions({ queryKey: ["lookups", "accounts"], queryFn: fn });
}
function categoriesQO(fn: () => Promise<CategoryLookupDTO[]>) {
  return queryOptions({ queryKey: ["lookups", "categories"], queryFn: fn });
}

export const Route = createFileRoute("/_app/agendamentos")({
  head: () => ({ meta: [{ title: "Agendamentos — Gerente Fina" }] }),
  component: AgendamentosPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <GlassCard className="p-6 text-sm text-red-300">
          Erro ao carregar agendamentos: {error.message}
        </GlassCard>
      </div>
    </AppShell>
  ),
});

// ---------------------------------------------------------------------------
// Formulário (criação/edição) — único campo de data representa next_run_on.
// ---------------------------------------------------------------------------
interface FormState {
  id: string | null;
  description: string;
  amount: string;
  kind: "income" | "expense";
  account_id: string;
  category_id: string;
  frequency: RecurrenceFrequency;
  interval_count: string;
  date: string;
  end_on: string;
}

function emptyForm(): FormState {
  return {
    id: null,
    description: "",
    amount: "",
    kind: "expense",
    account_id: "",
    category_id: "",
    frequency: "monthly",
    interval_count: "1",
    date: todayIso(),
    end_on: "",
  };
}

function formFromItem(item: ScheduledItemDTO): FormState {
  return {
    id: item.id,
    description: item.description,
    amount: item.amount,
    kind: item.kind,
    account_id: item.account_id,
    category_id: item.category_id,
    frequency: item.frequency,
    interval_count: String(item.interval_count),
    date: item.next_run_on,
    end_on: item.end_on ?? "",
  };
}

function ScheduledItemFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  accounts,
  categories,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormState;
  setForm: (patch: Partial<FormState>) => void;
  accounts: AccountLookupDTO[];
  categories: CategoryLookupDTO[];
  onSave: () => void;
  isSaving: boolean;
}) {
  const filteredCategories = categories.filter((c) => c.kind === form.kind);
  const isEditing = form.id !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1 block text-xs text-foreground/60">Descrição</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ description: e.target.value })}
              placeholder="Ex.: Conta de luz, Aluguel, Netflix..."
              className="border-white/10 bg-white/[0.04]"
            />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-foreground/60">Tipo</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => setForm({ kind: v as "income" | "expense", category_id: "" })}
            >
              <SelectTrigger className="border-white/10 bg-white/[0.04]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                <SelectItem value="expense">Despesa</SelectItem>
                <SelectItem value="income">Receita</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-foreground/60">Valor esperado (R$)</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm({ amount: e.target.value })}
              className="border-white/10 bg-white/[0.04]"
            />
          </div>

          <div>
            <Label className="mb-1 block text-xs text-foreground/60">Conta</Label>
            <Select value={form.account_id} onValueChange={(v) => setForm({ account_id: v })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04]">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} {a.type === "credit_card" ? "(cartão)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-foreground/60">Categoria</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ category_id: v })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04]">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                {filteredCategories.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-foreground/40">
                    Nenhuma categoria de {form.kind === "income" ? "receita" : "despesa"}.
                  </div>
                ) : (
                  filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-foreground/60">Frequência</Label>
            <Select
              value={form.frequency}
              onValueChange={(v) => setForm({ frequency: v as RecurrenceFrequency })}
            >
              <SelectTrigger className="border-white/10 bg-white/[0.04]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                {(Object.keys(FREQ_LABEL) as RecurrenceFrequency[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQ_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.frequency !== "once" && (
            <div>
              <Label className="mb-1 block text-xs text-foreground/60">Intervalo</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={form.interval_count}
                onChange={(e) => setForm({ interval_count: e.target.value })}
                className="border-white/10 bg-white/[0.04]"
              />
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs text-foreground/60">
              {isEditing ? "Próxima data" : "Data"}
            </Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ date: e.target.value })}
              className="border-white/10 bg-white/[0.04]"
            />
          </div>

          {form.frequency !== "once" && (
            <div>
              <Label className="mb-1 block text-xs text-foreground/60">Término (opcional)</Label>
              <Input
                type="date"
                value={form.end_on}
                onChange={(e) => setForm({ end_on: e.target.value })}
                className="border-white/10 bg-white/[0.04]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Confirmação "Marcar como pago/recebido" — valor/data editáveis.
// ---------------------------------------------------------------------------
function ConfirmDialog({
  item,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  item: ScheduledItemDTO | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (amount: string, occurred_on: string) => void;
  isPending: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());

  useEffect(() => {
    if (item) {
      setAmount(item.amount);
      setOccurredOn(todayIso());
    }
  }, [item]);

  if (!item) return null;
  const verb = item.kind === "income" ? "recebido" : "pago";

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>
            Marcar "{item.description}" como {verb}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-foreground/50">
          O valor real pode diferir do esperado ({formatBRL(item.amount)}) — ajuste se necessário.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs text-foreground/60">Valor real (R$)</Label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-white/10 bg-white/[0.04]"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-foreground/60">Data real</Label>
            <Input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              className="border-white/10 bg-white/[0.04]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onConfirm(amount, occurredOn)} disabled={isPending}>
            {isPending ? "Confirmando..." : `Confirmar ${verb}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Linha de item
// ---------------------------------------------------------------------------
function ScheduledItemRow({
  item,
  urgent,
  onEdit,
  onDelete,
  onConfirm,
}: {
  item: ScheduledItemDTO;
  urgent: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isCard = item.account_type === "credit_card";
  const sign = item.kind === "income" ? "+" : "−";
  const amountColor = item.kind === "income" ? "text-emerald-400" : "text-rose-400";

  return (
    <GlassCard
      className={`flex flex-col gap-2 border p-4 sm:flex-row sm:items-center sm:justify-between ${
        urgent ? "border-red-500/30 bg-red-500/5" : "border-white/10"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{item.description}</span>
          {urgent && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300">
              <AlertTriangle className="size-3" /> Atrasado
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-foreground/50">
          {item.category_name ?? "Sem categoria"} · {item.account_name ?? "Sem conta"} ·{" "}
          {FREQ_LABEL[item.frequency]}
        </p>
        <p className="mt-0.5 text-xs text-foreground/40">Vence {formatBR(item.next_run_on)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={`font-mono text-sm font-semibold ${amountColor}`}>
          {sign}
          {formatBRL(item.amount)}
        </span>

        {isCard ? (
          <span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300">
            <CreditCard className="size-3" /> Automático na fatura
          </span>
        ) : (
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-full bg-emerald-600 text-xs text-white hover:bg-emerald-500"
            onClick={onConfirm}
          >
            <CheckCircle2 className="size-3.5" />
            Marcar como {item.kind === "income" ? "recebido" : "pago"}
          </Button>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full text-foreground/50"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full text-foreground/40 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-3.5" />
        </Button>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
              <AlertDialogDescription className="text-foreground/60">
                "{item.description}" deixará de gerar lembretes/lançamentos futuros. Lançamentos já
                gerados no passado NÃO são apagados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/10 bg-white/[0.04] hover:bg-white/10">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  onDelete();
                  setDeleteOpen(false);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
function AgendamentosPage() {
  const queryClient = useQueryClient();
  const fetchItems = useServerFn(listScheduledItems);
  const fetchAccounts = useServerFn(getAccountsLookup);
  const fetchCategories = useServerFn(getCategoriesLookup);

  const { data: items } = useSuspenseQuery(itemsQO(fetchItems));
  const { data: accounts } = useSuspenseQuery(accountsQO(fetchAccounts));
  const { data: categories } = useSuspenseQuery(categoriesQO(fetchCategories));

  const [formOpen, setFormOpen] = useState(false);
  const [form, setFormState] = useState<FormState>(emptyForm());
  const [confirmTarget, setConfirmTarget] = useState<ScheduledItemDTO | null>(null);

  function setForm(patch: Partial<FormState>) {
    setFormState((prev) => ({ ...prev, ...patch }));
  }

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  const createMut = useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload>) =>
      createScheduledItem({ data: payload }),
    onSuccess: () => {
      toast.success("Agendamento criado.");
      setFormOpen(false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload> & { id: string }) =>
      updateScheduledItem({ data: payload }),
    onSuccess: () => {
      toast.success("Agendamento atualizado.");
      setFormOpen(false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteScheduledItem({ data: { id } }),
    onSuccess: () => {
      toast.success("Agendamento excluído.");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: (v: { recurrence_id: string; amount: string; occurred_on: string }) =>
      confirmScheduledItem({ data: v }),
    onSuccess: (res) => {
      toast.success(
        res.deactivated
          ? "Confirmado! Este agendamento foi concluído."
          : "Confirmado! Próxima ocorrência agendada.",
      );
      setConfirmTarget(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function buildPayload(f: FormState) {
    return {
      description: f.description.trim(),
      amount: f.amount,
      kind: f.kind,
      account_id: f.account_id,
      category_id: f.category_id,
      frequency: f.frequency,
      interval_count: Number(f.interval_count) || 1,
      date: f.date,
      end_on: f.frequency === "once" || !f.end_on ? undefined : f.end_on,
    };
  }

  function openCreate() {
    setFormState(emptyForm());
    setFormOpen(true);
  }
  function openEdit(item: ScheduledItemDTO) {
    setFormState(formFromItem(item));
    setFormOpen(true);
  }
  function handleSave() {
    if (!form.description.trim() || !form.amount || !form.account_id || !form.category_id) {
      toast.error("Preencha descrição, valor, conta e categoria.");
      return;
    }
    const payload = buildPayload(form);
    if (form.id) {
      updateMut.mutate({ ...payload, id: form.id });
    } else {
      createMut.mutate(payload);
    }
  }

  const today = todayIso();
  const in30 = addDaysIso(today, 30);
  const overdue = items.filter((i) => i.next_run_on < today);
  const upcoming = items.filter((i) => i.next_run_on >= today && i.next_run_on <= in30);
  const later = items.filter((i) => i.next_run_on > in30);

  const groups: Array<{ title: string; list: ScheduledItemDTO[]; urgent?: boolean }> = [
    { title: "Atrasados", list: overdue, urgent: true },
    { title: "Próximos 30 dias", list: upcoming },
    { title: "Mais adiante", list: later },
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              <CalendarClock className="size-6 text-primary" /> Agendamentos
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Contas a vencer — recorrentes ou avulsas, com lembrete e confirmação manual para
              contas bank/dinheiro.
            </p>
          </div>
          <Button className="gap-2 rounded-full" onClick={openCreate}>
            <Plus className="size-4" /> Novo agendamento
          </Button>
        </header>

        {items.length === 0 ? (
          <GlassCard className="p-12 text-center text-sm text-foreground/50">
            Nenhum agendamento cadastrado ainda.
          </GlassCard>
        ) : (
          <div className="space-y-8">
            {groups.map(
              (g) =>
                g.list.length > 0 && (
                  <section key={g.title}>
                    <h2 className="mb-3 text-sm font-medium text-foreground/70">
                      {g.title} ({g.list.length})
                    </h2>
                    <div className="space-y-2">
                      {g.list.map((item) => (
                        <ScheduledItemRow
                          key={item.id}
                          item={item}
                          urgent={!!g.urgent}
                          onEdit={() => openEdit(item)}
                          onDelete={() => deleteMut.mutate(item.id)}
                          onConfirm={() => setConfirmTarget(item)}
                        />
                      ))}
                    </div>
                  </section>
                ),
            )}
          </div>
        )}
      </div>

      <ScheduledItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        form={form}
        setForm={setForm}
        accounts={accounts}
        categories={categories}
        onSave={handleSave}
        isSaving={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        item={confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        onConfirm={(amount, occurred_on) =>
          confirmTarget &&
          confirmMut.mutate({ recurrence_id: confirmTarget.id, amount, occurred_on })
        }
        isPending={confirmMut.isPending}
      />
    </AppShell>
  );
}
