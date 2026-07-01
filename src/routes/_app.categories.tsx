/**
 * Rota /categories — Categorias (despesa/receita), com hierarquia pai/filho.
 * Consome server functions (Admin Client + seed user), mesmo padrão de /accounts.
 *
 * CORREÇÃO (ver diagnóstico): a versão anterior chamava o cliente Supabase do
 * navegador direto com `type` no payload — coluna que não existe na tabela
 * (o campo real é `kind`), sem `user_id`, e sem barrar a UI quando o insert
 * falhava. Resultado: nenhuma categoria nunca foi persistida de fato.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Folder, ChevronDown, ChevronRight, Edit2, Trash2, Tag, Layers } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  listCategories,
  createCategory,
  updateCategory,
  archiveCategory,
  type CategoryDTO,
} from "@/services/categories.functions";

const categoriesQuery = () =>
  queryOptions({ queryKey: ["categories", "all"], queryFn: () => listCategories() });

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "Categorias — Gerente Fina" },
      { name: "description", content: "Organize receitas e despesas em categorias e subcategorias." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(categoriesQuery()),
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
          Erro ao carregar categorias: {error.message}
        </div>
      </div>
    </AppShell>
  ),
  component: () => (
    <AppShell>
      <CategoriesComponent />
    </AppShell>
  ),
});

function CategoriesComponent() {
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState<"expense" | "income">("expense");
  const [catParentId, setCatParentId] = useState<string>("none");
  const [archiving, setArchiving] = useState<CategoryDTO | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
    await queryClient.invalidateQueries({ queryKey: ["lookups", "categories"] });
  }

  const createMut = useMutation({
    mutationFn: (payload: { name: string; kind: "income" | "expense"; parent_id: string | null }) =>
      createCategory({ data: payload }),
    onSuccess: async () => {
      toast.success("Categoria criada.");
      setShowModal(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: string; name: string; kind: "income" | "expense"; parent_id: string | null }) =>
      updateCategory({ data: payload }),
    onSuccess: async () => {
      toast.success("Categoria atualizada.");
      setShowModal(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveCategory({ data: { id } }),
    onSuccess: async () => {
      toast.success("Categoria arquivada.");
      setArchiving(null);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleOpenCreate() {
    setModalMode("create");
    setSelectedId(null);
    setCatName("");
    setCatKind(activeTab);
    setCatParentId("none");
    setShowModal(true);
  }

  function handleOpenEdit(category: CategoryDTO) {
    setModalMode("edit");
    setSelectedId(category.id);
    setCatName(category.name);
    setCatKind(category.kind);
    setCatParentId(category.parent_id ?? "none");
    setShowModal(true);
  }

  function handleSave() {
    if (!catName.trim()) return;
    const payload = {
      name: catName.trim(),
      kind: catKind,
      parent_id: catParentId === "none" ? null : catParentId,
    };
    if (modalMode === "create") {
      createMut.mutate(payload);
    } else if (selectedId) {
      updateMut.mutate({ id: selectedId, ...payload });
    }
  }

  const live = categories.filter((c) => !c.archived_at);
  const rootCategories = live.filter((c) => c.kind === activeTab && c.parent_id === null);
  const childrenOf = (parentId: string) => live.filter((c) => c.parent_id === parentId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            Categorias
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Organize receitas e despesas em categorias e subcategorias.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nova Categoria
        </button>
      </div>

      <div className="flex border-b border-zinc-900 max-w-xs bg-white/[0.02] p-1 rounded-xl border border-white/[0.04]">
        <button
          onClick={() => setActiveTab("expense")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${activeTab === "expense" ? "bg-zinc-800 text-white shadow" : "text-zinc-500"}`}
        >
          🛑 Despesas
        </button>
        <button
          onClick={() => setActiveTab("income")}
          className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${activeTab === "income" ? "bg-zinc-800 text-white shadow" : "text-zinc-500"}`}
        >
          🟢 Receitas
        </button>
      </div>

      <div className="max-w-3xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl min-h-[150px] relative">
        {rootCategories.length === 0 ? (
          <div className="text-center py-12 text-zinc-600 space-y-1">
            <Tag className="w-10 h-10 mx-auto opacity-20" />
            <p className="text-sm">Nenhuma categoria de {activeTab === "expense" ? "despesa" : "receita"} cadastrada.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rootCategories.map((parent) => {
              const children = childrenOf(parent.id);
              const isExpanded = expanded.has(parent.id);
              return (
                <div key={parent.id} className="border border-zinc-900 rounded-xl bg-zinc-900/20 overflow-hidden">
                  <div className="flex items-center justify-between p-4 hover:bg-white/[0.01] transition-colors">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => toggleExpand(parent.id)}
                        disabled={children.length === 0}
                        className={`text-zinc-500 hover:text-white ${children.length === 0 ? "opacity-20 cursor-not-allowed" : ""}`}
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <Folder className="w-5 h-5 text-indigo-400" />
                      <span className="font-semibold text-zinc-200 text-sm">{parent.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => handleOpenEdit(parent)} className="text-zinc-500 hover:text-white p-1.5 rounded">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Editar categoria</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button onClick={() => setArchiving(parent)} className="text-zinc-600 hover:text-rose-400 p-1.5 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Arquivar categoria</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {isExpanded && children.length > 0 && (
                    <div className="bg-black/20 border-t border-zinc-900/50 divide-y divide-zinc-900/30 pl-10 pr-4">
                      {children.map((child) => (
                        <div key={child.id} className="flex items-center justify-between py-3 hover:bg-white/[0.01] transition-colors">
                          <div className="flex items-center space-x-2.5">
                            <Layers className="w-3.5 h-3.5 text-zinc-600" />
                            <span className="text-sm text-zinc-300 font-medium">{child.name}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => handleOpenEdit(child)} className="text-zinc-500 hover:text-white p-1">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Editar categoria</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => setArchiving(child)} className="text-zinc-600 hover:text-rose-400 p-1">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Arquivar categoria</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL CRIAR/EDITAR */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="border-white/10 bg-zinc-900 text-foreground">
          <DialogHeader>
            <DialogTitle>{modalMode === "create" ? "Nova Categoria" : "Editar Categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ex: Softwares" />
            </div>
            <div className="space-y-1">
              <Label>Tipo de Fluxo</Label>
              <Select value={catKind} onValueChange={(v) => setCatKind(v as "expense" | "income")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">🛑 Despesa</SelectItem>
                  <SelectItem value="income">🟢 Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Categoria Superior</Label>
              <Select value={catParentId} onValueChange={setCatParentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (categoria-pai)</SelectItem>
                  {live
                    .filter((c) => c.kind === catKind && c.parent_id === null && c.id !== selectedId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        ↳ {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending || !catName.trim()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAÇÃO DE ARQUIVAMENTO */}
      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              "{archiving?.name}" deixará de aparecer nos formulários de lançamento. O histórico de transações já
              registradas com ela é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiving && archiveMut.mutate(archiving.id)}>
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
