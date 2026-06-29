/**
 * Rota /transactions/new — Novo Lançamento (tela única).
 *
 * Pílulas absolutas no topo mutam os campos abaixo (Receita / Despesa /
 * Transferência / Pgto. de Fatura) sem modais de múltiplos passos.
 * Box de projeção de fatura aparece ao escolher cartão. Parcelamento e
 * Recorrência são acordeões inline.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  ArrowLeft,
  CreditCard as CardIcon,
  Layers,
  Repeat,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import { getAccountsLookup, getCategoriesLookup, type AccountLookupDTO } from "@/services/lookups.functions";
import { createTransactionEntry } from "@/services/transactions.functions";
import { projectInvoiceForPurchase } from "@/services/invoice-projection.functions";
// IMPORTANTE: Trazendo o AppShell para manter o painel lateral fixo
import { AppShell } from "@/components/app-shell";

// ---------------------------------------------------------------------------
// Search / route
// ---------------------------------------------------------------------------
type TxKind = "income" | "expense" | "transfer" | "invoice_payment";

const accountsQuery = () => queryOptions({ queryKey: ["lookups", "accounts"], queryFn: () => getAccountsLookup() });

const categoriesQuery = () =>
  queryOptions({ queryKey: ["lookups", "categories"], queryFn: () => getCategoriesLookup() });

export const Route = createFileRoute("/transactions/new")({
  head: () => ({
    meta: [
      { title: "Novo Lançamento — Gerente Fina" },
      { name: "description", content: "Registre receita, despesa, transferência ou pagamento de fatura." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(accountsQuery()),
      context.queryClient.ensureQueryData(categoriesQuery()),
    ]);
  },
  component: NewTransactionPage,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NewTransactionPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: categories } = useSuspenseQuery(categoriesQuery());

  const [kind, setKind] = useState<TxKind>("expense");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [accountId, setAccountId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [counterpartId, setCounterpartId] = useState<string | undefined>();
  const [paidInvoiceId, setPaidInvoiceId] = useState<string | undefined>();

  // Modificadores
  const [installmentOn, setInstallmentOn] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(2);
  const [recurrenceOn, setRecurrenceOn] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [intervalCount, setIntervalCount] = useState(1);
  const [endOn, setEndOn] = useState<string>("");

  const filteredCategories = useMemo(
    () => categories.filter((c) => (kind === "income" ? c.kind === "income" : c.kind === "expense")),
    [categories, kind],
  );

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isCard = selectedAccount?.type === "credit_card";

  // Projeção de fatura (apenas para cartão)
  const projectionEnabled = isCard && kind === "expense" && !!accountId && !!occurredOn;
  const { data: projection } = useQuery({
    queryKey: ["invoice-projection", accountId, occurredOn],
    queryFn: () =>
      projectInvoiceForPurchase({
        data: { account_id: accountId!, purchase_date: occurredOn },
      }),
    enabled: projectionEnabled,
  });

  // Faturas abertas para fluxo "Pagamento de Fatura"
  const invoicesQuery = useQuery({
    queryKey: ["open-invoices-for-payment"],
    queryFn: async () => {
      const { getOpenCreditCardInvoices } = await import("@/services/dashboard.functions");
      return getOpenCreditCardInvoices();
    },
    enabled: kind === "invoice_payment",
  });

  // GATILHO AUTOMÁTICO CORRIGIDO COM OPTIONAL CHAINING (?.) PARA PASSAR NO BUILD
  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    const termo = val.toLowerCase();

    if (termo.includes("mariareniele") || termo.includes("woshington")) {
      // Encontra com segurança usando c.name?.toLowerCase()
      const targetCategory = categories.find(
        (c) => c.name?.toLowerCase().includes("mercearia") || c.name?.toLowerCase().includes("alimentação"),
      );
      if (targetCategory) {
        setCategoryId(targetCategory.id);
      }
      setNotes("Compra de temperos e Graos");
    }
  };

  type CreatePayload = {
    kind: TxKind;
    amount: string;
    occurred_on: string;
    description: string;
    notes?: string;
    account_id: string;
    category_id?: string;
    counterpart_account_id?: string;
    paid_invoice_id?: string;
    installment?: { count: number };
    recurrence?: {
      frequency: "daily" | "weekly" | "monthly" | "yearly";
      interval_count: number;
      end_on?: string;
    };
  };
  const createMut = useMutation({
    mutationFn: (payload: CreatePayload) => createTransactionEntry({ data: payload }),
    onSuccess: async (res) => {
      toast.success(
        `${res.created_count} lançamento${res.created_count === 1 ? "" : "s"} criado${
          res.created_count === 1 ? "" : "s"
        } com sucesso.`,
      );
      res.warnings.forEach((w) => toast.warning(w));
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.invalidate();
      navigate({ to: "/transactions", search: { month: occurredOn.slice(0, 7), page: 1 } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return toast.error("Selecione a conta.");
    const normalizedAmount = amount.replace(",", ".").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalizedAmount)) return toast.error("Valor inválido. Use formato 1234.56");
    if (!description.trim()) return toast.error("Descrição obrigatória.");

    createMut.mutate({
      kind,
      amount: normalizedAmount,
      occurred_on: occurredOn,
      description: description.trim(),
      notes: notes.trim() || undefined,
      account_id: accountId,
      category_id: kind === "income" || kind === "expense" ? categoryId : undefined,
      counterpart_account_id: kind === "transfer" ? counterpartId : undefined,
      paid_invoice_id: kind === "invoice_payment" ? paidInvoiceId : undefined,
      installment: installmentOn && kind === "expense" ? { count: installmentCount } : undefined,
      recurrence:
        recurrenceOn && (kind === "income" || kind === "expense")
          ? {
              frequency,
              interval_count: intervalCount,
              end_on: endOn || undefined,
            }
          : undefined,
    });
  }

  return (
    <AppShell>
      <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(700px 400px at 15% -10%, rgba(99,102,241,0.16), transparent 60%), radial-gradient(700px 400px at 85% 0%, rgba(168,85,247,0.12), transparent 60%)",
          }}
        />

        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="mb-6 flex items-center justify-between">
            <Button
              asChild
              variant="ghost"
              className="h-9 gap-2 rounded-full border border-white/10 bg-white/[0.04] text-foreground/70 hover:bg-white/10"
            >
              <Link to="/transactions">
                <ArrowLeft className="size-4" /> Voltar
              </Link>
            </Button>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Novo Lançamento</h1>
            <div className="w-[88px]" />
          </header>

          {/* Pílulas de seleção */}
          <KindPills
            value={kind}
            onChange={(k) => {
              setKind(k);
              setCategoryId(undefined);
              setCounterpartId(undefined);
              setPaidInvoiceId(undefined);
              if (k !== "expense") setInstallmentOn(false);
              if (k !== "income" && k !== "expense") setRecurrenceOn(false);
            }}
          />

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <GlassCard className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Valor (R$)">
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    className="border-white/10 bg-white/[0.04]"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
                <Field label="Data">
                  <Input
                    type="date"
                    className="border-white/10 bg-white/[0.04]"
                    value={occurredOn}
                    onChange={(e) => setOccurredOn(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Descrição">
                <Input
                  className="border-white/10 bg-white/[0.04]"
                  placeholder="Ex.: MariaReniele ou Woshington"
                  value={description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                />
              </Field>

              <Field label={kind === "transfer" ? "Conta de origem" : "Conta"}>
                <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
              </Field>

              {kind === "transfer" && (
                <Field label="Conta de destino">
                  <AccountSelect
                    accounts={accounts.filter((a) => a.id !== accountId)}
                    value={counterpartId}
                    onChange={setCounterpartId}
                  />
                </Field>
              )}

              {(kind === "income" || kind === "expense") && (
                <Field label="Categoria">
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="border-white/10 bg-white/[0.04]">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                      {filteredCategories.length === 0 && (
                        <div className="px-3 py-2 text-xs text-foreground/50">
                          Nenhuma categoria de {kind === "income" ? "receita" : "despesa"} cadastrada.
                        </div>
                      )}
                      {filteredCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {kind === "invoice_payment" && (
                <Field label="Fatura a pagar">
                  <Select value={paidInvoiceId} onValueChange={setPaidInvoiceId}>
                    <SelectTrigger className="border-white/10 bg-white/[0.04]">
                      <SelectValue
                        placeholder={invoicesQuery.isLoading ? "Carregando faturas..." : "Selecione a fatura..."}
                      />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                      {(invoicesQuery.data ?? []).map((inv) => (
                        <SelectItem key={inv.invoice_id} value={inv.invoice_id}>
                          {inv.account_name} · vence {inv.due_date.split("-").reverse().join("/")} ·{" "}
                          {formatBRL(inv.total_amount)}
                        </SelectItem>
                      ))}
                      {(invoicesQuery.data?.length ?? 0) === 0 && !invoicesQuery.isLoading && (
                        <div className="px-3 py-2 text-xs text-foreground/50">Nenhuma fatura em aberto.</div>
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <Field label="Observações (opcional)">
                <Textarea
                  className="min-h-[60px] border-white/10 bg-white/[0.04]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </GlassCard>

            {/* Box de Projeção de Fatura */}
            {projectionEnabled && projection && (
              <GlassCard className="flex items-start gap-3 border-violet-400/30 p-4">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-violet-300" />
                <div className="text-sm">
                  <div className="font-semibold text-foreground">
                    Esta compra entrará na fatura de{" "}
                    <span className="text-violet-300">
                      {projection.projected_reference_month.split("-").reverse().join("/")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-foreground/60">
                    Cartão {projection.account_name} · fecha dia {projection.closing_day} · vence em{" "}
                    {projection.projected_due_date.split("-").reverse().join("/")}
                    {projection.due_day > projection.closing_day && (
                      <span className="ml-1 text-amber-300">
                        (regra do meio do mês: vence no mesmo mês civil do fechamento)
                      </span>
                    )}
                  </div>
                </div>
              </GlassCard>
            )}

            {/* Modificadores inline */}
            {kind === "expense" && (
              <ModifierCard
                icon={<Layers className="size-4 text-amber-300" />}
                title="Parcelamento"
                checked={installmentOn}
                onCheckedChange={setInstallmentOn}
                description="Divide automaticamente em parcelas mensais (somente para cartão)."
              >
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-foreground/70">Nº de parcelas</Label>
                  <Input
                    type="number"
                    min={2}
                    max={360}
                    className="h-9 w-24 border-white/10 bg-white/[0.04]"
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(Math.max(2, Number(e.target.value) || 2))}
                  />
                </div>
              </ModifierCard>
            )}

            {(kind === "income" || kind === "expense") && (
              <ModifierCard
                icon={<Repeat className="size-4 text-sky-300" />}
                title="Recorrência"
                checked={recurrenceOn}
                onCheckedChange={setRecurrenceOn}
                description="Repete este lançamento periodicamente."
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Frequência" inline>
                    <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
                      <SelectTrigger className="h-9 border-white/10 bg-white/[0.04]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                        <SelectItem value="daily">Diário</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="yearly">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="A cada" inline>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      className="h-9 border-white/10 bg-white/[0.04]"
                      value={intervalCount}
                      onChange={(e) => setIntervalCount(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </Field>
                  <Field label="Termina em (opcional)" inline>
                    <Input
                      type="date"
                      className="h-9 border-white/10 bg-white/[0.04]"
                      value={endOn}
                      onChange={(e) => setEndOn(e.target.value)}
                    />
                  </Field>
                </div>
              </ModifierCard>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="border border-white/10 bg-white/[0.04] hover:bg-white/10"
                onClick={() => navigate({ to: "/transactions", search: { month: occurredOn.slice(0, 7), page: 1 } })}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {createMut.isPending ? "Salvando..." : "Salvar lançamento"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function KindPills({ value, onChange }: { value: TxKind; onChange: (k: TxKind) => void }) {
  const opts: { k: TxKind; label: string; icon: React.ElementType; active: string }[] = [
    {
      k: "income",
      label: "Receita",
      icon: ArrowUpCircle,
      active: "bg-emerald-500/20 text-emerald-300 ring-emerald-400/40",
    },
    { k: "expense", label: "Despesa", icon: ArrowDownCircle, active: "bg-rose-500/20 text-rose-300 ring-rose-400/40" },
    {
      k: "transfer",
      label: "Transferência",
      icon: ArrowLeftRight,
      active: "bg-sky-500/20 text-sky-300 ring-sky-400/40",
    },
    {
      k: "invoice_payment",
      label: "Pgto. Fatura",
      icon: CardIcon,
      active: "bg-violet-500/20 text-violet-300 ring-violet-400/40",
    },
  ];
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 backdrop-blur-xl">
      {opts.map((o) => {
        const Icon = o.icon;
        const isActive = value === o.k;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange(o.k)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
              isActive ? `${o.active} ring-1` : "text-foreground/60 hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, inline }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? "" : "space-y-1.5"}>
      <Label className="text-[10px] uppercase tracking-wider text-foreground/60">{label}</Label>
      <div className={inline ? "mt-1" : ""}>{children}</div>
    </div>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: AccountLookupDTO[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="border-white/10 bg-white/[0.04]">
        <SelectValue placeholder="Selecione a conta..." />
      </SelectTrigger>
      <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
            <span className="ml-2 text-[10px] uppercase tracking-wider text-foreground/50">
              {a.type === "credit_card" ? "cartão" : a.type === "bank" ? "banco" : "dinheiro"}
            </span>
          </SelectItem>
        ))}
        {accounts.length === 0 && <div className="px-3 py-2 text-xs text-foreground/50">Nenhuma conta cadastrada.</div>}
      </SelectContent>
    </Select>
  );
}

function ModifierCard({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(Boolean(v))}
          className="mt-0.5 border-white/20 data-[state=checked]:bg-primary"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {icon}
            {title}
          </div>
          <div className="text-xs text-foreground/50">{description}</div>
        </div>
      </label>
      {checked && <div className="mt-4 border-t border-white/5 pt-4">{children}</div>}
    </GlassCard>
  );
}
