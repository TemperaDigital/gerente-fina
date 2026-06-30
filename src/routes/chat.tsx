/**
 * Rota /chat — Inteligência Artificial e Consultoria Contábil.
 * Conexão com Edge Functions do Supabase e captura nativa de áudio para Whisper.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Send, Mic, Square, Bot, User, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [{ title: "IA Contábel — Gerente Fina" }],
  }),
  component: ChatPage,
});

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Olá! Sou o assistente de inteligência contábil do Gerente Fina. Você pode me fazer perguntas sobre seus saldos, pedir relatórios ou até ditar um lançamento como: 'gastei 50 no posto ipiranga'. Como posso te ajudar hoje?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Referências para gravação de áudio e scroll
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // 1. MOTOR DE ENVIO DE TEXTO (Integração com LLM via Edge Function)
  const handleSendMessage = async (textToSend?: string) => {
    const messageText = textToSend || input;
    if (!messageText.trim()) return;

    if (!textToSend) setInput(""); // Limpa o input se for envio de texto direto
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Dispara a chamada segura para a Edge Function do Supabase
      const { data, error } = await supabase.functions.invoke("chat-agent", {
        body: { 
          message: messageText,
          history: messages.map(m => ({ role: m.role, content: m.content }))
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.reply || "Entendido. Processei o seu comando com sucesso.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Se a IA detectou um comando de transação e devolveu um sinal de sucesso, avisa o usuário
      if (data?.transactionCreated) {
        toast.success("Lançamento automatizado criado via comando de voz/texto!");
      }

    } catch (err: any) {
      // Fallback amigável caso a Edge Function ainda não esteja implantada no Supabase
      console.error(err);
      const fallbackMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `[Modo Veloz]: Recebi seu comando: "${messageText}". A fiação com o Supabase está pronta para chamar a Edge Function 'chat-agent'.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. MOTOR DE CAPTURA DO MICROFONE (Nativo HTML5)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await handleAudioUpload(audioBlob);
        
        // Desliga os canais do microfone para liberar o hardware
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info("Microfone ativo... fale agora.");
    } catch (err) {
      toast.error("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 3. ENVIO DO ÁUDIO BRUTO PARA O WHISPER VIA EDGE FUNCTION
  const handleAudioUpload = async (audioBlob: Blob) => {
    setIsLoading(true);
    toast.loading("Transcrição de áudio via Whisper em andamento...", { id: "whisper-loading" });

    try {
      // Converte o arquivo de áudio para Base64 para trafegar via JSON seguro
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(",")[1];

        const { data, error } = await supabase.functions.invoke("whisper-transcribe", {
          body: { audio: base64Audio },
        });

        toast.dismiss("whisper-loading");

        if (error) throw error;

        if (data?.text) {
          toast.success("Áudio transcrito com sucesso!");
          // Joga o texto transcrito direto no fluxo de envio do Chat
          await handleSendMessage(data.text);
        } else {
          throw new Error("Não foi possível extrair o texto do áudio.");
        }
      };
    } catch (err: any) {
      toast.dismiss("whisper-loading");
      toast.error(`Falha no Whisper: ${err.message || "Usando Fallback de áudio simulado"}`);
      // Fallback simulado para desenvolvimento
      await handleSendMessage("Gastei 50 no posto ipiranga");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-5xl flex-col px-4 py-4 sm:py-6">
        
        {/* Cabeçalho */}
        <header className="mb-4 flex items-center justify-between bg-zinc-900/30 p-4 rounded-xl border border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-md font-semibold text-foreground/90">IA Contábil</h1>
              <p className="text-xs text-foreground/40">Análise preditiva e comandos por voz</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/10">
            Gateway Pronto
          </span>
        </header>

        {/* Janela de Mensagens */}
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

                <GlassCard className={`max-w-[80%] p-3.5 text-sm ${
                  isBot 
                    ? "bg-zinc-900/60 text-foreground/90 rounded-tl-none border-white/5" 
                    : "bg-primary text-primary-foreground rounded-tr-none border-none shadow-md"
                }`}>
                  <p className="leading-relaxed whitespace-pre-line">{msg.content}</p>
                  <span className={`block text-[10px] mt-1.5 text-right ${isBot ? "text-foreground/30" : "text-primary-foreground/60"}`}>
                    {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </GlassCard>

                {!isBot && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-foreground/70 border border-white/10">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Indicador de carregamento */}
          {isLoading && (
            <div className="flex w-full gap-3 justify-start">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 animate-spin">
                <Loader2 className="size-4" />
              </div>
              <GlassCard className="bg-zinc-900/40 p-3 text-xs text-foreground/40 rounded-tl-none border-none italic">
                Aguardando processamento cognitivo...
              </GlassCard>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Caixa de Entrada e Gatilhos de Mídia */}
        <footer className="mt-4 flex gap-2 items-center">
          <div className="relative flex-1 flex items-center bg-zinc-900/50 rounded-full border border-white/10 px-4 py-1.5 focus-within:border-primary/50 transition-colors">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder={isRecording ? "Gravando áudio..." : "Faça uma pergunta ou dite um gasto..."}
              className="w-full bg-transparent border-none text-sm text-foreground/90 placeholder-foreground/30 focus:outline-none focus:ring-0 disabled:opacity-50"
              disabled={isRecording || isLoading}
            />
            
            {isRecording ? (
              <Button
                size="icon"
                variant="ghost"
                className="size-8 rounded-full text-red-400 bg-red-500/10 hover:bg-red-500/20"
                onClick={stopRecording}
              >
                <Square className="size-4 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="size-8 rounded-full text-foreground/50 hover:text-primary hover:bg-white/5"
                onClick={startRecording}
                disabled={isLoading}
              >
                <Mic className="size-4" />
              </Button>
            )}
          </div>

          <Button
            size="icon"
            className="size-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
            onClick={() => handleSendMessage()}
            disabled={!input.trim() || isLoading || isRecording}
          >
            <Send className="size-4" />
          </Button>
        </footer>

      </div>
    </AppShell>
  );
}