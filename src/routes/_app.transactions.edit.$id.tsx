/**
 * Rota /transactions/edit/$id — Retificação de Lançamento.
 *
 * REGRA CONSTITUCIONAL INEGOCIÁVEL:
 *   Esta tela NUNCA exibe "Converter em Parcelamento" nem ativa Recorrência.
 *   Edição = UPDATE limpo de atributos (descrição, valor, data, conta,
 *   categoria, observações). NÃO transmuta estruturas.
 */
import { useState } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassCard } from "@/components/dashboard/primitives";
import {
  getTransactionById,
  updateTransactionEntry,
} from "@/services/transactions.functions";
import {
  getAccountsLookup,
  getCategoriesLookup,
} from "@/services/lookups.functions";

const txQuery = (id: string) =>
  queryOptions({
    queryKey: ["transaction", id],
    queryFn: () => getTransactionById({ data: { id } }),
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

export const Route = createFileRoute("/_app/transactions/edit/$id")({
  head: () => ({
    meta: [
      { title: "Editar Lançamento — Gerente Fina" },
      {
        name: "description",
        content: "Retifique atributos do lançamento sem transmutar estruturas.",
      },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(txQuery(params.id)),
      context.queryClient.ensureQueryData(accountsQuery()),
      context.queryClient.ensureQueryData(categoriesQuery()),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <GlassCard className="max-w-md p-6 text-center">
        <h2 className="text-lg font-semibold">Não foi possível abrir o lançamento</h2>
        <p className="mt-2 text-sm text-foreground/60">{error.message}</p>
      </GlassCard>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-center text-foreground/60">
      Lançamento não encontrado.
    </div>
  ),
  component: EditTransactionPage,
});

function EditTransactionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: tx } = useSuspenseQuery(txQuery(id));
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: categories } = useSuspenseQuery(categoriesQuery());

  const [description, setDescription] = useState(tx.description ?? "");
  const [amount, setAmount] = useState(tx.amount);
  const [occurredOn, setOccurredOn] = useState(tx.occurred_on);
  const [accountId, setAccountId] = useState(tx.account_id);
  const [categoryId, setCategoryId] = useState<string | undefined>(
    tx.category_id ?? undefined,
  );
  const [notes, setNotes] = useState(tx.notes ?? "");

  const isStructural =
    tx.kind === "transfer" ||
    tx.kind === "invoice_payment" ||
    tx.has_installment_link ||
    !!tx.recurrence_id;

  const filteredCategories = categories.filter((c) =>
    tx.kind === "income" ? c.kind === "income" : c.kind === "expense",
  );

  const mut = useMutation({
    mutationFn: () =>
      updateTransactionEntry({
        data: {
          id,
          description: description.trim(),
          amount: amount.replace(",", ".").trim(),
          occurred_on: occurredOn,
          account_id: accountId,
          category_id:
            tx.kind === "income" || tx.kind === "expense"
              ? categoryId ?? null
              : null,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Lançamento atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["transaction", id] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.invalidate();
      navigate({
        to: "/transactions",
        search: { month: occurredOn.slice(0, 7), page: 1 },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return toast.error("Descrição obrigatória.");
    const normalized = amount.replace(",", ".").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized))
      return toast.error("Valor inválido. Use formato 1234.56");
    if (!accountId) return toast.error("Selecione a conta.");
    mut.mutate();
  }

  const kindLabel: Record<typeof tx.kind, string> = {
    income: "Receita",
    expense: "Despesa",
    transfer: "Transferência",
    invoice_payment: "Pagamento de Fatura",
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(700px 400px at 15% -10%, rgba(99,102,241,0.16), transparent 60%), radial-gradient(700px 400px at 85% 0%, rgba(168,85,247,0.12), transparent 60%)",
        }}
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between">
          <Button
            asChild
            variant="ghost"
            className="h-9 gap-2 rounded-full border border-white/10 bg-white/[0.04] text-foreground/70 hover:bg-white/10"
          >
            <Link to="/transactions">
              <ArrowLeft className="size-4" /> Voltar
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Editar Lançamento
          </h1>
          <div className="w-[88px]" />
        </header>

        {/* Banner de modo retificação */}
        <GlassCard className="mb-4 flex items-start gap-3 border-amber-400/30 p-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <div className="text-sm">
            <div className="font-semibold text-foreground">
              Modo retificação · {kindLabel[tx.kind]}
            </div>
            <div className="mt-1 text-xs text-foreground/60">
              Apenas atributos podem ser alterados. Estruturas
              (parcelamento, recorrência, transferência) permanecem
              inalteradas — para mudá-las, exclua o lançamento e crie um novo.
            </div>
          </div>
        </GlassCard>

        <form onSubmit={handleSubmit} className="space-y-4">
          <GlassCard className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Valor (R$)">
                <Input
                  inputMode="decimal"
                  className="border-white/10 bg-white/[0.04]"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Data">
                <Input
                  type="date"
                  className="border-white/10 bg-white/[0.04]"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Descrição">
              <Input
                className="border-white/10 bg-white/[0.04]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <Field
              label={
                tx.kind === "transfer"
                  ? "Conta (perna da transferência)"
                  : "Conta"
              }
            >
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="border-white/10 bg-white/[0.04]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {(tx.kind === "income" || tx.kind === "expense") && (
              <Field label="Categoria">
                <Select
                  value={categoryId ?? ""}
                  onValueChange={(v) => setCategoryId(v || undefined)}
                >
                  <SelectTrigger className="border-white/10 bg-white/[0.04]">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field label="Observações (opcional)">
              <Textarea
                className="min-h-[60px] border-white/10 bg-white/[0.04]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {isStructural && (
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-xs text-foreground/60">
                Este lançamento integra uma estrutura
                {tx.has_installment_link
                  ? " de parcelamento"
                  : tx.recurrence_id
                  ? " de recorrência"
                  : tx.kind === "transfer"
                  ? " de transferência"
                  : " de pagamento de fatura"}
                . Os vínculos sistêmicos não são exibidos aqui por design.
              </div>
            )}
          </GlassCard>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/10 bg-white/[0.04] hover:bg-white/10"
              onClick={() =>
                navigate({
                  to: "/transactions",
                  search: { month: occurredOn.slice(0, 7), page: 1 },
                })
              }
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mut.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {mut.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-foreground/60">
        {label}
      </Label>
      {children}
    </div>
  );
}
