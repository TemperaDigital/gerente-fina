/**
 * Modal de boas-vindas para novos usuários (blank-state).
 * Dispara quando não há contas nem categorias cadastradas.
 */
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Wallet, Tags } from "lucide-react";

export function FirstAccountModal({ open }: { open: boolean }) {
  return (
    <Dialog open={open}>
      <DialogContent className="bg-zinc-950 border-white/10 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-amber-400" />
          </div>
          <DialogTitle className="text-xl">Bem-vindo ao Gerente FINA</DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm leading-relaxed">
            Para começar, cadastre sua primeira conta corrente ou cartão de crédito.
            Depois organize suas categorias e comece a lançar movimentações.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
            <Wallet className="w-5 h-5 text-indigo-400 mb-2" />
            <p className="text-sm font-semibold">Contas & Cartões</p>
            <p className="text-xs text-zinc-500 mt-1">Onde seu dinheiro entra e sai.</p>
          </div>
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
            <Tags className="w-5 h-5 text-emerald-400 mb-2" />
            <p className="text-sm font-semibold">Categorias</p>
            <p className="text-xs text-zinc-500 mt-1">Organize receitas e despesas.</p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button asChild className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold">
            <Link to="/_app/accounts">Cadastrar primeira conta</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
