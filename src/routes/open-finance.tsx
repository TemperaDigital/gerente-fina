import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Link2, Unlink, RefreshCw, CheckCircle2, Shield, Building2, AlertCircle, ExternalLink } from 'lucide-react';

export const Route = createFileRoute('/open-finance')({
  component: OpenFinanceComponent,
});

// Mock de Instituições Financeiras para a Malha Open Finance
const INITIAL_BANKS = [
  { id: 'nubank', name: 'Nubank', logo: '💜', status: 'connected', lastSync: 'Hoje às 07:30', accounts: 1 },
  { id: 'itau', name: 'Itaú Unibanco', logo: '🧡', status: 'connected', lastSync: 'Ontem às 18:15', accounts: 2 },
  { id: 'inter', name: 'Banco Inter', logo: '🧡', status: 'disconnected', lastSync: 'Há 5 dias', accounts: 0 },
  { id: 'bradesco', name: 'Bradesco', logo: '❤️', status: 'disconnected', lastSync: 'Nunca', accounts: 0 },
  { id: 'bb', name: 'Banco do Brasil', logo: '💛', status: 'disconnected', lastSync: 'Nunca', accounts: 0 },
  { id: 'santander', name: 'Santander', logo: '❤️', status: 'disconnected', lastSync: 'Nunca', accounts: 0 },
];

function OpenFinanceComponent() {
  const [banks, setBanks] = useState(INITIAL_BANKS);
  const [showWidget, setShowWidget] = useState(false);
  const [selectedBank, setSelectedBank] = useState<typeof INITIAL_BANKS[0] | null>(null);
  const [widgetStep, setWidgetStep] = useState<'intro' | 'loading' | 'success'>('intro');

  // Simulação do Fluxo OAuth assíncrono da Pluggy (Cláusula 3 do AGENTS)
  const handleConnectSimulate = (bank: typeof INITIAL_BANKS[0]) => {
    setSelectedBank(bank);
    setWidgetStep('intro');
    setShowWidget(true);
  };

  const startOAuthFlow = () => {
    setWidgetStep('loading');
    
    // Simula o background worker injetando os dados na Fila de Revisão
    setTimeout(() => {
      setWidgetStep('success');
      setBanks(prev => prev.map(b => 
        b.id === selectedBank?.id 
          ? { ...b, status: 'connected', lastSync: 'Agora mesmo', accounts: 1 } 
          : b
      ));
    }, 2500);
  };

  const handleDisconnect = (id: string) => {
    setBanks(prev => prev.map(b => 
      b.id === id 
        ? { ...b, status: 'disconnected', lastSync: 'Desconectado', accounts: 0 } 
        : b
    ));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
      
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            Conexão Bancária (Open Finance)
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Sincronize suas movimentações em tempo real com segurança bancária criptografada via Pluggy.
          </p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center space-x-2 text-emerald-400 text-xs font-medium self-start md:self-center">
          <Shield className="w-4 h-4" />
          <span>Ambiente Altamente Seguro (LGPD Compliant)</span>
        </div>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Lista de Instituições Disponíveis */}
        <div className="xl:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-300 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-zinc-500" /> Instituições Suportadas
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {banks.map((bank) => (
              <div 
                key={bank.id}
                className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xl hover:border-zinc-800 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center text-2xl shadow-inner">
                      {bank.logo}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">{bank.name}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">Sinc.: {bank.lastSync}</p>
                    </div>
                  </div>

                  {/* Badges de Status */}
                  {bank.status === 'connected' ? (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" /> Ativo
                    </span>
                  ) : (
                    <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] px-2.5 py-0.5 rounded-full font-medium uppercase tracking-wider">
                      Inativo
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-900/50">
                  <span className="text-xs text-zinc-400 font-mono">
                    {bank.accounts > 0 ? `🔗 ${bank.accounts} conta(s) vinculada(s)` : 'Nenhuma conta ativa'}
                  </span>
                  
                  {bank.status === 'connected' ? (
                    <button 
                      onClick={() => handleDisconnect(bank.id)}
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/5 transition-all text-xs font-semibold flex items-center gap-1"
                    >
                      <Unlink className="w-3.5 h-3.5" /> Desconectar
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleConnectSimulate(bank)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md shadow-indigo-900/20 transition-all flex items-center gap-1"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Conectar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card Lateral Informativo */}
        <div className="xl:col-span-1">
          <div className="bg-gradient-to-b from-indigo-950/20 to-transparent border border-indigo-500/10 rounded-2xl p-6 space-y-4 shadow-xl backdrop-blur-xl">
            <h2 className="text-base font-bold text-indigo-400 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Como funciona o Open Finance?
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              O Gerente FINA não armazena suas senhas bancárias. A conexão é estabelecida por meio de tokens criptografados seguros e regulamentados pelo Banco Central.
            </p>
            <div className="space-y-3 pt-2 text-xs">
              <div className="flex items-start space-x-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span>Atualização automática diária de saldos e faturas.</span>
              </div>
              <div className="flex items-start space-x-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span>Limpeza e categorização automática de descrições infladas por IA.</span>
              </div>
              <div className="flex items-start space-x-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <span>Barreira inteligente antifraude que impede lançamentos duplicados.</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* SIMULADOR DO WIDGET DA PLUGGY (MODAL OVERLAY) */}
      {showWidget && selectedBank && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 max-w-sm w-full rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Header do Widget */}
            <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-zinc-400 tracking-wider uppercase">
                <span className="text-indigo-400 font-extrabold text-sm">pluggy</span>
                <span>• Connect Widget</span>
              </div>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            </div>

            {/* Conteúdo Variante por Passo */}
            <div className="p-6 text-center space-y-4">
              {widgetStep === 'intro' && (
                <>
                  <div className="text-4xl">{selectedBank.logo}</div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">Vincular {selectedBank.name}</h3>
                    <p className="text-xs text-zinc-400 px-2 leading-relaxed">
                      Ao avançar, você será redirecionado para o fluxo seguro do banco para autorizar o compartilhamento de dados de leitura.
                    </p>
                  </div>
                  <div className="flex space-x-2 pt-2">
                    <button onClick={() => setShowWidget(false)} className="w-full py-2 bg-zinc-800 text-xs font-semibold text-zinc-400 rounded-xl hover:bg-zinc-700 transition-colors">Cancelar</button>
                    <button onClick={startOAuthFlow} className="w-full py-2 bg-indigo-600 text-xs font-bold text-white rounded-xl hover:bg-indigo-500 shadow-lg shadow-indigo-950/50 transition-colors flex items-center justify-center gap-1">
                      Autorizar <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}

              {widgetStep === 'loading' && (
                <div className="py-6 space-y-4 flex flex-col items-center">
                  <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white animate-pulse">Autenticando via OAuth...</p>
                    <p className="text-[11px] text-zinc-500">Estabelecendo handshake seguro assíncrono</p>
                  </div>
                </div>
              )}

              {widgetStep === 'success' && (
                <>
                  <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-950">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white">Conexão Estabelecida!</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      O token de leitura foi gerado. Suas movimentações já foram encaminhadas para a Fila de Revisão.
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowWidget(false)}
                    className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white rounded-xl transition-colors mt-2"
                  >
                    Concluir e Voltar
                  </button>
                </>
              )}
            </div>

            {/* Footer do Widget */}
            <div className="bg-zinc-950 p-2 text-center text-[10px] text-zinc-600 border-t border-zinc-800/40 font-mono">
              🔒 SSL 256-bit Encription
            </div>
          </div>
        </div>
      )}

    </div>
  );
}