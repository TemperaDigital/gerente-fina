/**
 * Rota raiz `/` — Portal de autenticação (login + toggle de cadastro).
 * Se já autenticado, redireciona para /dashboard.
 */
import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Sparkles, ShieldCheck, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/_app/dashboard" });
    }
  },
  component: WelcomeComponent,
});

function WelcomeComponent() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        navigate({ to: "/_app/dashboard" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/_app/dashboard" },
        });
        if (error) throw error;
        toast.success("Conta criada!", {
          description: "Verifique seu e-mail para confirmar o cadastro.",
        });
        setIsLogin(true);
      }
    } catch (err) {
      toast.error(isLogin ? "Falha no login" : "Falha no cadastro", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/_app/dashboard" },
      });
      if (error) throw error;
    } catch (err) {
      toast.error("Falha no login com Google", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row overflow-hidden">
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-b from-stone-950 via-zinc-950 to-stone-950 border-r border-white/[0.03] p-16 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-1/2 left-[-10%] w-[500px] h-[500px] bg-amber-600/[0.04] rounded-full blur-[140px] pointer-events-none" />
        <div className="flex items-center space-x-3 relative z-10">
          <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">Gerente FINA</span>
        </div>

        <div className="space-y-8 max-w-lg relative z-10 my-auto">
          <h1 className="text-5xl lg:text-6xl font-serif tracking-wide leading-[1.15] text-stone-100 font-normal">
            O dinheiro <br /> não gosta <br /> de bagunça.
          </h1>
          <p className="text-[11px] font-mono tracking-[0.3em] text-emerald-500/80 font-bold uppercase">
            Organize. Controle. Multiplique.
          </p>
          <div className="w-12 h-[1px] bg-zinc-800" />
          <p className="text-zinc-500 text-xs leading-relaxed max-w-sm font-light">
            Centralize contas patrimoniais, governe fluxos de caixa em tempo real e consolide sua contabilidade com a inteligência que o mercado de alto padrão exige.
          </p>
          <div className="flex items-center space-x-6 text-[10px] font-mono text-zinc-600">
            <div className="flex items-center space-x-2"><Zap className="w-3 h-3 text-amber-600" /><span>OPEN FINANCE REAL-TIME</span></div>
            <div className="flex items-center space-x-2"><ShieldCheck className="w-3 h-3 text-zinc-600" /><span>CRIPTOGRAFIA BANCÁRIA</span></div>
          </div>
        </div>

        <div className="text-[10px] text-zinc-600 font-mono relative z-10 space-y-1.5 border-t border-white/[0.02] pt-4">
          <p className="tracking-widest uppercase text-zinc-500 text-[9px]">© 2026 GERENTE FINA — Alexandre Guerra / Tempera Digital</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative bg-zinc-950">
        <div className="max-w-sm w-full space-y-6 bg-white/[0.01] border border-white/[0.04] backdrop-blur-2xl p-8 rounded-3xl shadow-2xl relative z-10">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {isLogin ? "Seja bem-vindo" : "Criar nova conta"}
            </h2>
            <p className="text-xs text-zinc-400">
              {isLogin ? "Entre com as suas credenciais de acesso." : "Cadastre-se para automatizar suas finanças."}
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
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 outline-none text-sm rounded-xl px-3 py-2.5 text-zinc-100 placeholder-zinc-700"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400 font-medium">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 outline-none text-sm rounded-xl px-3 py-2.5 pr-10 text-zinc-100 placeholder-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLogin ? "Entrar" : "Cadastrar"}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">ou</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <button
            onClick={handleGoogle}
            disabled={isLoading}
            className="w-full py-2.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-zinc-200 text-sm font-semibold rounded-xl transition-colors"
          >
            Continuar com Google
          </button>

          <div className="text-center text-xs text-zinc-500 space-y-1">
            <button
              onClick={() => setIsLogin((s) => !s)}
              className="text-zinc-300 hover:text-amber-400 font-semibold"
            >
              {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
            </button>
            <div>
              <Link to="/forgot-password" className="text-zinc-500 hover:text-zinc-300">
                Esqueci minha senha
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
