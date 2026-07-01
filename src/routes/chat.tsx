/**
 * Rota /chat — IA Contábil (Gerente Fina).
 * Conectada a sendChatMessage (src/services/chat.functions.ts) que chama
 * claude-sonnet-4-6 e grava lançamentos em linguagem natural.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Mic, Square, Bot, User, Sparkles, Loader2, CheckCircle2, DollarSign } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sendChatMessage, type ChatResponse } from "@/services/chat.functions";
import { supabase } from "@/lib/supabase/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  transactionCreated?: boolean;
  transaction?: ChatResponse["transaction"];
}

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "IA Contábil — Gerente Fina" }] }),
  component: ChatPage,
});

function ChatPage() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        'Olá! Sou o Gerente Fina, seu assistente de inteligência contábil. Você pode me dizer um gasto ou receita em linguagem natural — como "gastei 50 no posto ipiranga" — e eu registro direto no seu livro-caixa. Também respondo perguntas sobre suas finanças. Como posso ajudar?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Histórico serializado para a server function (só role+content)
  const historyForApi = messages
    .filter((m) => m.id !== "welcome")
    .slice(-18)
    .map((m) => ({ role: m.role, content: m.content }));

  const sendMut = useMutation({
    mutationFn: (text: string) =>
      sendChatMessage({ data: { message: text, history: historyForApi } }),
    onMutate: (text: string) => {
      // Adiciona mensagem do usuário imediatamente (optimistic)
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
    },
    onSuccess: (result) => {
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.reply,
        timestamp: new Date(),
        transactionCreated: result.transactionCreated,
        transaction: result.transaction,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (result.transactionCreated) {
        // Invalida caches relevantes para o dashboard/lista de transações
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success("Lançamento criado via IA!");
      }
    },
    onError: (err: Error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `❌ Erro ao processar: ${err.message}`,
          timestamp: new Date(),
        },
      ]);
    },
  });

  function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sendMut.isPending) return;
    sendMut.mutate(msg);
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
      toast.error(`Falha na transcrição: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-5xl flex-col px-4 py-4 sm:py-6">
        {/* Header */}
        <header className="mb-4 flex items-center justify-between bg-zinc-900/30 p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground/90">IA Contábil</h1>
              <p className="text-xs text-foreground/40">Lançamentos por linguagem natural · claude-sonnet-4-6</p>
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
              <div key={msg.id} className={`flex w-full gap-3 ${isBot ? "justify-start" : "justify-end"}`}>
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
                    <span className={`block text-[10px] mt-1.5 text-right ${isBot ? "text-foreground/30" : "text-primary-foreground/60"}`}>
                      {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </GlassCard>

                  {/* Badge de lançamento criado */}
                  {msg.transactionCreated && msg.transaction && (
                    <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                      <CheckCircle2 className="size-3 shrink-0" />
                      <span>
                        Lançamento registrado: <strong>{msg.transaction.description}</strong> —{" "}
                        <DollarSign className="inline size-3" />
                        {Number(msg.transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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

          {sendMut.isPending && (
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
              placeholder={isRecording ? "Gravando áudio..." : "Dite um gasto ou faça uma pergunta..."}
              className="w-full bg-transparent border-none text-sm text-foreground/90 placeholder-foreground/30 focus:outline-none focus:ring-0 disabled:opacity-50"
              disabled={isRecording || sendMut.isPending}
            />

            {isRecording ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost"
                    className="size-8 rounded-full text-red-400 bg-red-500/10 hover:bg-red-500/20"
                    onClick={stopRecording}>
                    <Square className="size-4 fill-current" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Parar gravação e transcrever</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost"
                    className="size-8 rounded-full text-foreground/50 hover:text-primary hover:bg-white/5"
                    onClick={startRecording} disabled={sendMut.isPending}>
                    <Mic className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ditar por voz</TooltipContent>
              </Tooltip>
            )}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon"
                className="size-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                onClick={() => handleSend()}
                disabled={!input.trim() || sendMut.isPending || isRecording}>
                <Send className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Enviar mensagem</TooltipContent>
          </Tooltip>
        </footer>
      </div>
    </AppShell>
  );
}
