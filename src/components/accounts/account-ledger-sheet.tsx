/**
 * AccountLedgerSheet — painel lateral de extrato/fatura (drill-down).
 *
 * Aberto ao clicar num card de /accounts ou /credit-cards. Dois corpos
 * distintos conforme o tipo da conta:
 *   - Conta corrente/dinheiro: extrato com seletor de mês, reaproveitando
 *     TransactionsTable (mesma tabela de /transactions) sobre
 *     getTransactionsList.
 *   - Cartão de crédito: compras da fatura selecionada, reaproveitando
 *     getInvoiceDetail (já resolve o dropdown de faturas + status "paga").
 *
 * Editar/excluir reaproveitam os serviços já existentes
 * (getTransactionById/updateTransactionEntry via a rota /transactions/edit/$id,
 * e discardTransaction) — nenhuma lógica de gravação nova aqui.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import {
  TransactionsTable,
  TransactionsTableSkeleton,
} from "@/components/transactions/list-ui";
import {
  getTransactionsList,
  discardTransaction,
} from "@/services/transactions.functions";
import {
  getInvoiceDetail,
  type InvoiceLineDTO,
} from "@/services/invoices.functions";
import type { AccountWithBalanceDTO } from "@/services/accounts.functions";

// ---------------------------------------------------------------------------
// Helpers de mês (mesma lógica usada no Dashboard)
// ---------------------------------------------------------------------------
function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function addMonthStr(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatBR(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
  overdue: "Atrasada",
};

// ---------------------------------------------------------------------------
// Painel principal — dispatcher por tipo de conta
// ---------------------------------------------------------------------------
export function AccountLedgerSheet({
  account,
  onOpenChange,
}: {
  account: AccountWithBalanceDTO | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  function handleOpenChange(open: boolean) {
    onOpenChange(open);
    if (!open) {
      // Ao fechar, garante que saldos/faturas na tela de trás fiquem em dia
      // mesmo que uma edição/exclusão tenha acontecido durante a sessão do painel.
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    }
  }

  const TypeIcon =
    account?.type === "credit_card"
      ? CreditCard
      : account?.type === "bank"
      ? Landmark
      : Banknote;
  const typeColor =
    account?.type === "credit_card"
      ? "text-violet-300"
      : account?.type === "bank"
      ? "text-sky-300"
      : "text-emerald-300";

  return (
    <Sheet open={!!account} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-white/10 bg-zinc-950 text-foreground sm:max-w-2xl">
        {account && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <TypeIcon className={`size-5 ${typeColor}`} />
                {account.name}
              </SheetTitle>
              <SheetDescription>
                {account.type === "credit_card"
                  ? "Compras da fatura selecionada"
                  : "Extrato de lançamentos por período"}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              {account.type === "credit_card" ? (
                <CardInvoiceBody account={account} />
              ) : (
                <BankLedgerBody account={account} />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Conta corrente / dinheiro — extrato com seletor de mês
// ---------------------------------------------------------------------------
function BankLedgerBody({ account }: { account: AccountWithBalanceDTO }) {
  const [month, setMonth] = useState(currentMonthStr());
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["ledger", "account", account.id, month, page],
    queryFn: () =>
      getTransactionsList({
        data: { account_id: account.id, month, page, page_size: 50 },
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => discardTransaction({ data: { id } }),
    onSuccess: async () => {
      toast.success("Lançamento excluído.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function goMonth(delta: number) {
    setMonth((m) => addMonthStr(m, delta));
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 self-start rounded-xl border border-white/10 bg-zinc-900/60 p-1">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-lg"
          onClick={() => goMonth(-1)}
          title="Mês anterior"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex min-w-[140px] items-center justify-center gap-1.5 px-2">
          <CalendarDays className="size-3.5 shrink-0 text-primary" />
          <span className="whitespace-nowrap text-sm font-medium capitalize">
            {monthLabel(month)}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-lg"
          onClick={() => goMonth(1)}
          disabled={month === currentMonthStr()}
          title="Próximo mês"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {query.isLoading ? (
        <TransactionsTableSkeleton />
      ) : (
        <TransactionsTable
          items={query.data?.items ?? []}
          page={query.data?.page ?? page}
          pageSize={query.data?.page_size ?? 50}
          total={query.data?.total ?? 0}
          onPageChange={setPage}
          onDelete={(id) => deleteMut.mutate(id)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cartão de crédito — compras da fatura selecionada
// ---------------------------------------------------------------------------
function CardInvoiceBody({ account }: { account: AccountWithBalanceDTO }) {
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["ledger", "invoice", account.id, selectedMonth ?? "current"],
    queryFn: () =>
      getInvoiceDetail({
        data: { account_id: account.id, reference_month: selectedMonth },
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => discardTransaction({ data: { id } }),
    onSuccess: async () => {
      toast.success("Lançamento excluído.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <TransactionsTableSkeleton />;

  const months = query.data?.months ?? [];
  const current = query.data?.current ?? null;
  const lines = query.data?.lines ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={current?.invoice_id ?? ""}
          onValueChange={(invoiceId) => {
            const m = months.find((mm) => mm.invoice_id === invoiceId);
            if (m) setSelectedMonth(m.reference_month.slice(0, 7));
          }}
        >
          <SelectTrigger className="h-9 w-[220px] border-white/10 bg-white/[0.04] text-sm">
            <SelectValue placeholder="Selecione a fatura..." />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
            {months.map((m) => (
              <SelectItem key={m.invoice_id} value={m.invoice_id}>
                {monthLabel(m.reference_month.slice(0, 7))} ·{" "}
                {INVOICE_STATUS_LABEL[m.status] ?? m.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {current?.status === "paid" && (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 font-semibold text-emerald-300"
          >
            Fatura Paga
          </Badge>
        )}

        {current && (
          <span className="ml-auto text-xs text-foreground/50">
            Vence {formatBR(current.due_date)} · Total {formatBRL(current.total_amount)}
          </span>
        )}
      </div>

      {months.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-foreground/50">
          Nenhuma fatura gerada para este cartão ainda.
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden p-0">
          {lines.length === 0 ? (
            <div className="p-10 text-center text-sm text-foreground/50">
              Nenhuma compra nesta fatura.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {lines.map((line) => (
                <InvoiceLineRow
                  key={line.id}
                  line={line}
                  onDelete={(id) => deleteMut.mutate(id)}
                />
              ))}
            </ul>
          )}
        </GlassCard>
      )}
    </div>
  );
}

function InvoiceLineRow({
  line,
  onDelete,
}: {
  line: InvoiceLineDTO;
  onDelete: (id: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <li className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]">
      <span className="w-14 shrink-0 font-mono text-xs text-foreground/50">
        {formatBR(line.occurred_on)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {line.description || "—"}
        </span>
        {line.category_name && (
          <span className="block truncate text-xs text-foreground/50">
            {line.category_name}
          </span>
        )}
      </span>
      <span className="min-w-[80px] shrink-0 text-right text-sm font-semibold tabular-nums text-foreground/80">
        {formatBRL(line.amount)}
      </span>
      <div className="flex shrink-0 gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="size-8 text-foreground/50 hover:bg-white/10 hover:text-foreground"
            >
              <Link
                to="/transactions/edit/$id"
                params={{ id: line.id }}
                aria-label="Editar lançamento"
              >
                <Pencil className="size-3.5" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editar lançamento</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
              className="size-8 text-foreground/50 hover:bg-destructive/10 hover:text-destructive"
              aria-label="Excluir lançamento"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Excluir lançamento</TooltipContent>
        </Tooltip>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              "{line.description || "Sem descrição"}" ({formatBRL(line.amount)}) será removido
              permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDelete(line.id);
                setConfirmOpen(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
