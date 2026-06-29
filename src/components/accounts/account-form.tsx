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
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const isCard = type === "credit_card";

  const errors = useMemo(() => {
    const e: Partial<Record<"name" | "institution" | "limit" | "closing" | "due", string>> = {};
    const trimmedName = name.trim();
    if (!trimmedName) e.name = "Informe um nome para a conta.";
    else if (trimmedName.length > 60) e.name = "Máximo de 60 caracteres.";
    if (institution.trim().length > 60) e.institution = "Máximo de 60 caracteres.";
    if (isCard) {
      const limit = brlInputToCents(limitStr);
      if (limit == null) e.limit = "Informe um limite válido (ex.: 5000,00).";
      else if (limit <= 0) e.limit = "O limite deve ser maior que zero.";
      const closing = Number(closingDay);
      if (!closingDay) e.closing = "Selecione o dia de fechamento.";
      else if (closing < 1 || closing > 31) e.closing = "Dia inválido (1–31).";
      const due = Number(dueDay);
      if (!dueDay) e.due = "Selecione o dia de vencimento.";
      else if (due < 1 || due > 31) e.due = "Dia inválido (1–31).";
    }
    return e;
  }, [name, institution, isCard, limitStr, closingDay, dueDay]);

  const hasErrors = Object.keys(errors).length > 0;

  function show(field: keyof typeof errors) {
    return (submitAttempted || touched[field]) ? errors[field] : undefined;
  }

  function markTouched(field: string) {
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  }

  function changeType(next: AccountFormType) {
    if (lockType || next === type) return;
    setType(next);
    if (next !== "credit_card") {
      // Limpa campos exclusivos de cartão para garantir payload com null
      // e respeitar a CHECK constraint da tabela accounts.
      setLimitStr("");
      setClosingDay("");
      setDueDay("");
      setTouched((t) => ({ ...t, limit: false, closing: false, due: false }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    if (hasErrors) return;
    onSubmit({
      type,
      name: name.trim(),
      institution: institution.trim() || null,
      color: null,
      icon: null,
      credit_limit_cents: isCard ? brlInputToCents(limitStr) : null,
      closing_day: isCard ? Number(closingDay) : null,
      due_day: isCard ? Number(dueDay) : null,
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

      <Field label="Nome" error={show("name")}>
        <Input
          className={cn(
            "border-white/10 bg-white/[0.04]",
            show("name") && "border-rose-400/60 focus-visible:ring-rose-400/40",
          )}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => markTouched("name")}
          aria-invalid={!!show("name")}
          placeholder={
            isCard
              ? "Ex.: Nubank Black"
              : type === "cash"
                ? "Ex.: Carteira"
                : "Ex.: Conta Itaú PF"
          }
        />
      </Field>

      <Field label="Instituição (opcional)" error={show("institution")}>
        <Input
          className={cn(
            "border-white/10 bg-white/[0.04]",
            show("institution") && "border-rose-400/60 focus-visible:ring-rose-400/40",
          )}
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          onBlur={() => markTouched("institution")}
          aria-invalid={!!show("institution")}
        />
      </Field>

      {isCard && (
        <>
          <Field label="Limite de Crédito (R$)" error={show("limit")}>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              className={cn(
                "border-white/10 bg-white/[0.04]",
                show("limit") && "border-rose-400/60 focus-visible:ring-rose-400/40",
              )}
              value={limitStr}
              onChange={(e) => setLimitStr(e.target.value)}
              onBlur={() => markTouched("limit")}
              aria-invalid={!!show("limit")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia de fechamento" error={show("closing")}>
              <Select
                value={closingDay}
                onValueChange={(v) => {
                  setClosingDay(v);
                  markTouched("closing");
                }}
              >
                <SelectTrigger
                  className={cn(
                    "border-white/10 bg-white/[0.04]",
                    show("closing") && "border-rose-400/60",
                  )}
                >
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
            <Field label="Dia de vencimento" error={show("due")}>
              <Select
                value={dueDay}
                onValueChange={(v) => {
                  setDueDay(v);
                  markTouched("due");
                }}
              >
                <SelectTrigger
                  className={cn(
                    "border-white/10 bg-white/[0.04]",
                    show("due") && "border-rose-400/60",
                  )}
                >
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

      {submitAttempted && hasErrors && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>Corrija os campos destacados antes de continuar.</span>
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
          disabled={submitting || hasErrors}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
