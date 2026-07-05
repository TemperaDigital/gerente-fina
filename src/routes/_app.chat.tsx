/**
 * Rota /chat — IA Contábil (Gerente Fina).
 * Conectada a sendChatMessage (src/services/chat.functions.ts) que chama
 * claude-sonnet-4-6 e grava lançamentos em linguagem natural.
 *
 * Histórico de conversas (Missão 8): threads persistidas em chat_threads/
 * chat_messages, listadas numa coluna lateral (drawer no mobile).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Mic,
  Square,
  Bot,
  User,
  Sparkles,
  Loader2,
  CheckCircle2,
  DollarSign,
  Menu,
  Plus,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  sendChatMessage,
  listChatThreads,
  createChatThread,
  getChatThreadMessages,
  deleteChatThread,
  type ChatResponse,
  type ChatThreadDTO,
} from "@/services/chat.functions";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  transactionCreated?: boolean;
  transaction?: ChatResponse["transaction"];
}

function welcomeMessage(): Message {
  return {
    id: "welcome",
    role: "assistant",
    content:
      'Olá! Sou o Gerente Fina, seu assistente de inteligência contábil. Você pode me dizer um gasto ou receita em linguagem natural — como "gastei 50 no posto ipiranga" — e eu registro direto no seu livro-caixa. Também respondo perguntas sobre suas finanças. Como posso ajudar?',
    timestamp: new Date(),
  };
}

export const Route = createFileRoute("/_app/chat")({
  head: () => ({ meta: [{ title: "IA Contábil — Gerente Fina" }] }),
  component: ChatPage,
});

function formatThreadDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ---------------------------------------------------------------------------
// Lista de conversas (reaproveitada na coluna desktop e no drawer mobile)
// ---------------------------------------------------------------------------
function ThreadList({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: ChatThreadDTO[];
  activeId: string | null;
  onSelect: (thread: ChatThreadDTO) => void;
  onNew: () => void;
  onDelete: (thread: ChatThreadDTO) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <Button
        variant="outline"
        className="gap-2 border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/10"
        onClick={onNew}
      >
        <Plus className="size-4" />
        Nova conversa
      </Button>

      <div className="flex-1 space-y-1 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-foreground/40">
            Nenhuma conversa ainda.
          </p>
        ) : (
          threads.map((t) => {
            const active = t.id === activeId;
            return (
              <div
                key={t.id}
                className={cn(
                  "group relative flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                  active ? "bg-primary/15 text-foreground" : "text-foreground/70 hover:bg-white/5",
                )}
                onClick={() => onSelect(t)}
              >
                <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-foreground/40" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-medium">
                      {t.title ?? t.preview ?? "Nova conversa"}
                    </span>
                    <span className="shrink-0 text-[10px] text-foreground/30">
                      {formatThreadDate(t.updated_at)}
                    </span>
                  </div>
                  {t.title && t.preview && (
                    <p className="truncate text-[11px] text-foreground/40">{t.preview}</p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(t);
                  }}
                  className="absolute right-1.5 top-1.5 rounded-md p-1 text-foreground/30 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  aria-label="Excluir conversa"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChatPage() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([welcomeMessage()]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatThreadDTO | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const threadsQuery = useQuery({
    queryKey: ["chat", "threads"],
    queryFn: () => listChatThreads(),
  });
  const threads = threadsQuery.data ?? [];

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Histórico serializado para a server function (só role+content)
  const historyForApi = messages
    .filter((m) => m.id !== "welcome")
    .slice(-18)
    .map((m) => ({ role: m.role, content: m.content }));

  function startNewThread() {
    setSidebarOpen(false);
    setActiveThreadId(null);
    setMessages([welcomeMessage()]);
  }

  async function openThread(thread: ChatThreadDTO) {
    setSidebarOpen(false);
    setActiveThreadId(thread.id);
    try {
      const rows = await getChatThreadMessages({ data: { thread_id: thread.id } });
      setMessages(
        rows.length > 0
          ? rows.map((r) => ({
              id: r.id,
              role: r.role,
              content: r.content,
              timestamp: new Date(r.created_at),
            }))
          : [welcomeMessage()],
      );
    } catch (err) {
      toast.error("Falha ao carregar conversa", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    }
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteChatThread({ data: { thread_id: id } }),
    onSuccess: (_result, id) => {
      toast.success("Conversa excluída.");
      queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
      if (activeThreadId === id) startNewThread();
    },
    onError: (err: Error) => toast.error(`Falha ao excluir conversa: ${err.message}`),
    onSettled: () => setDeleteTarget(null),
  });

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || isSending) return;
    setInput("");
    setIsSending(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      let threadId = activeThreadId;
      if (!threadId) {
        const created = await createChatThread();
        threadId = created.id;
        setActiveThreadId(threadId);
      }

      const result = await sendChatMessage({
        data: { message: msg, history: historyForApi, thread_id: threadId },
      });

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.reply,
        timestamp: new Date(),
        transactionCreated: result.transactionCreated,
        transaction: result.transaction,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });

      if (result.transactionCreated) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success("Lançamento criado via IA!");
      }
      if (result.transactionDeleted) {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success("Lançamento excluído via IA!");
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `❌ Erro ao processar: ${err instanceof Error ? err.message : "erro desconhecido"}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  // Gravação de áudio → Whisper via Edge Function do Supabase
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(blob);
      };

      recorder.start();
      setIsRecording(true);
      toast.info("Microfone ativo... fale agora.");
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  async function transcribeAudio(blob: Blob) {
    toast.loading("Transcrevendo áudio...", { id: "whisper" });
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const { data, error } = await supabase.functions.invoke("whisper-transcribe", {
          body: { audio: base64 },
        });
        toast.dismiss("whisper");
        if (error || !data?.text) throw error ?? new Error("Transcrição vazia.");
        toast.success("Áudio transcrito!");
        handleSend(data.text);
      };
    } catch (err: unknown) {
      toast.dismiss("whisper");
      toast.error(
        `Falha na transcrição: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl gap-4 px-4 py-4 sm:py-6">
        {/* Coluna lateral de conversas — desktop */}
        <aside className="hidden w-64 shrink-0 flex-col rounded-xl border border-white/5 bg-zinc-900/30 p-3 md:flex">
          <ThreadList
            threads={threads}
            activeId={activeThreadId}
            onSelect={openThread}
            onNew={startNewThread}
            onDelete={setDeleteTarget}
          />
        </aside>

        {/* Coluna do chat */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="mb-4 flex items-center justify-between bg-zinc-900/30 p-4 rounded-xl border border-white/5">
            <div className="flex items-center gap-2.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-9 rounded-full border border-white/10 bg-white/[0.04] md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Ver conversas"
              >
                <Menu className="size-4" />
              </Button>
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-foreground/90">IA Contábil</h1>
                <p className="text-xs text-foreground/40">
                  Lançamentos por linguagem natural · claude-sonnet-4-6
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/10">
              Conectado
            </span>
          </header>

          {/* Janela de mensagens */}
          <div className="flex-1 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/40 p-4 space-y-4 shadow-inner">
            {messages.map((msg) => {
              const isBot = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={`flex w-full gap-3 ${isBot ? "justify-start" : "justify-end"}`}
                >
                  {isBot && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
                      <Bot className="size-4" />
                    </div>
                  )}
                  <div className="max-w-[80%] space-y-1.5">
                    <GlassCard
                      className={`p-3.5 text-sm ${
                        isBot
                          ? "bg-zinc-900/60 text-foreground/90 rounded-tl-none border-white/5"
                          : "bg-primary text-primary-foreground rounded-tr-none border-none shadow-md"
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-line">{msg.content}</p>
                      <span
                        className={`block text-[10px] mt-1.5 text-right ${isBot ? "text-foreground/30" : "text-primary-foreground/60"}`}
                      >
                        {msg.timestamp.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </GlassCard>

                    {/* Badge de lançamento criado */}
                    {msg.transactionCreated && msg.transaction && (
                      <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                        <CheckCircle2 className="size-3 shrink-0" />
                        <span>
                          Lançamento registrado: <strong>{msg.transaction.description}</strong> —{" "}
                          <DollarSign className="inline size-3" />
                          {Number(msg.transaction.amount).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {!isBot && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-foreground/70 border border-white/10">
                      <User className="size-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {isSending && (
              <div className="flex gap-3 justify-start">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
                  <Loader2 className="size-4 animate-spin" />
                </div>
                <GlassCard className="bg-zinc-900/40 p-3 text-xs text-foreground/40 rounded-tl-none border-none italic">
                  Processando...
                </GlassCard>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <footer className="mt-4 flex gap-2 items-center">
            <div className="relative flex-1 flex items-center bg-zinc-900/50 rounded-full border border-white/10 px-4 py-1.5 focus-within:border-primary/50 transition-colors">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={
                  isRecording ? "Gravando áudio..." : "Dite um gasto ou faça uma pergunta..."
                }
                className="w-full bg-transparent border-none text-sm text-foreground/90 placeholder-foreground/30 focus:outline-none focus:ring-0 disabled:opacity-50"
                disabled={isRecording || isSending}
              />

              {isRecording ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-full text-red-400 bg-red-500/10 hover:bg-red-500/20"
                      onClick={stopRecording}
                    >
                      <Square className="size-4 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Parar gravação e transcrever</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-full text-foreground/50 hover:text-primary hover:bg-white/5"
                      onClick={startRecording}
                      disabled={isSending}
                    >
                      <Mic className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ditar por voz</TooltipContent>
                </Tooltip>
              )}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="size-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isSending || isRecording}
                >
                  <Send className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enviar mensagem</TooltipContent>
            </Tooltip>
          </footer>
        </div>
      </div>

      {/* Drawer de conversas — mobile */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="w-72 border-white/10 bg-zinc-950/95 text-foreground backdrop-blur-xl"
        >
          <SheetHeader className="mb-3">
            <SheetTitle>Conversas</SheetTitle>
          </SheetHeader>
          <ThreadList
            threads={threads}
            activeId={activeThreadId}
            onSelect={openThread}
            onNew={startNewThread}
            onDelete={setDeleteTarget}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/60">
              "{deleteTarget?.title ?? deleteTarget?.preview ?? "Esta conversa"}" e todas as suas
              mensagens serão removidas permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/[0.04] hover:bg-white/10">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
