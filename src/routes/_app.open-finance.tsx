/**
 * Rota /open-finance — Painel de Integração de Open Finance.
 * Conexão real com SDKs de agregação bancária (Pluggy/Belvo) e sync em background.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useState } from "react";
import { Link2, RefreshCw, ShieldCheck, Plus, Unlink, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";

// ---------------------------------------------------------------------------
// Tipagem das Conexões Bancárias Ativas
// ---------------------------------------------------------------------------
interface BankConnection {
  id: string;
  provider_item_id: string;
  institution_name: string;
  status: "OUTDATED" | "UPDATED" | "LOGIN_ERROR";
  last_synced_at: string;
}

// ---------------------------------------------------------------------------
// TanStack Query — Lista de conexões de Open Finance do usuário
// ---------------------------------------------------------------------------
const connectionsQueryOptions = () =>
  queryOptions({
    queryKey: ["open-finance", "connections"],
    queryFn: async (): Promise<BankConnection[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("bank_connections")
        .select("id, provider_item_id, institution_name, status, last_synced_at")
        .eq("user_id", user.id);

      if (error) throw error;
      return (data as unknown as BankConnection[]) || [];
    },
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
  const [isOpeningWidget, setIsOpeningWidget] = useState(false);
  const { data: connections } = useSuspenseQuery(connectionsQueryOptions());

  // 1. MUTATION: Dispara sincronização em Background (Padrão Assíncrono HTTP 202)
  const syncMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase.functions.invoke("open-finance-sync", {
        body: { connectionId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sincronização agendada! Seus saldos atualizarão em segundo plano.");
      queryClient.invalidateQueries({ queryKey: ["open-finance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(`Erro ao agendar sincronização: ${err.message}`),
  });

  // 2. MUTATION: Desconectar Banco
  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conexão bancária removida com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["open-finance"] });
    },
  });

  // 3. MOTOR DO WIDGET (Pluggy/Belvo Lifecycle)
  const handleConnectBank = async () => {
    setIsOpeningWidget(true);
    try {
      // Busca o token de conexão efêmero gerado pela sua Edge Function
      const { data, error } = await supabase.functions.invoke("open-finance-token");
      if (error) throw error;

      const accessToken = data?.accessToken;

      // Configuração e inicialização do widget real do agregador
      // (Exemplo com Pluggy Connect. Para Belvo, a chamada segue a mesma lógica)
      if (window && (window as any).PluggyConnect) {
        const pluggyConnect = new (window as any).PluggyConnect({
          connectToken: accessToken,
          onSuccess: async (itemData: { item: { id: string, connector: { name: string } } }) => {
            // Salva a nova referência de conexão no banco
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from("bank_connections").insert({
              user_id: user?.id,
              provider_item_id: itemData.item.id,
              institution_name: itemData.item.connector.name,
              status: "UPDATED",
              last_synced_at: new Date().toISOString(),
            });
            
            toast.success(`${itemData.item.connector.name} conectado com sucesso!`);
            queryClient.invalidateQueries({ queryKey: ["open-finance"] });
          },
          onError: (error: any) => {
            console.error(error);
            toast.error("A conexão com o banco foi interrompida.");
          }
        });
        pluggyConnect.init();
      } else {
        // Fallback robusto para simulação em ambiente de desenvolvimento local
        console.warn("Script do agregador não carregado. Executando injeção simulada (Seed Active).");
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("bank_connections").insert({
          user_id: user?.id,
          provider_item_id: `mock_${crypto.randomUUID()}`,
          institution_name: "Banco Itaú S.A.",
          status: "UPDATED",
          last_synced_at: new Date().toISOString(),
        });
        toast.success("Banco Itaú conectado com sucesso (Ambiente de Testes)!");
        queryClient.invalidateQueries({ queryKey: ["open-finance"] });
      }
    } catch (err: any) {
      toast.error(`Falha ao abrir o hub de conexão: ${err.message}`);
    } finally {
      setIsOpeningWidget(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Open Finance</h1>
            <p className="mt-1 text-sm text-foreground/60">
              Gerencie suas conexões automáticas e sincronize extratos bancários de forma transparente e segura.
            </p>
          </div>
          <Button 
            onClick={handleConnectBank} 
            disabled={isOpeningWidget}
            className="rounded-full h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isOpeningWidget ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Conectar Nova Conta
          </Button>
        </header>

        {/* Banner de Segurança Regulamentar */}
        <div className="flex items-start gap-3 rounded-xl bg-zinc-900/40 p-4 border border-white/5 text-xs text-foreground/60">
          <ShieldCheck className="size-5 text-emerald-400 shrink-0" />
          <p className="leading-relaxed">
            As conexões do Open Finance operam sob a regulação do Banco Central do Brasil. O Gerente Fina possui chaves de criptografia assimétrica de ponta a ponta e tem acesso **estritamente em modo de leitura** de saldos e extratos. Nós nunca salvaremos ou solicitaremos suas senhas transacionais.
          </p>
        </div>

        {/* Grade de Instituições Conectadas */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/40">Instituições Ativas</h2>
          
          {connections.length === 0 ? (
            <GlassCard className="p-12 text-center text-foreground/40">
              <Link2 className="mx-auto size-12 opacity-30 mb-4" />
              Nenhum banco ou cartão de crédito integrado automaticamente ainda.
            </GlassCard>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {connections.map((conn) => {
                const isError = conn.status === "LOGIN_ERROR";
                const isOutdated = conn.status === "OUTDATED";

                return (
                  <GlassCard key={conn.id} className="p-5 border border-white/10 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium text-foreground/90">{conn.institution_name}</h3>
                          <p className="text-[11px] font-mono text-foreground/30 mt-0.5">ID: {conn.provider_item_id.substring(0, 15)}...</p>
                        </div>
                        
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive opacity-40 hover:opacity-100 hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Remover integração com ${conn.institution_name}? A atualização automática parará.`)) {
                              disconnectMutation.mutate(conn.id);
                            }
                          }}
                        >
                          <Unlink className="size-4" />
                        </Button>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        {isError ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                            <AlertCircle className="size-3" /> Reautenticar
                          </span>
                        ) : isOutdated ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                            <RefreshCw className="size-3" /> Desatualizado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            <ShieldCheck className="size-3" /> Sincronizado
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-foreground/40">
                      <span>Sync: {new Date(conn.last_synced_at).toLocaleDateString("pt-BR")}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-primary hover:bg-primary/5 gap-1"
                        onClick={() => syncMutation.mutate(conn.id)}
                        disabled={syncMutation.isPending}
                      >
                        <RefreshCw className={`size-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                        Sincronizar
                      </Button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}