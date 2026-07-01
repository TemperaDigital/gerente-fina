/**
 * Rota /forgot-password — Envia e-mail de recuperação de senha.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Recuperar senha — Gerente FINA" }] }),
  component: ForgotPasswordComponent,
});

function ForgotPasswordComponent() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      setSent(true);
      toast.success("E-mail enviado", { description: "Verifique sua caixa de entrada." });
    } catch (err) {
      toast.error("Falha ao enviar e-mail", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-6 bg-white/[0.01] border border-white/[0.04] backdrop-blur-2xl p-8 rounded-3xl shadow-2xl">
        <div className="text-center">
          <h1 className="text-xl font-bold">Recuperar acesso</h1>
          <p className="text-xs text-zinc-400 mt-1">Enviaremos um link para redefinir sua senha.</p>
        </div>
        {sent ? (
          <p className="text-sm text-emerald-400 text-center">
            Se a conta existir, você receberá um e-mail em instantes.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 outline-none text-sm rounded-xl px-3 py-2.5"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-sm font-bold rounded-xl flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />} Enviar link
            </button>
          </form>
        )}
        <div className="text-center text-xs">
          <Link to="/" className="text-zinc-400 hover:text-amber-400">← Voltar ao login</Link>
        </div>
      </div>
    </div>
  );
}
