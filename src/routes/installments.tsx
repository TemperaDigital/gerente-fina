/**
 * Rota /installments — Gerenciador de Parcelas & Dívidas.
 * Fiação real conectada ao Supabase com TanStack Query e invalidação de cache.
 */
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { 
  queryOptions, 
  useMutation, 
  useQueryClient, 
  useSuspenseQuery 
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { Plus, Trash2, CheckCircle2, Calendar, CreditCard } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Tipagem dos dados vindo do Supabase
// ---------------------------------------------------------------------------
interface InstallmentItem {
  id: string;
  title: string;
  total_amount: number;
  current_installment: number;
  total_installments: number;
  next_due_date: string;
  status: "active" | "paid" | "overdue";
  description?: string | null;
}

// ---------------------------------------------------------------------------
// TanStack Query Options — Busca real no banco filtrando por usuário logado
// ---------------------------------------------------------------------------
const installmentsQueryOptions = () =>
  queryOptions({
    queryKey: ["installments", "list"],
    queryFn: async (): Promise<InstallmentItem[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("installments")
        .select("id, title, total_amount, current_installment, total_installments, next_due_date, status, description")
        .eq("user_id", user.id)
        .order("next_due_date", { ascending: true });

      if (error) throw error;
      return (data as unknown as InstallmentItem[]) || [];
    },
  });

// ---------------------------------------------------------------------------
// Definição da Rota do TanStack Router
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/installments")({
  head: () => ({
    meta: [{ title: "Parcelas & Dívidas — Gerente Fina" }],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(installmentsQueryOptions());
  },
  component: InstallmentsPage,
});

// ---------------------------------------------------------------------------
// Componente Principal da Tela
// ---------------------------------------------------------------------------
function InstallmentsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  
  // Consome os dados reais sincronizados pelo Loader
  const { data: installments } = useSuspenseQuery(installmentsQueryOptions());

  // Mutation: Pagar/Avançar uma parcela
  const payMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. Busca a parcela atual para calcular a próxima
      const { data: current } = await supabase
        .from("installments")
        .select("current_installment, total_installments")
        .eq("id", id)
        .single();

      if (!current) throw new Error("Parcela não encontrada");

      const nextInstallment = current.current_installment + 1;
      const isFinished = nextInstallment > current.total_installments;

      // 2. Atualiza o registro no banco
      const { error } = await supabase
        .from("installments")
        .update({
          current_installment: isFinished ? current.total_installments : nextInstallment,
          status: isFinished ? "paid" : "active",
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parcela atualizada com sucesso!");
      // Invalida o cache local e avisa telas vizinhas (Dashboard e Caixa precisam recalcular)
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(`Erro ao pagar parcela: ${err.message}`),
  });

  // Mutation: Deletar compromisso
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("installments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compromisso removido.");
      queryClient.invalidateQueries({ queryKey: ["installments"] });
    },
    onError: (err: Error) => toast.error(`Não foi possível deletar: ${err.message}`),
  });

  // Auxiliar para formatação de moeda
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  // Auxiliar para formatação de data
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Parcelas & Dívidas
            </h1>
            <p className="mt-1 text-sm text-foreground/60">
              Acompanhamento de compras parceladas, financiamentos e passivos de longo prazo.
            </p>
          </div>
          <Button className="h-9 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" />
            Novo parcelamento
          </Button>
        </header>

        {installments.length === 0 ? (
          <GlassCard className="p-12 text-center text-foreground/60">
            <CreditCard className="mx-auto size-12 opacity-40 mb-4" />
            Nenhum parcelamento ativo encontrado para o seu usuário.
          </GlassCard>
        ) : (
          <GlassCard className="overflow-hidden border border-white/10 bg-zinc-900/50">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 bg-white/[0.02]">
                  <TableHead className="text-foreground/80">Compromisso</TableHead>
                  <TableHead className="text-foreground/80">Progresso</TableHead>
                  <TableHead className="text-foreground/80">Valor Total</TableHead>
                  <TableHead className="text-foreground/80">Próximo Vencimento</TableHead>
                  <TableHead className="text-foreground/80 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((item) => (
                  <TableRow key={item.id} className="border-white/5 hover:bg-white/[0.02]">
                    <TableCell className="font-medium">
                      <div>
                        <p>{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-foreground/40 mt-0.5">{item.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-foreground/80">
                        {item.current_installment} de {item.total_installments}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatCurrency(item.total_amount)}
                    </TableCell>
                    <TableCell className="text-foreground/70">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Calendar className="size-3.5 text-foreground/40" />
                        {formatDate(item.next_due_date)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.status !== "paid" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 gap-1.5 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-400"
                            onClick={() => payMutation.mutate(item.id)}
                            disabled={payMutation.isPending}
                          >
                            <CheckCircle2 className="size-4" />
                            Pagar Parcela
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja remover este compromisso?")) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GlassCard>
        )}
      </div>
    </AppShell>
  );
}