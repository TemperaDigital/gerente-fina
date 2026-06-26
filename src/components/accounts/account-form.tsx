/**
 * Componente compartilhado — formulário de Conta (cash/bank/credit_card).
 * Headless quanto a dados: recebe valores e dispara onSubmit com payload limpo.
 */
import { useState } from "react";
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
  forcedType: AccountFormType;
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

export function AccountForm({
  initial,
  forcedType,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
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

  const isCard = forcedType === "credit_card";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: AccountFormPayload = {
      name: name.trim(),
      institution: institution.trim() || null,
      color: null,
      icon: null,
      credit_limit_cents: isCard ? brlInputToCents(limitStr) : null,
      closing_day: isCard ? Number(closingDay) || null : null,
      due_day: isCard ? Number(dueDay) || null : null,
    };
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Nome">
        <Input
          className="border-white/10 bg-white/[0.04]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isCard ? "Ex.: Nubank Black" : "Ex.: Conta Itaú PF"}
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
              Regra do meio do mês ativa: como vencimento ({dueDay}) é maior que
              fechamento ({closingDay}), faturas vencerão no mesmo mês civil
              do fechamento.
            </div>
          )}
        </>
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
