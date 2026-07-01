/**
 * Rota /reset-password — Redefine a senha após clique no e-mail de recuperação.
 * O Supabase entrega o link com `type=recovery` e uma sessão temporária.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Redefinir senha — Gerente FINA" }] }),
  component: ResetPasswordComponent,
});

function ResetPasswordComponent() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Senha muito curta", { description: "Use ao menos 8 caracteres." });
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha atualizada com sucesso.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error("Falha ao atualizar senha", {
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
          <h1 className="text-xl font-bold">Definir nova senha</h1>
          <p className="text-xs text-zinc-400 mt-1">Use ao menos 8 caracteres.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nova senha"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 outline-none text-sm rounded-xl px-3 py-2.5"
          />
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirmar nova senha"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 outline-none text-sm rounded-xl px-3 py-2.5"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-sm font-bold rounded-xl flex items-center justify-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />} Atualizar senha
          </button>
        </form>
      </div>
    </div>
  );
}
