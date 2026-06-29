/**
 * Formulário compartilhado de Conta (cash | bank | credit_card).
 * Headless quanto a dados: emite payload limpo via onSubmit.
 *
 * Modo dinâmico (lockType = false): exibe pílulas para alternar o tipo
 * e renderiza condicionalmente os campos de cartão (limite, fechamento,
 * vencimento) — respeitando a CHECK constraint da tabela `accounts`.
 */
import { useMemo, useState } from "react";
import { Banknote, Landmark, CreditCard, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AccountFormType = "cash" | "bank" | "credit_card";

export interface AccountFormValues {
  name: string;
  type: AccountFormType;
  institution: string | null;
  color: string | null;
  icon: string | null;
  credit_limit_cents: number | null;
  closing_day: number | null;
  due_day: number | null;
}

export interface AccountFormPayload {
  type: AccountFormType;
  name: string;
  institution: string | null;
  color: string | null;
  icon: string | null;
  credit_limit_cents: number | null;
  closing_day: number | null;
  due_day: number | null;
}

interface Props {
  initial?: Partial<AccountFormValues>;
  /** Tipo inicial. Se `lockType` for true, o seletor de tipo não aparece. */
  initialType: AccountFormType;
  /** Quando true, o tipo é fixo (uso em /credit-cards e na edição). */
  lockType?: boolean;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (payload: AccountFormPayload) => void;
  onCancel: () => void;
}

function brlInputToCents(raw: string): number | null {
  const n = raw.replace(/\./g, "").replace(",", ".").trim();
  if (!n) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(n)) return null;
  const [i, f = ""] = n.split(".");
  return Number(i) * 100 + Number((f + "00").slice(0, 2));
}

function centsToBRLInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const abs = Math.abs(cents);
  const inteiro = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${inteiro},${frac}`;
}

const TYPE_OPTIONS: Array<{
  value: AccountFormType;
  label: string;
  Icon: typeof Banknote;
}> = [
  { value: "cash", label: "Dinheiro", Icon: Banknote },
  { value: "bank", label: "Banco", Icon: Landmark },
  { value: "credit_card", label: "Cartão", Icon: CreditCard },
];

export function AccountForm({
  initial,
  initialType,
  lockType = false,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [type, setType] = useState<AccountFormType>(initialType);
  const [name, setName] = useState(initial?.name ?? "");
  const [institution, setInstitution] = useState(initial?.institution ?? "");
  const [limitStr, setLimitStr] = useState(
    centsToBRLInput(initial?.credit_limit_cents ?? null),
  );
  const [closingDay, setClosingDay] = useState<string>(
    initial?.closing_day ? String(initial.closing_day) : "",
  );
  const [dueDay, setDueDay] = useState<string>(
    initial?.due_day ? String(initial.due_day) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const isCard = type === "credit_card";

  function changeType(next: AccountFormType) {
    if (lockType || next === type) return;
    setType(next);
    setError(null);
    if (next !== "credit_card") {
      // Limpa campos exclusivos de cartão para garantir payload com null
      // e respeitar a CHECK constraint da tabela accounts.
      setLimitStr("");
      setClosingDay("");
      setDueDay("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe um nome para a conta.");
      return;
    }
    if (isCard) {
      const limit = brlInputToCents(limitStr);
      const closing = Number(closingDay) || null;
      const due = Number(dueDay) || null;
      if (limit == null || !closing || !due) {
        setError(
          "Cartão exige limite, dia de fechamento e dia de vencimento.",
        );
        return;
      }
      onSubmit({
        type,
        name: name.trim(),
        institution: institution.trim() || null,
        color: null,
        icon: null,
        credit_limit_cents: limit,
        closing_day: closing,
        due_day: due,
      });
      return;
    }
    onSubmit({
      type,
      name: name.trim(),
      institution: institution.trim() || null,
      color: null,
      icon: null,
      credit_limit_cents: null,
      closing_day: null,
      due_day: null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!lockType && (
        <Field label="Tipo de conta">
          <div className="grid grid-cols-3 gap-2">
            {TYPE_OPTIONS.map(({ value, label, Icon }) => {
              const active = type === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeType(value)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-xs transition-colors",
                    active
                      ? "border-primary/60 bg-primary/15 text-foreground shadow-inner"
                      : "border-white/10 bg-white/[0.04] text-foreground/70 hover:bg-white/10",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <Field label="Nome">
        <Input
          className="border-white/10 bg-white/[0.04]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            isCard
              ? "Ex.: Nubank Black"
              : type === "cash"
                ? "Ex.: Carteira"
                : "Ex.: Conta Itaú PF"
          }
        />
      </Field>

      <Field label="Instituição (opcional)">
        <Input
          className="border-white/10 bg-white/[0.04]"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
      </Field>

      {isCard && (
        <>
          <Field label="Limite de Crédito (R$)">
            <Input
              inputMode="decimal"
              placeholder="0,00"
              className="border-white/10 bg-white/[0.04]"
              value={limitStr}
              onChange={(e) => setLimitStr(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia de fechamento">
              <Select value={closingDay} onValueChange={setClosingDay}>
                <SelectTrigger className="border-white/10 bg-white/[0.04]">
                  <SelectValue placeholder="Dia" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Dia de vencimento">
              <Select value={dueDay} onValueChange={setDueDay}>
                <SelectTrigger className="border-white/10 bg-white/[0.04]">
                  <SelectValue placeholder="Dia" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-900/95 text-foreground">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {closingDay && dueDay && Number(dueDay) > Number(closingDay) && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
              Regra do meio do mês ativa: como vencimento ({dueDay}) é maior
              que fechamento ({closingDay}), faturas vencerão no mesmo mês
              civil do fechamento.
            </div>
          )}
        </>
      )}

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          className="border border-white/10 bg-white/[0.04] hover:bg-white/10"
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {submitting ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </form>
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
