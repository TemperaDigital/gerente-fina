/**
 * AppShell — Layout master responsivo (mobile-first) com navegação global.
 * Visual: Dark Mode Premium / vidro fosco (ZimaOS).
 */
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  ArrowLeftRight,
  Settings as SettingsIcon,
  Layers,
  Target,
  LineChart,
  Tags,
  Menu,
  MessageSquare,
  FileUp,
  CalendarClock,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function currentMonthParam(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Lançamentos", icon: ArrowLeftRight },
  { to: "/accounts", label: "Contas", icon: Wallet },
  { to: "/credit-cards", label: "Cartões", icon: CreditCard },
  { to: "/import", label: "Importar Extrato", icon: FileUp },
  { to: "/categories", label: "Categorias", icon: Tags },
  { to: "/installments", label: "Parcelas & Dívidas", icon: Layers },
  { to: "/agendamentos", label: "Agendamentos", icon: CalendarClock },
  { to: "/budgets", label: "Orçamentos", icon: Target },
  { to: "/forecast", label: "Previsão", icon: LineChart },
  { to: "/chat", label: "Chat IA", icon: MessageSquare },
  { to: "/settings", label: "Configurações", icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [openMobile, setOpenMobile] = useState(false);

  return (
    <div className="relative min-h-screen bg-zinc-950 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(800px 500px at 15% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(700px 500px at 85% 0%, rgba(168,85,247,0.14), transparent 60%), radial-gradient(900px 600px at 50% 110%, rgba(59,130,246,0.10), transparent 60%)",
        }}
      />

      {/* Top bar mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-zinc-950/70 px-4 py-3 backdrop-blur-xl md:hidden">
        <Link to="/dashboard" search={(prev) => prev} className="text-base font-semibold tracking-tight">
          Gerente <span className="text-primary">Fina</span>
        </Link>
        <button
          onClick={() => setOpenMobile((v) => !v)}
          aria-expanded={openMobile}
          aria-controls="mobile-nav"
          className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-foreground/80"
          aria-label={openMobile ? "Fechar menu" : "Abrir menu"}
        >
          <Menu className="size-4" />
        </button>
      </header>

      {/* Mobile drawer */}
      {openMobile && (
        <nav
          id="mobile-nav"
          className="border-b border-white/5 bg-zinc-950/95 px-2 py-2 backdrop-blur-xl md:hidden"
        >
          <ul className="grid grid-cols-2 gap-1">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    onClick={() => setOpenMobile(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                      active
                        ? "bg-primary/20 text-primary-foreground"
                        : "text-foreground/70 hover:bg-white/5",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{n.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="mx-auto flex w-full max-w-[1600px] gap-0 md:gap-4 md:px-4 md:py-4">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-white/5 px-3 py-6 md:flex">
          <Link to="/dashboard" search={(prev) => prev} className="mb-6 px-3 text-lg font-semibold tracking-tight">
            Gerente <span className="text-primary">Fina</span>
          </Link>
          {NAV.map((n) => {
            const active = pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-white/10 text-foreground shadow-inner"
                    : "text-foreground/60 hover:bg-white/5 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{n.label}</span>
              </Link>
            );
          })}
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
