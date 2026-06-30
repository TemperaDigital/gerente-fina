/**
 * Rota /import — Motor Real de Importação de Extratos.
 * Integração com PapaParse, geração de hash e barramento de duplicados (UI em Vermelho).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import Papa from "papaparse";
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowRight } from "lucide-react";
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
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Interface das linhas processadas
// ---------------------------------------------------------------------------
interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  kind: "income" | "expense";
  dedup_hash: string;
  isDuplicate: boolean;
}

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [{ title: "Importar Extrato — Gerente Fina" }],
  }),
  component: ImportPage,
});

function ImportPage() {
  const queryClient = useQueryClient();
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Função para criar um hash único baseado nos dados da transação
  const generateRowHash = (date: string, description: string, amount: number): string => {
    const cleanDesc = description.toLowerCase().replace(/\s+/g, "");
    const str = `${date}_${cleanDesc}_${amount.toFixed(2)}`;
    // Um hash simples e rápido para comparação em memória e texto no Postgres
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `hash_${Math.abs(hash)}`;
  };

  // Processador do Arquivo CSV
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Usuário não logado");

          const parsedItems: ParsedTransaction[] = [];
          const hashesToCheck: string[] = [];

          // 1. Parser bruto das linhas do arquivo
          results.data.forEach((row: any) => {
            // Mapeamento padrão de colunas (Data, Descricao, Valor)
            const rawDate = row.Data || row.date || row.Date;
            const rawDesc = row.Descricao || row.description || row.Description;
            const rawValue = row.Valor || row.amount || row.Amount;

            if (!rawDate || !rawDesc || !rawValue) return;

            const amount = parseFloat(rawValue.replace(",", "."));
            const kind = amount >= 0 ? "income" : "expense";
            const cleanAmount = Math.abs(amount);

            // Ajusta data para o formato YYYY-MM-DD
            let formattedDate = rawDate;
            if (rawDate.includes("/")) {
              const [d, m, y] = rawDate.split("/");
              formattedDate = `${y}-${m}-${d}`;
            }

            const hash = generateRowHash(formattedDate, rawDesc, cleanAmount);

            parsedItems.push({
              date: formattedDate,
              description: rawDesc,
              amount: cleanAmount,
              kind,
              dedup_hash: hash,
              isDuplicate: false,
            });

            hashesToCheck.push(hash);
          });

          if (hashesToCheck.length === 0) {
            toast.error("Nenhum dado válido encontrado no arquivo.");
            setIsAnalyzing(false);
            return;
          }

          // 2. O CORAÇÃO DO DEDUP: Consulta em lote no banco pelas hashes existentes
          const { data: existingTransactions, error } = await supabase
            .from("transactions")
            .select("dedup_hash")
            .in("dedup_hash", hashesToCheck);

          if (error) throw error;

          const existingHashes = new Set(existingTransactions?.map(t => t.dedup_hash) || []);

          // 3. Marca as linhas duplicadas para a UI pintar de vermelho
          const finalTransactions = parsedItems.map(item => ({
            ...item,
            isDuplicate: existingHashes.has(item.dedup_hash),
          }));

          setTransactions(finalTransactions);
          
          const dupCount = finalTransactions.filter(t => t.isDuplicate).length;
          if (dupCount > 0) {
            toast.warning(`${dupCount} transações duplicadas detectadas no extrato.`);
          } else {
            toast.success("Arquivo processado! Nenhuma duplicidade encontrada.");
          }

        } catch (err: any) {
          toast.error(`Erro no processamento: ${err.message}`);
        } finally {
          setIsAnalyzing(false);
        }
      },
      error: (error) => {
        toast.error(`Erro ao ler arquivo: ${error.message}`);
        setIsAnalyzing(false);
      }
    });
  };

  // Mutation para salvar apenas o que NÃO for duplicado
  const saveImportMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Filtra jogando fora os duplicados da inserção
      const cleanRows = transactions.filter(t => !t.isDuplicate).map(t => ({
        user_id: user.id,
        description: t.description,
        amount: t.amount,
        kind: t.kind,
        date: t.date,
        dedup_hash: t.dedup_hash,
      }));

      if (cleanRows.length === 0) {
        throw new Error("Nenhum lançamento novo para salvar.");
      }

      const { error } = await supabase.from("transactions").insert(cleanRows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Importação concluída com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setTransactions([]);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    }
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const newRowsCount = transactions.filter(t => !t.isDuplicate).length;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Importador de Extratos
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Arraste seu arquivo bancário para conciliação automática via barramento de hash.
          </p>
        </header>

        {/* Zona de Upload */}
        {transactions.length === 0 && (
          <GlassCard className="p-12 text-center border border-dashed border-white/20 relative hover:border-primary/40 transition-colors">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isAnalyzing}
            />
            <Upload className="mx-auto size-12 opacity-40 mb-4 animate-pulse" />
            <p className="text-sm font-medium text-foreground/80">
              {isAnalyzing ? "Analisando duplicidades contra o banco..." : "Clique ou arraste seu arquivo CSV aqui"}
            </p>
            <p className="text-xs text-foreground/40 mt-1">Formatos aceitos: Padrão de colunas (Data, Descricao, Valor)</p>
          </GlassCard>
        )}

        {/* Pré-visualização com Tratamento Visual de Duplicados */}
        {transactions.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-zinc-900/40 p-4 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 text-sm text-foreground/70">
                <FileText className="size-4 text-primary" />
                <span>{transactions.length} linhas lidas</span>
                <span className="text-emerald-400 font-medium">({newRowsCount} novas)</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setTransactions([])} className="rounded-full">
                  Cancelar
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => saveImportMutation.mutate()} 
                  disabled={saveImportMutation.isPending || newRowsCount === 0}
                  className="rounded-full gap-1.5"
                >
                  Confirmar Conciliação <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>

            <GlassCard className="overflow-hidden border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 bg-white/[0.02]">
                    <TableHead className="text-foreground/80">Status</TableHead>
                    <TableHead className="text-foreground/80">Data</TableHead>
                    <TableHead className="text-foreground/80">Descrição</TableHead>
                    <TableHead className="text-foreground/80 text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t, idx) => (
                    <TableRow 
                      key={idx} 
                      className={`border-white/5 transition-colors ${
                        t.isDuplicate 
                          ? "bg-red-500/10 hover:bg-red-500/15 text-red-300" 
                          : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <TableCell className="font-medium">
                        {t.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold bg-red-500/20 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="size-3" /> Já Importado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/20 px-2 py-0.5 rounded-full">
                            <CheckCircle className="size-3" /> Pronto
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.date}</TableCell>
                      <TableCell className="max-w-xs truncate">{t.description}</TableCell>
                      <TableCell className={`text-right font-mono font-medium ${t.kind === "income" ? "text-emerald-400" : ""}`}>
                        {t.kind === "expense" ? "-" : "+"}{formatCurrency(t.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </GlassCard>
          </div>
        )}
      </div>
    </AppShell>
  );
}