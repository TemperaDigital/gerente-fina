/**
 * Layout pathless `_app` — Guarda global de autenticação.
 *
 * Todas as rotas internas (dashboard, transactions, accounts, etc.) vivem
 * sob este layout. Se o usuário não estiver autenticado, redireciona para
 * a raiz `/` (portal de login). Também dispara o modal de onboarding para
 * usuários novos sem contas nem categorias.
 */
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { FirstAccountModal } from "@/components/onboarding/first-account-modal";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/" });
    }
    return { userId: data.session.user.id };
  },
  component: AppLayout,
});

function AppLayout() {
  const { userId } = Route.useRouteContext();

  const { data: needsOnboarding } = useQuery({
    queryKey: ["onboarding-check", userId],
    queryFn: async () => {
      const [accRes, catRes] = await Promise.all([
        supabase
          .from("accounts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("categories")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      const accCount = accRes.count ?? 0;
      const catCount = catRes.count ?? 0;
      return accCount === 0 && catCount === 0;
    },
    staleTime: 60_000,
  });

  return (
    <>
      <Outlet />
      <FirstAccountModal open={!!needsOnboarding} />
    </>
  );
}
