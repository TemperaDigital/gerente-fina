import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Plus, Target, PiggyBank, AlertCircle } from 'lucide-react';

export const Route = createFileRoute('/budgets')({
  component: BudgetsComponent,
});

const INITIAL_BUDGETS = [
  { id: '1', categoryName: 'Alimentação', limitValue: 1500, currentSpent: 1240.50, color: 'from-indigo-500 to-purple-600' },
  { id: '2', categoryName: 'Lazer e Viagens', limitValue: 600, currentSpent: 150.00, color: 'from-pink-500 to-rose-600' },
  { id: '3', categoryName: 'Transporte / Uber', limitValue: 800, currentSpent: 840.00, color: 'from-amber-500 to-orange-600' },
];

const INITIAL_GOALS = [
  { id: 'g1', title: 'Reserva de Emergência', targetValue: 20000, currentSaved: 14500, deadline: 'Dez/2026' },
  { id: 'g2', title: 'Viagem de Fim de Ano', targetValue: 8000, currentSaved: 3200, deadline: 'Nov/2026' },
];

function BudgetsComponent() {
  const [budgets, setBudgets] = useState(INITIAL_BUDGETS);
  const [goals, setGoals] = useState(INITIAL_GOALS);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'budget' | 'goal'>('budget');

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  const handleSave = () => {
    if (!name || !target) return;
    const numTarget = parseFloat(target);

    if (modalMode === 'budget') {
      setBudgets(prev => [...prev, {
        id: Date.now().toString(),
        categoryName: name,
        limitValue: numTarget,
        currentSpent: 0,
        color: 'from-teal-500 to-emerald-600'
      }]);
    } else {
      setGoals(prev => [...prev, {
        id: Date.now().toString(),
        title: name,
        targetValue: numTarget,
        currentSaved: 0,
        deadline: '2026'
      }]);
    }
    setShowModal(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          Orçamentos e Metas
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Defina tetos de gastos mensais por categoria e monitore seus objetivos de poupança de longo prazo.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* BLOCO DE LIMITES */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <h2 className="text-lg font-bold text-zinc-200 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-400" /> Limites Mensais
            </h2>
            <button onClick={() => { setModalMode('budget'); setName(''); setTarget(''); setShowModal(true); }} className="text-xs bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-zinc-300 font-semibold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Definir Limite
            </button>
          </div>

          <div className="space-y-4">
            {budgets.map(b => {
              const percent = Math.min((b.currentSpent / b.limitValue) * 100, 100);
              const isOver = b.currentSpent > b.limitValue;

              return (
                <div key={b.id} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-3 shadow-xl backdrop-blur-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-zinc-200 text-sm">{b.categoryName}</h3>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Gasto: R$ {b.currentSpent.toLocaleString('pt-BR')} de R$ {b.limitValue.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    {isOver && (
                      <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                        <AlertCircle className="w-3 h-3" /> Orçamento Estourado
                      </span>
                    )}
                  </div>

                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <div 
                      className={`h-full rounded-full bg-gradient-to-r ${isOver ? 'from-rose-500 to-red-600' : b.color} transition-all duration-500`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>{percent.toFixed(0)}% consumido</span>
                    <span>Disponível: R$ {Math.max(0, b.limitValue - b.currentSpent).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BLOCO DE METAS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <h2 className="text-lg font-bold text-zinc-200 flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-emerald-400" /> Metas de Poupança
            </h2>
            <button onClick={() => { setModalMode('goal'); setName(''); setTarget(''); setShowModal(true); }} className="text-xs bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] text-zinc-300 font-semibold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Nova Meta
            </button>
          </div>

          <div className="space-y-4">
            {goals.map(g => {
              const percent = Math.min((g.currentSaved / g.targetValue) * 100, 100);

              return (
                <div key={g.id} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-3 shadow-xl backdrop-blur-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-zinc-200 text-sm">{g.title}</h3>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Alvo: R$ {g.targetValue.toLocaleString('pt-BR')} | Prazo: {g.deadline}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      R$ {g.currentSaved.toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-white/5">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>{percent.toFixed(0)}% concluído</span>
                    <span>Faltam: R$ {(g.targetValue - g.currentSaved).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL FORMULÁRIO */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/[0.08] max-w-sm w-full rounded-2xl p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-bold text-white">
                {modalMode === 'budget' ? 'Definir Teto de Gasto' : 'Criar Nova Meta'}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">Preencha os valores de governança financeira.</p>
            </div>

            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">
                  {modalMode === 'budget' ? 'Nome da Categoria' : 'Objetivo / Título da Meta'}
                </label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={modalMode === 'budget' ? "Ex: Lazer" : "Ex: Comprar Carro"} className="w-full bg-zinc-950 border border-zinc-800 outline-none p-2 rounded-xl text-white text-xs" />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">
                  {modalMode === 'budget' ? 'Valor Limite Mensal (R$)' : 'Valor Alvo Final (R$)'}
                </label>
                <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="R$ 1000" className="w-full bg-zinc-950 border border-zinc-800 outline-none p-2 rounded-xl text-white font-mono text-xs" />
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowModal(false)} className="w-full py-2 bg-zinc-800 text-zinc-400 text-xs font-semibold rounded-xl">Cancelar</button>
              <button onClick={handleSave} className="w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
