/**
 * Rota /settings — Hub de configurações com 4 abas (Master/Detail Otimizado).
 * Aba ativa controlada via search param ?tab=
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Shield, Download, Upload, ShieldAlert, Trash2, CheckCircle2, User, Key, Bell } from 'lucide-react';
import { AppShell } from '@/components/app-shell';

export const Route = createFileRoute('/settings')({
  component: () => (
    <AppShell>
      <SettingsComponent />
    </AppShell>
  ),
});


function SettingsComponent() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const triggerNotification = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleExportData = () => {
    // Simulação de exportação de dados estruturados em JSON conforme o PRD
    triggerNotification('✨ Todos os seus dados contábeis foram exportados com sucesso em formato JSON/CSV!');
  };

  const handleBackup = () => {
    // Simulação de geração de backup local criptografado
    triggerNotification('🔒 Backup de segurança gerado! O download do arquivo .fina-backup começará em instantes.');
  };

  const handleRestore = () => {
    // Simulação de leitura de arquivo de backup para restauração de estado
    triggerNotification('🔄 Arquivo de backup validado. Seus saldos e faturas foram restaurados com sucesso.');
  };

  const handleDeleteAccount = () => {
    if (confirmText.toLowerCase() === 'excluir definitivamente') {
      setShowDeleteModal(false);
      setConfirmText('');
      alert('Conta deletada logicamente do Supabase. Redirecionando para a tela de Boas-Vindas...');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      
      {/* Cabeçalho */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          Configurações do Sistema
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Gerencie suas preferências de segurança, exportação de dados corporativos e backups do ecossistema.
        </p>
      </div>

      {/* TOAST DE FEEDBACK DE SUCESSO COSTA A COSTA */}
      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-center space-x-3 text-emerald-400 text-sm font-medium animate-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* BLOCO 1: SEGURANÇA E GOVERNANÇA DE DADOS */}
      <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-6">
        <h2 className="text-base font-bold text-zinc-200 flex items-center gap-2 border-b border-zinc-900 pb-3">
          <Shield className="w-4 h-4 text-indigo-400" /> Governança e Portabilidade de Dados
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Exportar */}
          <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-900 flex flex-col justify-between space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Download className="w-4 h-4 text-zinc-400" /> Exportar Dados Contábeis
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Baixe instantaneamente um relatório compilado de todas as suas contas, cartões e lançamentos históricos em formatos portáveis JSON e CSV para auditorias externas.
              </p>
            </div>
            <button 
              onClick={handleExportData}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold rounded-xl transition-colors"
            >
              Exportar Agora (JSON/CSV)
            </button>
          </div>

          {/* Backup & Restauração */}
          <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-900 flex flex-col justify-between space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-zinc-400" /> Backup Local de Segurança
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Gere um arquivo físico criptografado contendo a maquete completa do seu patrimônio atual ou carregue um arquivo existente para reverter o estado do sistema.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleRestore} className="py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl border border-zinc-800 transition-colors">
                Restaurar Backup
              </button>
              <button onClick={handleBackup} className="py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-colors">
                Fazer Backup
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO 2: PREFERÊNCIAS PLACEHOLDER (ZIMAOS STYLE UI) */}
      <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl rounded-2xl p-6 shadow-2xl opacity-60 pointer-events-none">
        <h2 className="text-base font-bold text-zinc-300 flex items-center gap-2 border-b border-zinc-900 pb-3">
          <User className="w-4 h-4 text-zinc-500" /> Preferências de Perfil e Notificações
        </h2>
        <div className="space-y-4 pt-2 text-xs text-zinc-500">
          <div className="flex justify-between items-center">
            <p className="font-medium text-zinc-400">Nome do Usuário</p>
            <p className="font-mono bg-zinc-900 px-2 py-1 rounded">Arquiteto de Software</p>
          </div>
          <div className="flex justify-between items-center">
            <p className="font-medium text-zinc-400">Notificações por E-mail (Alertas de Fechamento de Faturas)</p>
            <span className="text-indigo-400 font-bold">Ativado (Dia 05)</span>
          </div>
        </div>
      </div>

      {/* BLOCO ZONA DE PERIGO (DELEÇÃO DE CONTA) */}
      <div className="bg-rose-950/10 border border-rose-500/20 rounded-2xl p-6 space-y-4">
        <div className="flex items-start space-x-3 text-rose-400">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-white">Zona de Perigo Crítico</h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              A exclusão da conta é um processo irreversível. Ao confirmar, todos os seus dados contábeis, chaves de criptografia e histórico do Open Finance associados no Supabase serão apagados permanentemente de forma imediata.
            </p>
          </div>
        </div>
        <div className="pt-2">
          <button 
            onClick={() => { setShowDeleteModal(true); setConfirmText(''); }}
            className="bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" /> Excluir Conta do Sistema
          </button>
        </div>
      </div>

      {/* DIÁLOGO DE DUPLA CONFIRMAÇÃO OBRIGATÓRIA (MODAL) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-rose-500/30 max-w-md w-full rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-white">Dupla Confirmação Exigida</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Para prosseguir com a deleção e expurgar seus dados do banco, digite a frase abaixo no campo de segurança:
              </p>
              <p className="text-xs font-mono font-bold bg-zinc-950 p-2 rounded text-rose-400 tracking-wider">
                excluir definitivamente
              </p>
            </div>

            <div className="space-y-1">
              <input 
                type="text" 
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Digite a frase para autorizar"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 outline-none text-xs rounded-xl px-3 py-2 text-zinc-100 placeholder-zinc-700 text-center font-mono"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button onClick={() => setShowDeleteModal(false)} className="w-full py-2 bg-zinc-800 text-zinc-400 text-xs font-semibold rounded-xl">
                Cancelar e Proteger Conta
              </button>
              <button 
                onClick={handleDeleteAccount}
                disabled={confirmText.toLowerCase() !== 'excluir definitivamente'}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-950/50 transition-colors"
              >
                Sim, Apagar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
