import { Weekday, zonedParts, zonedTimeToUtc } from './company-time';

export type BusinessHours = Record<string, { start: string; end: string }[]>;

// Horário de parede no fuso da EMPRESA (M-04/B-61) — antes usava o fuso do
// servidor (UTC no Docker) e o expediente ficava deslocado em 3 horas no
// Brasil. `businessHours` ausente = sempre "dentro do expediente" (não
// bloqueia quem nunca configurou horário nenhum). B-98: extraída da engine do
// auto-atendimento para o SLA usar a mesma regra.
export function isWithinBusinessHours(hours: BusinessHours | null, now: Date, timeZone: string): boolean {
  if (!hours) return true;

  const local = zonedParts(now, timeZone);
  const ranges = hours[local.weekday];
  if (!ranges || ranges.length === 0) return false;

  const nowMinutes = local.hour * 60 + local.minute;
  return ranges.some((range) => {
    const [startH, startM] = range.start.split(':').map(Number);
    const [endH, endM] = range.end.split(':').map(Number);
    return nowMinutes >= startH * 60 + startM && nowMinutes < endH * 60 + endM;
  });
}

// Na ordem do getUTCDay(): 0 = domingo
const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Até onde procurar o expediente que completa o prazo: um expediente que
// quase nunca abre não deixa o cálculo rodando sem fim
const MAX_DAYS_AHEAD = 731;

/**
 * B-112 (ADR-0019, regra 17) — o relógio do SLA só anda no expediente, no
 * fuso da empresa. Devolve o instante em que `seconds` de expediente se
 * completam a partir de `start`: quem chega fora do expediente começa a
 * contar na abertura, e a espera que atravessa o fechamento continua na
 * abertura seguinte. Sem horário configurado (`hours` null), o relógio anda
 * o dia todo. Expediente que nunca abre: null, sem prazo.
 */
export function addBusinessTime(
  start: Date,
  seconds: number,
  hours: BusinessHours | null,
  timeZone: string,
): Date | null {
  if (!hours) return new Date(start.getTime() + seconds * 1000);
  if (!Object.values(hours).some((ranges) => ranges?.length)) return null;

  let remaining = seconds * 1000;
  const first = zonedParts(start, timeZone);
  for (let offset = 0; offset < MAX_DAYS_AHEAD; offset++) {
    // Dia de parede `offset` dias depois do início (o Date.UTC vira o mês)
    const day = new Date(Date.UTC(first.year, first.month - 1, first.day + offset));
    for (const [open, close] of openIntervals(hours[WEEKDAYS[day.getUTCDay()]], day, timeZone)) {
      const from = Math.max(open, start.getTime());
      if (from >= close) continue;
      if (remaining <= close - from) return new Date(from + remaining);
      remaining -= close - from;
    }
  }
  return null;
}

// Faixas do dia como instantes (ms), em ordem e sem sobreposição. O
// validador do B-99 não impede faixas que se cruzam, e o trecho em comum
// conta uma vez só.
function openIntervals(
  ranges: { start: string; end: string }[] | undefined,
  day: Date,
  timeZone: string,
): [number, number][] {
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return zonedTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, m, 0, 0, timeZone).getTime();
  };
  const sorted = (ranges ?? [])
    .map((range): [number, number] => [at(range.start), at(range.end)])
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [open, close] of sorted) {
    const last = merged[merged.length - 1];
    if (last && open <= last[1]) last[1] = Math.max(last[1], close);
    else merged.push([open, close]);
  }
  return merged;
}
