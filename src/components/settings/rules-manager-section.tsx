/**
 * Painel de regras de classificação aprendidas pelo importador inteligente.
 * Self-contained: busca os próprios dados e gerencia seu próprio estado de
 * exclusão — pode ser plugado em qualquer página sem props.
 */
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  listClassificationRules,
  deleteClassificationRule,
  type RuleListItemDTO,
} from "@/lib/supabase/rules.functions";

const RULES_QUERY_KEY = ["classification-rules"];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export function RulesManagerSection() {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<RuleListItemDTO | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: RULES_QUERY_KEY,
    queryFn: () => listClassificationRules(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteClassificationRule({ data: { id } }),
    onSuccess: async () => {
      toast.success("Regra removida.");
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: RULES_QUERY_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-4">
      <div className="border-b border-zinc-900 pb-3">
        <h2 className="text-base font-bold text-zinc-200 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" /> Regras de Classificação Aprendidas
        </h2>
        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
          Sempre que você confirma uma importação, o sistema memoriza o padrão da
          descrição e a categoria escolhida. Da próxima vez, ele classifica sozinho —
          sem precisar da IA. Remova uma regra se ela estiver errada.
        </p>
      </div>

      {isLoading && <p className="text-xs text-zinc-500">Carregando regras…</p>}

      {!isLoading && (!rules || rules.length === 0) && (
        <p className="text-xs text-zinc-500">
          Nenhuma regra aprendida ainda. Confirme algumas importações para começar.
        </p>
      )}

      {!isLoading && rules && rules.length > 0 && (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-zinc-900/40 border border-zinc-900 rounded-xl p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-zinc-300 truncate">
                    {rule.pattern}
                  </span>
                  <Badge variant={rule.kind === "income" ? "default" : "secondary"}>
                    {rule.kind === "income" ? "Receita" : "Despesa"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  → <span className="text-zinc-300">{rule.category_name}</span>
                  {" · "}
                  usada {rule.hit_count}x · último uso em {formatDate(rule.last_used_at)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setToDelete(rule)}
                aria-label="Remover regra"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover regra de classificação?</AlertDialogTitle>
            <AlertDialogDescription>
              A regra para "{toDelete?.pattern}" não será mais aplicada automaticamente
              em futuras importações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMut.mutate(toDelete.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
