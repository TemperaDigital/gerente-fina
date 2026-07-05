/**
 * Diálogo "Exportar / Imprimir" do Livro-Caixa (Missão 10).
 *
 * Filtros PRÓPRIOS, independentes dos já aplicados na tela de Lançamentos —
 * por isso o segundo grupo se chama "Tipo de Conta" (cartão/conta/todos),
 * para não ser confundido com o filtro "Conta" já existente na tela, que
 * seleciona uma conta ESPECÍFICA.
 */
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatBRL } from "@/components/dashboard/primitives";
import {
  getTransactionsForExport,
  type TransactionListItemDTO,
  type TransactionKind,
} from "@/services/transactions.functions";

type PeriodMode = "all" | "month" | "range";
type AccountTypeMode = "credit_card" | "account" | "all";

const KIND_LABEL: Record<TransactionKind, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
  invoice_payment: "Pgto. Fatura",
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatBR(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-07-01" -> "07/2026" — mês da fatura de cartão a que a despesa foi anexada. */
function formatInvoiceMonth(referenceMonth: string | null): string {
  if (!referenceMonth) return "";
  const [y, m] = referenceMonth.split("-");
  return `${m}/${y}`;
}

function natureLabel(nature: "FIXA" | "VARIÁVEL" | null): string {
  if (nature === "FIXA") return "Fixa";
  if (nature === "VARIÁVEL") return "Variável";
  return "";
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildCsv(items: TransactionListItemDTO[]): string {
  const header = [
    "Data",
    "Conta",
    "Categoria",
    "Tipo",
    "Descrição",
    "Valor",
    "Fatura",
    "Tipo de Despesa",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const it of items) {
    const amount = it.kind === "expense" ? `-${it.amount}` : it.amount;
    lines.push(
      [
        formatBR(it.occurred_on),
        it.account_name ?? "",
        it.category_name ?? "",
        KIND_LABEL[it.kind],
        it.description ?? "",
        amount,
        formatInvoiceMonth(it.invoice_reference_month),
        natureLabel(it.category_nature),
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }
  return lines.join("\n");
}

function downloadCsv(items: TransactionListItemDTO[]) {
  const csv = buildCsv(items);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lancamentos-${todayIso()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Impressão / PDF — janela dedicada, fundo branco/texto preto, sem depender
// do tema escuro do app (economiza tinta e garante legibilidade impressa).
// ---------------------------------------------------------------------------
function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintHtml(items: TransactionListItemDTO[], filterLabel: string): string {
  const rows = items
    .map((it) => {
      const amount = it.kind === "expense" ? `-${formatBRL(it.amount)}` : formatBRL(it.amount);
      return `<tr>
        <td>${escapeHtml(formatBR(it.occurred_on))}</td>
        <td>${escapeHtml(it.account_name ?? "—")}</td>
        <td>${escapeHtml(it.category_name ?? "—")}</td>
        <td>${escapeHtml(KIND_LABEL[it.kind])}</td>
        <td>${escapeHtml(it.description ?? "—")}</td>
        <td class="num">${escapeHtml(amount)}</td>
        <td>${escapeHtml(formatInvoiceMonth(it.invoice_reference_month) || "—")}</td>
        <td>${escapeHtml(natureLabel(it.category_nature) || "—")}</td>
      </tr>`;
    })
    .join("");

  const total = items.reduce((acc, it) => {
    const n = Number(it.amount);
    if (!Number.isFinite(n)) return acc;
    return acc + (it.kind === "expense" ? -n : it.kind === "income" ? n : 0);
  }, 0);
  const totalLabel = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(total);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Lançamentos — ${escapeHtml(filterLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    background: #ffffff;
    color: #000000;
    font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    margin: 24px;
  }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .subtitle { font-size: 12px; color: #444; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead { display: table-header-group; }
  th, td { border-bottom: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr { break-inside: avoid; }
  tfoot td { border-top: 2px solid #000; border-bottom: none; font-weight: 700; }
  @media print {
    body { margin: 0.5cm; }
  }
</style>
</head>
<body>
  <h1>Livro-Caixa — Gerente Fina</h1>
  <p class="subtitle">${escapeHtml(filterLabel)} · ${items.length} lançamento(s) · gerado em ${escapeHtml(formatBR(todayIso()))}</p>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Conta</th>
        <th>Categoria</th>
        <th>Tipo</th>
        <th>Descrição</th>
        <th class="num">Valor</th>
        <th>Fatura</th>
        <th>Tipo de Despesa</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="8" style="text-align:center;color:#777;">Nenhum lançamento encontrado com os filtros escolhidos.</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Saldo do período (receitas − despesas, exclui transferências/pgto. fatura)</td>
        <td class="num">${escapeHtml(totalLabel)}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

function openPrintView(items: TransactionListItemDTO[], filterLabel: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    toast.error(
      "Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups do navegador.",
    );
    return;
  }
  win.document.open();
  win.document.write(buildPrintHtml(items, filterLabel));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 200);
}

// ---------------------------------------------------------------------------
// Diálogo
// ---------------------------------------------------------------------------
export function ExportPrintDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("all");
  const [month, setMonth] = useState(currentMonth());
  const [rangeFrom, setRangeFrom] = useState(todayIso());
  const [rangeTo, setRangeTo] = useState(todayIso());
  const [accountType, setAccountType] = useState<AccountTypeMode>("all");
  const [busy, setBusy] = useState<"csv" | "print" | null>(null);

  function filterLabel(): string {
    const period =
      periodMode === "all"
        ? "Todos os períodos"
        : periodMode === "month"
          ? `Mês ${month}`
          : `${formatBR(rangeFrom)} a ${formatBR(rangeTo)}`;
    const type =
      accountType === "all"
        ? "todos os tipos de conta"
        : accountType === "credit_card"
          ? "somente cartão"
          : "somente contas";
    return `${period} · ${type}`;
  }

  async function fetchRows(): Promise<TransactionListItemDTO[]> {
    return getTransactionsForExport({
      data: {
        period_mode: periodMode,
        month: periodMode === "month" ? month : undefined,
        from: periodMode === "range" ? rangeFrom : undefined,
        to: periodMode === "range" ? rangeTo : undefined,
        account_type: accountType,
      },
    });
  }

  async function handleExportCsv() {
    setBusy("csv");
    try {
      const rows = await fetchRows();
      downloadCsv(rows);
      toast.success(`CSV gerado com ${rows.length} lançamento(s).`);
    } catch (err) {
      toast.error("Falha ao exportar CSV", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    setBusy("print");
    try {
      const rows = await fetchRows();
      openPrintView(rows, filterLabel());
    } catch (err) {
      toast.error("Falha ao preparar impressão", {
        description: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-zinc-900/95 text-foreground backdrop-blur-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar / Imprimir lançamentos</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-foreground/50">
              Período
            </Label>
            <RadioGroup
              value={periodMode}
              onValueChange={(v) => setPeriodMode(v as PeriodMode)}
              className="gap-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="all" /> Todos os períodos
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="month" /> Mês específico
              </label>
              {periodMode === "month" && (
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="ml-6 h-8 w-40 border-white/10 bg-white/[0.04] text-sm"
                />
              )}
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="range" /> Intervalo de datas
              </label>
              {periodMode === "range" && (
                <div className="ml-6 flex items-center gap-2">
                  <Input
                    type="date"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    className="h-8 border-white/10 bg-white/[0.04] text-sm"
                  />
                  <span className="text-xs text-foreground/50">até</span>
                  <Input
                    type="date"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    className="h-8 border-white/10 bg-white/[0.04] text-sm"
                  />
                </div>
              )}
            </RadioGroup>
          </div>

          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-foreground/50">
              Tipo de Conta
            </Label>
            <RadioGroup
              value={accountType}
              onValueChange={(v) => setAccountType(v as AccountTypeMode)}
              className="gap-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="credit_card" /> Cartão
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="account" /> Conta (banco/dinheiro)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="all" /> Todos os tipos
              </label>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            className="gap-2 border-white/10 bg-white/[0.04] hover:bg-white/10"
            disabled={busy !== null}
            onClick={handleExportCsv}
          >
            <Download className="size-4" />
            {busy === "csv" ? "Gerando..." : "Exportar CSV"}
          </Button>
          <Button
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy !== null}
            onClick={handlePrint}
          >
            <Printer className="size-4" />
            {busy === "print" ? "Preparando..." : "Imprimir / Salvar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
