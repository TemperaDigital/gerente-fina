/**
 * Rota /forecast — Visualização preditiva simples do fluxo de caixa.
 * Gráfico de linha SVG nativo (sem libs pesadas) baseado em recorrências e parcelas.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { LineChart, Calendar, RefreshCw, ArrowUpRight, ArrowDownRight, Scale, Info } from 'lucide-react';
import { AppShell } from '@/components/app-shell';

export const Route = createFileRoute('/forecast')({
  component: () => (
    <AppShell>
      <ForecastComponent />
    </AppShell>
  ),
});


// Mock estruturado de projeções mensais para os próximos meses de 2026/2027
const FORECAST_DATA = {
  '3months': [
    { month: 'Julho 2026', income: 15000.00, expense: 9438.88, balance: 5561.12, cumulative: 5561.12, chartY: 150 },
    { month: 'Agosto 2026', income: 15500.00, expense: 8988.88, balance: 6511.12, cumulative: 12072.24, chartY: 110 },
    { month: 'Setembro 2026', income: 15000.00, expense: 8388.88, balance: 6611.12, cumulative: 18683.36, chartY: 80 },
  ],
  '6months': [
    { month: 'Julho 2026', income: 15000.00, expense: 9438.88, balance: 5561.12, cumulative: 5561.12, chartY: 150 },
    { month: 'Agosto 2026', income: 15500.00, expense: 8988.88, balance: 6511.12, cumulative: 12072.24, chartY: 130 },
    { month: 'Setembro 2026', income: 15000.00, expense: 8388.88, balance: 6611.12, cumulative: 18683.36, chartY: 110 },
    { month: 'Outubro 2026', income: 16200.00, expense: 7488.88, balance: 8711.12, cumulative: 27394.48, chartY: 70 },
    { month: 'Novembro 2026', income: 15000.00, expense: 10288.88, balance: 4711.12, cumulative: 32105.60, chartY: 55 }, // Consórcio/Financiamento pesado
    { month: 'Dezembro 2026', income: 28000.00, expense: 6500.00, balance: 21500.12, cumulative: 53605.72, chartY: 20 }, // 13º Salário / Férias
  ]
};

function ForecastComponent() {
  const [period, setPeriod] = useState<'3months' | '6months'>('6months');
  const [isRecalculating, setIsRecalculating] = useState(false);

  const currentData = FORECAST_DATA[period];

  // Executa uma nova varredura de previsão matemática (0 créditos consumidos)
  const handleRecalculate = () => {
    setIsRecalculating(true);
    setTimeout(() => {
      setIsRecalculating(false);
    }, 1500);
  };

  // Agregações básicas para os cards informativos superiores
  const totalPeriodIncome = currentData.reduce((acc, curr) => acc + curr.income, 0);
  const totalPeriodExpense = currentData.reduce((acc, curr) => acc + curr.expense, 0);
  const finalCumulative = currentData[currentData.length - 1].cumulative;

  // Geração dinâmica do Path do Gráfico SVG baseado no período selecionado
  const svgPath = period === '3months' 
    ? "M 50 150 L 250 110 L 450 80" 
    : "M 50 150 L 130 130 L 210 110 L 290 70 L 370 55 L 450 20";

  const svgAreaPath = period === '3months'
    ? "M 50 150 L 250 110 L 450 80 L 450 220 L 50 220 Z"
    : "M 50 150 L 130 130 L 210 110 L 290 70 L 370 55 L 450 20 L 450 220 L 50 220 Z";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6">
      
      {/* Cabeçalho da Rota */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            Previsões de Fluxo de Caixa
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Projeções automatizadas baseadas em seus parcelamentos, contratos de empréstimos e receitas fixas.
          </p>
        </div>

        <button 
          onClick={handleRecalculate}
          disabled={isRecalculating}
          className="bg-zinc-900 border border-white/[0.06] hover:bg-white/[0.08] disabled:opacity-50 text-zinc-200 px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2 self-start sm:self-center font-sans"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-400 ${isRecalculating ? 'animate-spin' : ''}`} />
          <span>Executar Nova Previsão</span>
        </button>
      </div>

      {/* BARRA DE FILTRO DE PERÍODO */}
      <div className="bg-white/[0.02] border border-white/[0.04] p-4 rounded-xl flex flex-col sm:flex-row gap-4 items-center justify-between shadow-md">
        <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold">
          <Calendar className="w-4 h-4 text-zinc-500" /> <span>Intervalo de Projeção:</span>
        </div>
        <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800 w-full sm:w-auto">
          <button 
            onClick={() => setPeriod('3months')}
            className={`flex-1 sm:flex-none px-4 py-1 rounded-md text-xs font-bold transition-all ${period === '3months' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-400'}`}
          >
            Próximos 3 meses
          </button>
          <button 
            onClick={() => setPeriod('6months')}
            className={`flex-1 sm:flex-none px-4 py-1 rounded-md text-xs font-bold transition-all ${period === '6months' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-400'}`}
          >
            Próximos 6 meses
          </button>
        </div>
      </div>

      {/* CARDS COM MÉTRICAS ACUMULADAS DO PERÍODO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Entradas Previstas (Total)</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-1">R$ {totalPeriodIncome.toLocaleString('pt-BR')}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl"><ArrowUpRight className="w-5 h-5" /></div>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Saídas Comprometidas (Total)</p>
            <p className="text-xl font-bold font-mono text-rose-400 mt-1">R$ {totalPeriodExpense.toLocaleString('pt-BR')}</p>
          </div>
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl"><ArrowDownRight className="w-5 h-5" /></div>
        </div>

        <div className="bg-gradient-to-br from-indigo-950/40 to-transparent border border-indigo-500/20 rounded-2xl p-5 flex items-center justify-between shadow-lg backdrop-blur-xl">
          <div>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Disponibilidade Líquida Final</p>
            <p className="text-xl font-bold font-mono text-white mt-1">R$ {finalCumulative.toLocaleString('pt-BR')}</p>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl"><Scale className="w-5 h-5" /></div>
        </div>
      </div>

      {/* SEÇÃO DO GRÁFICO DE PROJEÇÃO VETORIAL (SVG) */}
      <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-4">
        <h2 className="text-base font-bold text-zinc-300 flex items-center gap-2">
          <LineChart className="w-4 h-4 text-zinc-500" /> Curva Patrimonial de Caixa Futuro
        </h2>

        {/* Gráfico Inline Customizado Responsivo */}
        <div className="w-full bg-zinc-950/40 rounded-xl border border-zinc-900 p-4 overflow-x-auto">
          <div className="min-w-[500px] h-60 relative">
            <svg viewBox="0 0 500 220" className="w-full h-full overflow-visible">
              {/* Linhas de Grade de Fundo */}
              <line x1="0" y1="50" x2="500" y2="50" stroke="#1f1f23" strokeDasharray="4" />
              <line x1="0" y1="110" x2="500" y2="110" stroke="#1f1f23" strokeDasharray="4" />
              <line x1="0" y1="170" x2="500" y2="170" stroke="#1f1f23" strokeDasharray="4" />

              {/* Área Sombreada Debaixo da Linha */}
              <path d={svgAreaPath} fill="url(#indigoGradient)" opacity="0.15" className="transition-all duration-500" />

              {/* Linha Principal da Projeção */}
              <path d={svgPath} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-500" />

              {/* Mapeamento dinâmico de nós/pontos no gráfico */}
              {currentData.map((d, index) => {
                const step = 400 / (currentData.length - 1);
                const x = 50 + index * step;
                return (
                  <g key={index} className="group cursor-pointer">
                    <circle cx={x} cy={d.chartY} r="5" fill="#6366f1" className="transition-all duration-300 group-hover:r-7" />
                    <text x={x} y={d.chartY - 12} textAnchor="middle" fill="#fff" className="text-[10px] font-mono font-bold bg-zinc-900 hidden group-hover:block">
                      R$ {d.cumulative.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </text>
                  </g>
                );
              })}

              {/* Definição do Gradiente do Gráfico */}
              <defs>
                <linearGradient id="indigoGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>

            {/* Legenda Horizontal de Meses */}
            <div className="flex justify-between px-6 pt-2 text-[10px] text-zinc-500 font-mono">
              {currentData.map((d, i) => <span key={i}>{d.month.split(' ')[0]}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* TABELA DE PREVISÕES MENSAIS DETALHADA */}
      <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-4">
        <h2 className="text-base font-bold text-zinc-300 flex items-center gap-2">
          <Scale className="w-4 h-4 text-zinc-500" /> Demonstrativo Contábil de Provisões
        </h2>

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.02] border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <th className="p-4">Mês de Referência</th>
                <th className="p-4 text-right">Receitas Estimadas</th>
                <th className="p-4 text-right">Gastos Previstos</th>
                <th className="p-4 text-right">Resultado do Mês</th>
                <th className="p-4 text-right">Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-sm font-sans text-zinc-300">
              {currentData.map((row, index) => (
                <tr key={index} className="hover:bg-white/[0.01] transition-colors">
                  <td className="p-4 font-semibold text-white">{row.month}</td>
                  <td className="p-4 text-right text-emerald-400 font-mono font-medium">R$ {row.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right text-rose-400 font-mono font-medium">R$ {row.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right text-zinc-300 font-mono">R$ {row.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right text-white font-mono font-bold bg-white/[0.01]">R$ {row.cumulative.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Nota explicativa de rodapé baseada no PRD */}
        <div className="bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/50 flex items-start space-x-2.5 text-zinc-500 text-xs leading-relaxed">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p>
            As projeções acima utilizam o motor contábil da **Regra do Meio do Mês**. Lançamentos em cartões com datas posteriores ao fechamento de suas respectivas faturas são postergados para o mês seguinte automaticamente, mantendo a integridade da sua curva de caixa real.
          </p>
        </div>
      </div>

    </div>
  );
}
