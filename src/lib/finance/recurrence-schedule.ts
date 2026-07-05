/**
 * Motor de avanço de datas para recorrências.
 * Função pura (sem I/O) — fácil de testar com vitest.
 *
 * Regra de day_of_month: quando a recorrência é mensal/anual e o mês de
 * destino tem menos dias que day_of_month (ex: dia 31 em fevereiro), a data
 * cai no ÚLTIMO dia do mês — nunca "vaza" para o mês seguinte.
 *
 * "once" (Missão 7) é uma ocorrência ÚNICA — não tem próxima data. NUNCA
 * chame computeNextRun para uma recorrência 'once' (lança erro de propósito,
 * para pegar esse uso indevido em desenvolvimento). occurrencesUntil trata
 * 'once' como caso especial (no máximo 1 data, sem chamar computeNextRun).
 */
export type RecurrenceFrequency = "once" | "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceLike {
  frequency: RecurrenceFrequency;
  interval_count: number;
  day_of_month: number | null;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Retorna a PRÓXIMA data de ocorrência estritamente após `from`. */
export function computeNextRun(from: string, rec: RecurrenceLike): string {
  const [y, m, d] = from.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));

  switch (rec.frequency) {
    case "once":
      throw new Error(
        "computeNextRun não se aplica a frequência 'once' — não há próxima ocorrência.",
      );
    case "daily": {
      base.setUTCDate(base.getUTCDate() + rec.interval_count);
      return isoDate(base);
    }
    case "weekly": {
      base.setUTCDate(base.getUTCDate() + 7 * rec.interval_count);
      return isoDate(base);
    }
    case "monthly": {
      const targetDay = rec.day_of_month ?? base.getUTCDate();
      const year = base.getUTCFullYear();
      const monthIndex0 = base.getUTCMonth() + rec.interval_count;
      const normYear = year + Math.floor(monthIndex0 / 12);
      const normMonth0 = ((monthIndex0 % 12) + 12) % 12;
      const day = Math.min(targetDay, lastDayOfMonth(normYear, normMonth0));
      return isoDate(new Date(Date.UTC(normYear, normMonth0, day)));
    }
    case "yearly": {
      const targetDay = rec.day_of_month ?? base.getUTCDate();
      const year = base.getUTCFullYear() + rec.interval_count;
      const monthIndex0 = base.getUTCMonth();
      const day = Math.min(targetDay, lastDayOfMonth(year, monthIndex0));
      return isoDate(new Date(Date.UTC(year, monthIndex0, day)));
    }
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Gera todas as datas de ocorrência de `next_run_on` até `until` (inclusive),
 * respeitando `end_on` se houver. Usado para materializar meses "atrasados"
 * de uma vez (ex: usuário não abre o app por 2 meses).
 *
 * Proteção: limita a 36 ocorrências por chamada (evita loop indevido em caso
 * de configuração inválida, ex: interval_count zerado por bug futuro).
 */
export function occurrencesUntil(
  nextRunOn: string,
  until: string,
  rec: RecurrenceLike,
  endOn: string | null,
): string[] {
  // 'once' nunca chama computeNextRun — no máximo UMA ocorrência, a própria
  // next_run_on, se já chegou.
  if (rec.frequency === "once") {
    return nextRunOn <= until ? [nextRunOn] : [];
  }

  const out: string[] = [];
  let cursor = nextRunOn;
  const hardLimit = endOn && endOn < until ? endOn : until;

  let guard = 0;
  while (cursor <= hardLimit && guard < 36) {
    out.push(cursor);
    cursor = computeNextRun(cursor, rec);
    guard++;
  }
  return out;
}
