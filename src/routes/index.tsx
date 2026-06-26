import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Eye, EyeOff, LogIn, UserPlus, Sparkles, ShieldCheck, Zap } from 'lucide-react';

export const Route = createFileRoute('/')({
  component: WelcomeComponent,
});

function WelcomeComponent() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    // Simulação de Handshake seguro com o Supabase Auth (0 créditos)
    setTimeout(() => {
      setIsLoading(false);
      navigate({ to: '/dashboard' });
    }, 1200);
  };

  const handleSocialAuth = (provider: 'Google' | 'Apple') => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      navigate({ to: '/dashboard' });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row overflow-hidden">
      
      {/* LADO ESQUERDO: Painel Institucional/Marketing (Oculto em Mobile) */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-zinc-900 via-zinc-950 to-indigo-950 border-r border-white/[0.04] p-12 flex-col justify-between relative">
        {/* Detalhe de Luz de Fundo */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
        
        {/* Logo/Marca */}
        <div className="flex items-center space-x-3 relative z-10">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-4 h-4 text-white animate-pulse" />
          </div>
          <span className="font-black text-xl tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Gerente FINA
          </span>
        </div>

        {/* Textos de Impacto baseados no PRD */}
        <div className="space-y-6 max-w-md relative z-10">
          <h1 className="text-4xl font-black leading-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            Sua contabilidade sob controle inteligente.
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Centralize contas, preveja fluxos de caixa, automatize lançamentos via Open Finance e interaja com o seu ecossistema financeiro por comando de voz.
          </p>
          
          {/* Badges de Recursos */}
          <div className="grid grid-cols-2 gap-3 pt-4 text-xs font-medium text-zinc-300">
            <div className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl backdrop-blur-sm">
              <Zap className="w-4 h-4 text-indigo-400" />
              <span>Open Finance Ativo</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl backdrop-blur-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>LGPD Compliant</span>
            </div>
          </div>
        </div>

        {/* Rodapé de Direitos */}
        <p className="text-xs text-zinc-600 font-mono relative z-10">
          © 2026 Gerente FINA Corporation. Todos os direitos reservados.
        </p>
      </div>

      {/* LADO DIREITO: Portal de Autenticação Real */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative">
        <div className="absolute top-3/4 right-1/4 w-64 h-64 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-sm w-full space-y-6 bg-white/[0.01] border border-white/[0.06] backdrop-blur-2xl p-8 rounded-3xl shadow-2xl relative z-10">
          
          {/* Cabeçalho do Card */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isLogin ? 'Seja bem-vindo' : 'Criar nova conta'}[cite: 2]
            </h2>
            <p className="text-xs text-zinc-400">
              {isLogin ? 'Entre com as suas credenciais de acesso' : 'Cadastre-se para automatizar suas finanças'}[cite: 2].
            </p>
          </div>

          {/* Form Real */}
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            
            {/* Input E-mail */}
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Endereço de E-mail[cite: 2]</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com" 
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 outline-none text-xs rounded-xl px-3 py-2.5 text-zinc-100 placeholder-zinc-700 transition-colors"
              />
            </div>

            {/* Input Senha com Ícone de Olho */}
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Sua Senha[cite: 2]</label>
              <div className="relative flex items-center">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 outline-none text-xs rounded-xl pl-3 pr-10 py-2.5 text-zinc-100 placeholder-zinc-700 transition-colors"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-zinc-600 hover:text-zinc-400 transition-colors"
                  title={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}[cite: 2]
                </button>
              </div>
            </div>

            {/* Botão de Submissão Principal */}
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-950/50 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  <span>{isLogin ? 'Entrar no Sistema' : 'Finalizar Cadastro'}</span>
                </>
              )}
            </button>
          </form>

          {/* Divisor Visual */}
          <div className="flex items-center my-4 text-[10px] text-zinc-600 uppercase font-bold tracking-wider">
            <div className="flex-1 h-px bg-zinc-900" />
            <span className="px-3">Ou continue com</span>
            <div className="flex-1 h-px bg-zinc-900" />
          </div>

          {/* BOTÕES DE LOGIN SOCIAL (GOOGLE E APPLE) */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button"
              onClick={() => handleSocialAuth('Google')}
              disabled={isLoading}
              className="py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {/* Ícone customizado do Google em SVG */}
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.986 0-.746-.08-1.32-.176-1.884H12.24z"/>
              </svg>
              <span>Google</span>[cite: 2]
            </button>
            <button 
              type="button"
              onClick={() => handleSocialAuth('Apple')}
              disabled={isLoading}
              className="py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {/* Ícone customizado da Apple em SVG */}
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.21.67-2.93 1.49-.62.69-1.16 1.84-1.01 2.96 1.12.09 2.27-.56 2.95-1.39z"/>
              </svg>
              <span>Apple</span>[cite: 2]
            </button>
          </div>

          {/* Alternador inline de Modo (Entrar vs Cadastrar) */}
          <div className="text-center pt-2">
            <button 
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-[11px] text-zinc-500 hover:text-indigo-400 font-medium transition-colors underline underline-offset-4"
            >
              {isLogin ? 'Não possui uma conta? Cadastre-se' : 'Já tem conta? Faça o Login'}[cite: 2]
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}
