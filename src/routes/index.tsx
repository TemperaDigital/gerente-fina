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
      
      {/* LADO ESQUERDO: Painel Conceitual Premium (Inspirado na sua foto) */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-b from-stone-950 via-zinc-950 to-stone-950 border-r border-white/[0.03] p-16 flex-col justify-between relative overflow-hidden">
        
        {/* Efeito de Luz de Fundo Simulando a Luminária de Âmbar da Foto */}
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

        {/* COPY MATADORA DA SUA IMAGEM */}
        <div className="space-y-8 max-w-lg relative z-10 my-auto">
          <div className="space-y-4">
            <h1 className="text-5xl lg:text-6xl font-serif tracking-wide leading-[1.15] text-stone-100 font-normal">
              O dinheiro <br />
              não gosta <br />
              de bagunça.
            </h1>
            
            {/* Slogan Secundário com espaçamento largo e tom verde oliva elegante */}
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

        {/* Rodapé Corporativo Fino */}
        <p className="text-[10px] text-zinc-700 font-mono tracking-widest relative z-10 uppercase">
          © 2026 GERENTE FINA CORPORATION.
        </p>
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
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.21.67-2.93 1.49-.62.69-1.16 1.84-1.01 2.96 1.12.09 2.27-.56 2.95-1.39z"/>
              </svg>
              <span>Apple</span>
            </button>
          </div>

          <div className="text-center pt-2">
            <button 
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 font-medium transition-colors underline underline-offset-4"
            >
              {isLogin ? 'Não possui uma conta? Cadastre-se' : 'Já tem conta? Faça o Login'}
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}
