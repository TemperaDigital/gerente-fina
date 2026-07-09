/**
 * Rota /open-finance — Conexões bancárias.
 *
 * Missão 31: o fluxo anterior fingia integração real com Pluggy/Belvo (SDK
 * nunca carregado no app + Edge Functions que não existem neste projeto) —
 * clicar em "Conectar" sempre falhava silenciosamente. Sem credenciais reais
 * ainda, esta tela oferece um cadastro MANUAL de instituição (só o nome, sem
 * sincronização automática) — honesto sobre o que realmente acontece hoje.
 * `status: "MANUAL"` em todas as conexões criadas por aqui; ver
 * src/services/open-finance.functions.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  listBankConnections,
  createBankConnection,
  disconnectBankConnection,
} from "@/services/open-finance.functions";
import { useState } from "react";
import { Link2, ShieldCheck, Plus, Unlink, Loader2, Landmark } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";

const connectionsQueryOptions = () =>
  queryOptions({
    queryKey: ["open-finance", "connections"],
    queryFn: () => listBankConnections(),
  });

export const Route = createFileRoute("/_app/open-finance")({
  head: () => ({
    meta: [{ title: "Open Finance — Gerente Fina" }],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(connectionsQueryOptions());
  },
  component: OpenFinancePage,
});

function OpenFinancePage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [institutionName, setInstitutionName] = useState("");
  const { data: connections } = useSuspenseQuery(connectionsQueryOptions());

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["open-finance"] });

  const createMutation = useMutation({
    mutationFn: (name: string) => createBankConnection({ data: { institution_name: name } }),
    onSuccess: async () => {
      toast.success("Instituição cadastrada.");
      setDialogOpen(false);
      setInstitutionName("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => disconnectBankConnection({ data: { id } }),
    onSuccess: async () => {
      toast.success("Conexão removida.");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Open Finance</h1>
            <p className="mt-1 text-sm text-foreground/60">
              Suas instituições financeiras cadastradas como referência.
            </p>
          </div>
          {connections.length > 0 && (
            <Button
              onClick={() => setDialogOpen(true)}
              className="rounded-full h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Nova conexão bancária
            </Button>
          )}
        </header>

        <div className="flex items-start gap-3 rounded-xl bg-zinc-900/40 p-4 border border-white/5 text-xs text-foreground/60">
          <ShieldCheck className="size-5 text-emerald-400 shrink-0" />
          <p className="leading-relaxed">
            Este cadastro ainda é <strong>manual</strong> — o Gerente Fina não sincroniza saldos ou
            extratos automaticamente. Serve como referência de quais bancos você usa; a sincronização
            automática via Open Finance (Pluggy/Belvo) está planejada para uma versão futura.
          </p>
        </div>

        {connections.length === 0 ? (
          <GlassCard className="flex flex-col items-center gap-4 p-12 text-center">
            <Landmark className="size-12 text-foreground/30" />
            <div className="space-y-1">
              <p className="text-foreground/70">
                Cadastre uma instituição financeira e tenha uma referência das suas contas.
              </p>
              <p className="text-xs text-foreground/40">
                Sincronização automática ainda não está disponível.
              </p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="rounded-full h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Nova conexão bancária
            </Button>
          </GlassCard>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connections.map((conn) => (
              <GlassCard key={conn.id} className="p-5 border border-white/10 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Link2 className="size-4 text-foreground/40 shrink-0" />
                    <h3 className="font-medium text-foreground/90">{conn.institution_name}</h3>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive opacity-40 hover:opacity-100 hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm(`Remover "${conn.institution_name}"?`)) {
                        disconnectMutation.mutate(conn.id);
                      }
                    }}
                  >
                    <Unlink className="size-4" />
                  </Button>
                </div>
                <span className="w-fit inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-foreground/50">
                  Cadastro manual
                </span>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Nova conexão bancária</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const name = institutionName.trim();
              if (!name) return;
              createMutation.mutate(name);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="institution-name">Nome do banco ou instituição</Label>
              <Input
                id="institution-name"
                autoFocus
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="Ex.: Banco Itaú S.A."
                maxLength={120}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !institutionName.trim()}>
                {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
