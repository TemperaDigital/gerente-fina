/**
 * Rota /credit-cards — Gestão de Cartões de Crédito.
 * Lê/escreve em accounts com type='credit_card'.
 * closing_day + due_day alimentam o motor do meio do mês (migration 0005).
 */
import { useState } from "react";
import {
  createFileRoute,
  Link,
  useRouter,
} from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  CreditCard,
  Plus,
  Archive,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { GlassCard, formatBRL } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import {
  AccountForm,
  type AccountFormPayload,
} from "@/components/accounts/account-form";
import { AccountLedgerSheet } from "@/components/accounts/account-ledger-sheet";
import {
  listAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  type AccountWithBalanceDTO,
} from "@/services/accounts.functions";

const cardsQuery = () =>
  queryOptions({
    queryKey: ["accounts", "credit-cards"],
    queryFn: () => listAccounts({ data: { type: "credit_card" } }),
  });

export const Route = createFileRoute("/_app/credit-cards")({
  head: () => ({
    meta: [
      { title: "Cartões de Crédito — Gerente Fina" },
      {
        name: "description",
        content:
          "Gerencie cartões: limite, dia de fechamento e vencimento para o motor de faturas.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(cardsQuery()),
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <GlassCard className="max-w-md p-6 text-center">
        <h2 className="text-lg font-semibold">Erro ao carregar cartões</h2>
        <p className="mt-2 text-sm text-foreground/60">{error.message}</p>
      </GlassCard>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-center text-foreground/60">
      Não foi possível listar os cartões.
    </div>
  ),
  component: CreditCardsPage,
});

function CreditCardsPage() {
  const { data: cards } = useSuspenseQuery(cardsQuery());
  const queryClient = useQueryClient();
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AccountWithBalanceDTO | null>(null);
  const [archiving, setArchiving] = useState<AccountWithBalanceDTO | null>(
    null,
  );
  const [viewing, setViewing] = useState<AccountWithBalanceDTO | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["lookups", "accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    router.invalidate();
  }

  const createMut = useMutation({
    mutationFn: (payload: AccountFormPayload) =>
      createAccount({ data: { ...payload, type: "credit_card" } }),
    onSuccess: async () => {
      toast.success("Cartão criado.");
      setCreating(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; payload: AccountFormPayload }) =>
      updateAccount({ data: { id: vars.id, ...vars.payload } }),
    onSuccess: async () => {
      toast.success("Cartão atualizado.");
      setEditing(null);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveAccount({ data: { id } }),
    onSuccess: async () => {
      toast.success("Cartão arquivado.");
      setArchiving(null);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              className="h-9 gap-2 rounded-full border border-white/10 bg-white/[0.04] text-foreground/70 hover:bg-white/10"
            >
              <Link to="/dashboard">
                <ArrowLeft className="size-4" /> Dashboard
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Cartões de Crédito
              </h1>
              <p className="mt-1 text-sm text-foreground/60">
                Limite, fechamento e vencimento alimentam o motor automático de
                faturas.
              </p>
            </div>
          </div>
          <Button
            className="h-9 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-4" />
            Novo cartão
          </Button>
        </header>

        {cards.length === 0 ? (
          <GlassCard className="p-10 text-center text-sm text-foreground/60">
            Nenhum cartão cadastrado ainda.
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => {
              const limitBRL = c.credit_limit_cents
                ? formatBRL(
                    `${Math.floor(c.credit_limit_cents / 100)}.${String(
                      c.credit_limit_cents % 100,
                    ).padStart(2, "0")}`,
                  )
                : "—";
              return (
                <GlassCard
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewing(c)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setViewing(c);
                    }
                  }}
                  className="cursor-pointer p-5 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between">
                    <CreditCard className="size-5 text-violet-300" />
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 rounded-full text-foreground/60 hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(c);
                        }}
                        aria-label="Editar"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 rounded-full text-foreground/60 hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setArchiving(c);
                        }}
                        aria-label="Arquivar"
                      >
                        <Archive className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 truncate text-sm font-semibold">
                    {c.name}
                  </div>
                  {c.institution && (
                    <div className="text-xs text-foreground/50">
                      {c.institution}
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="uppercase tracking-wider text-foreground/50">
                        Limite
                      </div>
                      <div className="mt-1 font-semibold tabular-nums text-foreground">
                        {limitBRL}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wider text-foreground/50">
                        Saldo atual
                      </div>
                      <div
                        className={
                          Number(c.balance) < 0
                            ? "mt-1 font-semibold tabular-nums text-rose-400"
                            : "mt-1 font-semibold tabular-nums text-foreground"
                        }
                      >
                        {formatBRL(c.balance)}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wider text-foreground/50">
                        Fecha dia
                      </div>
                      <div className="mt-1 font-semibold tabular-nums text-foreground">
                        {c.closing_day ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-wider text-foreground/50">
                        Vence dia
                      </div>
                      <div className="mt-1 font-semibold tabular-nums text-foreground">
                        {c.due_day ?? "—"}
                      </div>
                    </div>
                  </div>
                  {c.closing_day &&
                    c.due_day &&
                    c.due_day > c.closing_day && (
                      <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-2 py-1.5 text-[11px] text-amber-200">
                        Regra do meio do mês ativa.
                      </div>
                    )}
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Novo cartão de crédito</DialogTitle>
          </DialogHeader>
          <AccountForm
            initialType="credit_card"
            lockType
            submitting={createMut.isPending}
            submitLabel="Criar cartão"
            onCancel={() => setCreating(false)}
            onSubmit={(p) => createMut.mutate(p)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Editar cartão</DialogTitle>
          </DialogHeader>
          {editing && (
            <AccountForm
              initialType="credit_card"
              lockType
              initial={editing}
              submitting={updateMut.isPending}
              submitLabel="Salvar alterações"
              onCancel={() => setEditing(null)}
              onSubmit={(p) =>
                updateMut.mutate({ id: editing.id, payload: p })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Archive */}
      <AlertDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
      >
        <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar cartão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente arquivar{" "}
              <span className="font-semibold text-foreground">
                {archiving?.name}
              </span>
              ? Faturas e lançamentos históricos permanecem intactos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiving && archiveMut.mutate(archiving.id)}
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drill-down: fatura selecionada do cartão */}
      <AccountLedgerSheet
        account={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />
    </AppShell>
  );
}
