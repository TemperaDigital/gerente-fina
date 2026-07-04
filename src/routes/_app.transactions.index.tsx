/**
 * Rota /transactions — Livro-Caixa do Gerente Fina.
 *
 * Estados na URL via validateSearch (mês, conta, categoria, tipo, busca, página).
 * Loader prima cache via TanStack Query (filtros + lookups + fila de revisão).
 */
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, RefreshCcw, FileDown, Upload } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { GlassCard, GooglePeriodPicker } from "@/components/dashboard/primitives";
import { AppShell } from "@/components/app-shell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FiltersBar,
  ReviewQueue,
  TransactionsTable,
  TransactionsTableSkeleton,
  type FiltersValue,
} from "@/components/transactions/list-ui";
import { ExportPrintDialog } from "@/components/transactions/export-print-dialog";
import {
  getTransactionsList,
  getReviewQueue,
  discardTransaction,
  mergeDuplicateTransactions,
} from "@/services/transactions.functions";
import { getAccountsLookup, getCategoriesLookup } from "@/services/lookups.functions";

// ---------------------------------------------------------------------------
// Search params
// ---------------------------------------------------------------------------
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface TxSearch {
  month: string;
  page: number;
  search?: string;
  account_id?: string;
  category_id?: string;
  kind?: "income" | "expense" | "transfer" | "invoice_payment";
}

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------
const PAGE_SIZE = 25;

const listQuery = (s: TxSearch) =>
  queryOptions({
    queryKey: ["transactions", "list", s],
    queryFn: () =>
      getTransactionsList({
        data: {
          page: s.page,
          page_size: PAGE_SIZE,
          month: s.month,
          search: s.search,
          account_id: s.account_id,
          category_id: s.category_id,
          kind: s.kind,
        },
      }),
  });

const reviewQuery = () =>
  queryOptions({
    queryKey: ["transactions", "review-queue"],
    queryFn: () => getReviewQueue(),
  });

const accountsQuery = () =>
  queryOptions({
    queryKey: ["lookups", "accounts"],
    queryFn: () => getAccountsLookup(),
  });

const categoriesQuery = () =>
  queryOptions({
    queryKey: ["lookups", "categories"],
    queryFn: () => getCategoriesLookup(),
  });

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/_app/transactions/")({
  head: () => ({
    meta: [
      { title: "Livro-Caixa — Gerente Fina" },
      {
        name: "description",
        content: "Histórico completo de lançamentos com filtros e fila de conciliação.",
      },
    ],
  }),
  validateSearch: (raw): TxSearch => ({
    month:
      typeof raw.month === "string" && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : currentMonth(),
    page:
      typeof raw.page === "number" && raw.page > 0
        ? Math.floor(raw.page)
        : typeof raw.page === "string" && Number(raw.page) > 0
          ? Math.floor(Number(raw.page))
          : 1,
    search: typeof raw.search === "string" && raw.search ? raw.search : undefined,
    account_id: typeof raw.account_id === "string" ? raw.account_id : undefined,
    category_id: typeof raw.category_id === "string" ? raw.category_id : undefined,
    kind:
      raw.kind === "income" ||
      raw.kind === "expense" ||
      raw.kind === "transfer" ||
      raw.kind === "invoice_payment"
        ? raw.kind
        : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(listQuery(deps)),
      context.queryClient.ensureQueryData(reviewQuery()),
      context.queryClient.ensureQueryData(accountsQuery()),
      context.queryClient.ensureQueryData(categoriesQuery()),
    ]);
  },
  pendingComponent: PendingPage,
  errorComponent: ErrorPage,
  notFoundComponent: () => (
    <div className="p-10 text-center text-foreground/60">Livro-Caixa indisponível.</div>
  ),
  component: TransactionsPage,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function TransactionsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [exportOpen, setExportOpen] = useState(false);

  const { data: list } = useSuspenseQuery(listQuery(search));
  const { data: review } = useSuspenseQuery(reviewQuery());
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: categories } = useSuspenseQuery(categoriesQuery());

  const filters: FiltersValue = {
    search: search.search ?? "",
    account_id: search.account_id,
    category_id: search.category_id,
    kind: search.kind,
  };

  const setSearch = (patch: Partial<TxSearch>) =>
    navigate({ search: (prev: TxSearch) => ({ ...prev, ...patch, page: 1 }) });

  const discardMut = useMutation({
    mutationFn: (id: string) => discardTransaction({ data: { id } }),
    onSuccess: async (_d, _v, ctx) => {
      const desc = (ctx as { description?: string } | undefined)?.description;
      toast.success(desc ? `Lançamento "${desc}" descartado.` : "Lançamento descartado.");
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(`Falha ao descartar: ${e.message}`),
  });

  const mergeMut = useMutation({
    mutationFn: (v: { keep_id: string; absorb_ids: string[] }) =>
      mergeDuplicateTransactions({ data: v }),
    onSuccess: async (res) => {
      toast.success(`Mesclagem concluída: ${res.absorbed_count} duplicata(s) absorvida(s).`);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(`Falha ao mesclar: ${e.message}`),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Livro-Caixa</h1>
            <p className="mt-1 text-sm text-foreground/60">
              Todos os lançamentos do período, incluindo transferências e pagamentos de fatura.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <GooglePeriodPicker value={search.month} onChange={(m) => setSearch({ month: m })} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9 rounded-full border border-white/10 bg-white/[0.04] text-foreground/70 hover:bg-white/10"
                  onClick={() => router.invalidate()}
                  aria-label="Recarregar"
                >
                  <RefreshCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recarregar lançamentos</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              asChild
              className="h-9 gap-2 rounded-full border border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/10"
            >
              <Link to="/import">
                <Upload className="size-4" />
                Importar
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-full border border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/10"
              onClick={() => setExportOpen(true)}
            >
              <FileDown className="size-4" />
              Exportar / Imprimir
            </Button>
            <Button
              asChild
              className="h-9 gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link to="/transactions/new">
                <Plus className="size-4" />
                Novo lançamento
              </Link>
            </Button>
          </div>
        </header>

        <ExportPrintDialog open={exportOpen} onOpenChange={setExportOpen} />

        <div className="space-y-4">
          <ReviewQueue
            groups={review}
            onDiscard={(id) => discardMut.mutate(id)}
            onMerge={(keep_id, absorb_ids) => mergeMut.mutate({ keep_id, absorb_ids })}
          />

          <FiltersBar
            value={filters}
            accounts={accounts}
            categories={categories}
            onChange={(v) =>
              setSearch({
                search: v.search || undefined,
                account_id: v.account_id,
                category_id: v.category_id,
                kind: v.kind,
              })
            }
          />

          <TransactionsTable
            items={list.items}
            page={list.page}
            pageSize={list.page_size}
            total={list.total}
            onPageChange={(p) => navigate({ search: (prev: TxSearch) => ({ ...prev, page: p }) })}
            onDelete={(id) => discardMut.mutate(id)}
          />
        </div>
      </div>
    </AppShell>
  );
}

function PendingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <TransactionsTableSkeleton />
      </div>
    </div>
  );
}

function ErrorPage({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <GlassCard className="max-w-md p-6 text-center">
        <h2 className="text-lg font-semibold">Não foi possível carregar o Livro-Caixa</h2>
        <p className="mt-2 text-sm text-foreground/60">{error.message}</p>
        <Button className="mt-4" onClick={() => router.invalidate()}>
          Tentar novamente
        </Button>
      </GlassCard>
    </div>
  );
}
