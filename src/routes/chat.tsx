import { createFileRoute } from '@tanstack/react-router';
import { useState, useRef, useEffect } from 'react';
import { Send, Mic, Sparkles, Trash2, MicOff } from 'lucide-react';

export const Route = createFileRoute('/chat')({
  component: ChatComponent,
});

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function ChatComponent() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Olá! Sou a FINA, sua gerente financeira com inteligência artificial. Pode digitar sua movimentação ou clicar no microfone para mandar um comando de voz. Exemplo: "Lança uma despesa de 45 reais na categoria alimentação usando o cartão Inter feito ontem."', timestamp: '10:00' }
  ]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');

    // Simulação de resposta contábil inteligente em background (0 créditos)
    setTimeout(() => {
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `✨ Entendido! Processei seu comando com sucesso. Identifiquei uma **Despesa de R$ 45,00** na categoria **Alimentação**. O lançamento foi direcionado para a fatura de competência **Julho/2026** do seu cartão Inter devido à regra do meio do mês (Fechamento dia 05). Já atualizei seu Dashboard!`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, assistantMsg]);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-zinc-950 text-zinc-100 p-4 md:p-6 max-w-5xl mx-auto">
      {/* Topo do Chat */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Conversa com Gerente FINA</h1>
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" /> Agente Contábil Ativo
            </p>
          </div>
        </div>
        <button onClick={() => setMessages([messages[0]])} className="text-zinc-500 hover:text-rose-400 p-2 rounded-xl transition-colors hover:bg-white/[0.02]" title="Limpar histórico">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Corpo de Mensagens */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}>
            <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-xl border ${
              msg.role === 'user' 
                ? 'bg-indigo-600 border-indigo-500 text-white rounded-br-none' 
                : 'bg-white/[0.03] border-white/[0.06] text-zinc-200 rounded-bl-none backdrop-blur-xl'
            }`}>
              <p className="leading-relaxed whitespace-pre-line" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
              <span className="text-[10px] text-zinc-400 block text-right mt-1.5 font-mono">{msg.timestamp}</span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Barra de Input Inferior */}
      <div className="mt-4 pt-2 border-t border-white/[0.06]">
        <div className="bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl rounded-2xl p-2 flex items-center space-x-2 focus-within:border-indigo-500 transition-all shadow-inner">
          <button 
            type="button"
            onClick={() => {
              setIsRecording(!isRecording);
              if(!isRecording) { setInput('Gravando áudio via Whisper...'); setTimeout(() => { setInput('Lançar despesa de 45 reais no mercado com cartão Inter'); setIsRecording(false); }, 2500); }
            }}
            className={`p-3 rounded-xl transition-all flex items-center justify-center ${isRecording ? 'bg-rose-600 text-white animate-bounce' : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]'}`}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={isRecording ? "Ouvindo atentamente..." : "Digite um comando financeiro ou dúvida..."}
            disabled={isRecording}
            className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-100 placeholder-zinc-500 px-2 disabled:opacity-50"
          />

          <button 
            onClick={handleSendMessage}
            disabled={!input.trim() || isRecording}
            className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-md shadow-indigo-900/30 flex items-center justify-center disabled:opacity-40 disabled:hover:bg-indigo-600"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}