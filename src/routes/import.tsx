import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Upload, FileText, Check, AlertTriangle, Trash2, Edit2, RefreshCw } from 'lucide-react';

export const Route = createFileRoute('/import')({
  component: ImportComponent,
});

const MOCK_IMPORTED_ITEMS = [
  { id: '1', date: '2026-06-15', desc: 'SUPERMERCADO PARAIBA', cat: 'Alimentação', amount: 184.50, parcel: '1/1', isDuplicate: false },
  { id: '2', date: '2026-06-16', desc: 'POSTO DE COMBUSTIVEL JESSICA', cat: 'Transporte', amount: 50.00, parcel: '1/1', isDuplicate: true },
  { id: '3', date: '2026-06-18', desc: 'LOJA RENNER PARCELA', cat: 'Vestuário', amount: 89.90, parcel: '2/5', isDuplicate: false },
  { id: '4', date: '2026-06-16', desc: 'POSTO DE COMBUSTIVEL JESSICA', cat: 'Transporte', amount: 50.00, parcel: '1/1', isDuplicate: true },
];

function ImportComponent() {
  const [files, setFiles] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [items, setItems] = useState<typeof MOCK_IMPORTED_ITEMS>([]);
  const [isCard, setIsCard] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">Importação de Extratos</h1>
        <p className="text-sm text-zinc-400 mt-1">Faça upload de arquivos CSV/OFX com análise inteligente de faturas e duplicidades.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div onClick={() => setFiles(['extrato_junho_2026.ofx'])} className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-white/[0.02] backdrop-blur-xl rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center group">
            <Upload className="w-10 h-10 text-zinc-500 group-hover:text-zinc-400 mb-3 transition-colors" />
            <p className="text-sm font-medium text-zinc-300">Arrastar & Soltar ou clique aqui</p>
            <p className="text-xs text-zinc-500 mt-1">Formatos suportados: .CSV e .OFX</p>
          </div>

          {files.length > 0 && (
            <div className="bg-white/[0.04] border border-white/[0.06] backdrop-blur-xl p-4 rounded-xl flex items-center justify-between animate-in fade-in duration-200">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-indigo-400" />
                <span className="text-sm font-medium truncate max-w-[150px]">{files[0]}</span>
              </div>
              <button onClick={() => { setIsProcessing(true); setTimeout(() => { setIsProcessing(false); setShowModal(true); }, 1200); }} disabled={isProcessing} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2">
                {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Processar</span>}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl min-h-[300px] relative overflow-hidden">
            {items.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-4 text-center">
                <FileText className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-sm">Nenhum extrato processado.</p>
                <p className="text-xs opacity-60">Selecione e processe um arquivo para mapear os lançamentos.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {items.some(i => i.isDuplicate) && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in slide-in-from-top-2">
                    <div className="flex items-center space-x-3 text-amber-400">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <p className="text-sm font-medium">Lançamentos repetidos ou já existentes identificados em vermelho!</p>
                    </div>
                    <button onClick={() => setItems(prev => prev.filter(item => !item.isDuplicate))} className="bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">Ignorar Duplicatas</button>
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <th className="p-3">Data</th>
                        <th className="p-3">Descrição</th>
                        <th className="p-3">Categoria</th>
                        <th className="p-3 text-right">Valor</th>
                        <th className="p-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 text-sm">
                      {items.map((item) => (
                        <tr key={item.id} className={`transition-colors ${item.isDuplicate ? 'bg-rose-500/10 text-rose-200 hover:bg-rose-500/15' : 'hover:bg-white/[0.01]'}`}>
                          <td className="p-3 font-mono text-xs">{item.date}</td>
                          <td className="p-3">
                            <div className="font-medium truncate max-w-[180px]">{item.desc}</div>
                            {item.parcel !== '1/1' && <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">💳 Parcela {item.parcel}</span>}
                          </td>
                          <td className="p-3"><span className="bg-white/[0.05] px-2 py-1 rounded text-xs text-zinc-300">{item.cat}</span></td>
                          <td className="p-3 text-right font-semibold font-mono">R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              <button className="text-zinc-400 hover:text-white p-1 rounded"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-zinc-500 hover:text-rose-400 p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button onClick={() => setItems([])} className="px-4 py-2 border border-zinc-800 hover:bg-white/[0.02] text-sm font-medium rounded-xl transition-colors">Cancelar</button>
                  <button onClick={() => setItems([])} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors flex items-center space-x-2">
                    <Check className="w-4 h-4" /> <span>Confirmar Importação</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.08] max-w-md w-full rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">IA: Classificação do Extrato</h3>
              <p className="text-xs text-zinc-400">Identificamos as propriedades do arquivo. Confirme o destino:</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setIsCard(false)} className={`p-3 rounded-xl border text-sm font-medium transition-all ${!isCard ? 'border-indigo-500 bg-indigo-500/5 text-indigo-300' : 'border-zinc-800 text-zinc-400'}`}>🏦 Conta Corrente</button>
              <button type="button" onClick={() => setIsCard(true)} className={`p-3 rounded-xl border text-sm font-medium transition-all ${isCard ? 'border-indigo-500 bg-indigo-500/5 text-indigo-300' : 'border-zinc-800 text-zinc-400'}`}>💳 Cartão de Crédito</button>
            </div>
            {isCard && (
              <div className="bg-white/[0.02] border border-zinc-800 p-3 rounded-xl text-center space-y-1 animate-in slide-in-from-top-2">
                <p className="text-[10px] font-semibold text-amber-400 uppercase">Ciclo Detectado</p>
                <p className="text-xs text-zinc-300 font-medium">Fechamento: Dia 05 | Vencimento: Dia 15</p>
              </div>
            )}
            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowModal(false)} className="w-full py-2 bg-zinc-800 text-zinc-300 text-sm font-medium rounded-xl">Voltar</button>
              <button onClick={() => { setShowModal(false); setItems(MOCK_IMPORTED_ITEMS); }} className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}