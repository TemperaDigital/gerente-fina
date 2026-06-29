/**
 * Rota /accounts — Gestão de Contas (cash + bank).
 * Saldo derivado em tempo real via VIEW account_balances.
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
  Banknote,
  Landmark,
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
import {
  listAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  type AccountWithBalanceDTO,
} from "@/services/accounts.functions";

const accountsQuery = () =>
  queryOptions({
    queryKey: ["accounts", "cash-bank"],
    queryFn: () => listAccounts({ data: {} }),
    select: (rows: AccountWithBalanceDTO[]) =>
      rows.filter((a) => a.type === "cash" || a.type === "bank"),
  });

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Contas — Gerente Fina" },
      {
        name: "description",
        content: "Gerencie contas correntes, poupanças e dinheiro em espécie.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsQuery()),
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <GlassCard className="max-w-md p-6 text-center">
        <h2 className="text-lg font-semibold">Erro ao carregar contas</h2>
        <p className="mt-2 text-sm text-foreground/60">{error.message}</p>
      </GlassCard>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-center text-foreground/60">
      Não foi possível listar as contas.
    </div>
  ),
  component: AccountsPage,
});

function AccountsPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const queryClient = useQueryClient();
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AccountWithBalanceDTO | null>(null);
  const [archiving, setArchiving] = useState<AccountWithBalanceDTO | null>(
    null,
  );

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["lookups", "accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    router.invalidate();
  }

  const createMut = useMutation({
    mutationFn: (payload: AccountFormPayload) =>
      createAccount({ data: payload }),
    onSuccess: async (_res, payload) => {
      if (payload.type === "credit_card") {
        toast.success("Cartão criado. Disponível em Cartões.");
      } else {
        toast.success("Conta criada.");
      }
      setCreating(false);
      await refresh();
      if (payload.type === "credit_card") {
        router.navigate({ to: "/credit-cards" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; payload: AccountFormPayload }) =>
      updateAccount({ data: { id: vars.id, ...vars.payload } }),
    onSuccess: async () => {
      toast.success("Conta atualizada.");
      setEditing(null);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveAccount({ data: { id } }),
    onSuccess: async () => {
      toast.success("Conta arquivada.");
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
                Contas
              </h1>
              <p className="mt-1 text-sm text-foreground/60">
                Contas correntes, poupanças e dinheiro em espécie · saldos
                derivados em tempo real.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/10"
              onClick={() => setCreating("cash")}
            >
              <Banknote className="size-4" />
              Dinheiro
            </Button>
            <Button
              className="h-9 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setCreating("bank")}
            >
              <Plus className="size-4" />
              Conta bancária
            </Button>
          </div>
        </header>

        {accounts.length === 0 ? (
          <GlassCard className="p-10 text-center text-sm text-foreground/60">
            Nenhuma conta cadastrada ainda. Comece adicionando uma conta
            bancária ou um caixa em dinheiro.
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <GlassCard key={a.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {a.type === "cash" ? (
                      <Banknote className="size-4 text-emerald-300" />
                    ) : (
                      <Landmark className="size-4 text-sky-300" />
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-foreground/60">
                      {a.type === "cash" ? "Dinheiro" : "Conta Bancária"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 rounded-full text-foreground/60 hover:bg-white/10"
                      onClick={() => setEditing(a)}
                      aria-label="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 rounded-full text-foreground/60 hover:bg-white/10"
                      onClick={() => setArchiving(a)}
                      aria-label="Arquivar"
                    >
                      <Archive className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 truncate text-sm font-semibold">
                  {a.name}
                </div>
                {a.institution && (
                  <div className="text-xs text-foreground/50">
                    {a.institution}
                  </div>
                )}
                <div
                  className={
                    a.balance.startsWith("-")
                      ? "mt-3 text-2xl font-semibold tabular-nums text-rose-400"
                      : "mt-3 text-2xl font-semibold tabular-nums text-foreground"
                  }
                >
                  {formatBRL(a.balance)}
                </div>
                <div className="mt-1 text-[11px] text-foreground/50">
                  {a.transactions_count} lançamento
                  {a.transactions_count === 1 ? "" : "s"}
                  {a.last_movement_on
                    ? ` · último ${a.last_movement_on
                        .split("-")
                        .reverse()
                        .join("/")}`
                    : ""}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>
              Nova {creating === "cash" ? "carteira em dinheiro" : "conta bancária"}
            </DialogTitle>
          </DialogHeader>
          {creating && (
            <AccountForm
              forcedType={creating}
              submitting={createMut.isPending}
              submitLabel="Criar conta"
              onCancel={() => setCreating(null)}
              onSubmit={(p) =>
                createMut.mutate({ ...p, type: creating })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Editar conta</DialogTitle>
          </DialogHeader>
          {editing && (
            <AccountForm
              forcedType={editing.type as "cash" | "bank"}
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

      {/* Archive confirm */}
      <AlertDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
      >
        <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar conta</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente arquivar{" "}
              <span className="font-semibold text-foreground">
                {archiving?.name}
              </span>
              ? Os lançamentos históricos permanecem intactos.
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
    </AppShell>
  );
}
