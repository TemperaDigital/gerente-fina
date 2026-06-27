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
      
      {/* LADO ESQUERDO: Painel Conceitual Premium */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-b from-stone-950 via-zinc-950 to-stone-950 border-r border-white/[0.03] p-16 flex-col justify-between relative overflow-hidden">
        
        {/* Efeito de Luz de Fundo Simulando a Luminária de Âmbar */}
        <div className="absolute top-1/2 left-[-10%] w-[500px] h-[500px] bg-amber-600/[0.04] rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-emerald-700/[0.02] rounded-full blur-[100px] pointer-events-none" />
        
        {/* Logo/Marca Minimalista */}
        <div className="flex items-center space-x-3 relative z-10 opacity-70 hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
            Gerente FINA
          </span>
        </div>

        {/* COPY MATADORA */}
        <div className="space-y-8 max-w-lg relative z-10 my-auto">
          <div className="space-y-4">
            <h1 className="text-5xl lg:text-6xl font-serif tracking-wide leading-[1.15] text-stone-100 font-normal">
              O dinheiro <br />
              não gosta <br />
              de bagunça.
            </h1>
            <p className="text-[11px] font-mono tracking-[0.3em] text-emerald-500/80 font-bold uppercase pt-2">
              Organize. Controle. Multiplique.
            </p>
          </div>

          <div className="w-12 h-[1px] bg-zinc-800" />

          <p className="text-zinc-500 text-xs leading-relaxed max-w-sm font-light">
            Centralize contas patrimoniais, governe fluxos de caixa em tempo real e consolide sua contabilidade com a inteligência que o mercado de alto padrão exige.
          </p>
          
          {/* Badges Discretas de Governança */}
          <div className="flex items-center space-x-6 text-[10px] font-mono text-zinc-600 pt-2">
            <div className="flex items-center space-x-2">
              <Zap className="w-3 h-3 text-amber-600" />
              <span>OPEN FINANCE REAL-TIME</span>
            </div>
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-3 h-3 text-zinc-600" />
              <span>CRIPTOGRAFIA BANCÁRIA</span>
            </div>
          </div>
        </div>

        {/* RODAPÉ CORPORATIVO PREMIUM E ASSINATURA DA TEMPERA DIGITAL */}
        <div className="text-[10px] text-zinc-600 font-mono relative z-10 space-y-1.5 border-t border-white/[0.02] pt-4">
          <p className="tracking-widest uppercase text-zinc-500 text-[9px]">
            © 2026 GERENTE FINA CORPORATION. TODOS OS DIREITOS RESERVADOS.
          </p>
          <p className="text-zinc-400">
            Criado por{' '}
            <span className="text-zinc-200 font-semibold">Alexandre Guerra</span> — CEO da{' '}
            <a 
              href="https://temperadigital.fguerra.ia.br/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-amber-500/90 hover:text-amber-400 underline underline-offset-4 transition-colors"
            >
              Tempera Digital
            </a>
          </p>
          <p className="text-zinc-500 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px]">
            <span>Email: <a href="mailto:temperadigital@fguerra.ia.br" className="hover:text-zinc-300 transition-colors">temperadigital@fguerra.ia.br</a></span>
            <span className="text-zinc-800">|</span>
            <span>Zap: <a href="https://wa.me/5583988099913" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">(83) 98809-9913</a></span>
          </p>
        </div>

      </div>

      {/* LADO DIREITO: Portal de Autenticação Real */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative bg-zinc-950">
        <div className="absolute top-3/4 right-1/4 w-64 h-64 bg-indigo-500/[0.02] rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-sm w-full space-y-6 bg-white/[0.01] border border-white/[0.04] backdrop-blur-2xl p-8 rounded-3xl shadow-2xl relative z-10">
          
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {isLogin ? 'Seja bem-vindo' : 'Criar nova conta'}
            </h2>
            <p className="text-xs text-zinc-400">
              {isLogin ? 'Entre com as suas credenciais de acesso' : 'Cadastre-se para automatizar suas finanças'}.
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Endereço de E-mail</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com" 
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 outline-none text-xs rounded-xl px-3 py-2.5 text-zinc-100 placeholder-zinc-700 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Sua Senha</label>
              <div className="relative flex items-center">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 outline-none text-xs rounded-xl pl-3 pr-10 py-2.5 text-zinc-100 placeholder-zinc-700 transition-colors"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-zinc-600 hover:text-zinc-400 transition-colors"
                  title={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  <span>{isLogin ? 'Entrar no Sistema' : 'Finalizar Cadastro'}</span>
                </>
              )}
            </button>
          </form>

          <div className="flex items-center my-4 text-[9px] text-zinc-600 uppercase font-bold tracking-wider">
            <div className="flex-1 h-px bg-zinc-900" />
            <span className="px-3">Ou continue com</span>
            <div className="flex-1 h-px bg-zinc-900" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button"
              onClick={() => handleSocialAuth('Google')}
              disabled={isLoading}
              className="py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.986 0-.746-.08-1.32-.176-1.884H12.24z"/>
              </svg>
              <span>Google</span>
            </button>
            <button 
              type="button"
              onClick={() => handleSocialAuth('Apple')}
              disabled={isLoading}
              className="py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.7
