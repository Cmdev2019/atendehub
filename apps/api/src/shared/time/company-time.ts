/**
 * M-04/B-61 — datas no fuso da empresa, sem depender do fuso do servidor.
 *
 * O container roda em UTC. Usar `getHours()`, `setHours(0,0,0,0)` ou
 * `new Date('AAAA-MM-DD')` dava o horário de UTC: no Brasil, o expediente do
 * auto-atendimento ficava deslocado em 3 horas, "resolvidas hoje" virava às
 * 21h, e o último dia dos relatórios ficava de fora. Tudo aqui usa o Intl do
 * próprio Node (ICU completo), sem biblioteca extra.
 */

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

// Mesmas chaves de `businessHours` do auto-atendimento
export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: Weekday;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Fuso válido para o Intl? (evita derrubar a requisição com um valor ruim no banco) */
export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

/** Data/hora de parede no fuso informado. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(
    formatterFor(timeZone).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: String(parts.weekday).toLowerCase().slice(0, 3) as Weekday,
  };
}

// Diferença (ms) entre o horário de parede no fuso e o UTC naquele instante.
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const seconds = date.getUTCSeconds();
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, seconds, date.getUTCMilliseconds());
  return asUtc - date.getTime();
}

/** Instante UTC correspondente a um horário de parede no fuso. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  // Duas passadas resolvem o offset certo inclusive perto de troca de horário de verão
  let result = guess - offsetMs(new Date(guess), timeZone);
  result = guess - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** 00:00 de hoje (do dia de `date`) no fuso informado. */
export function startOfDayInZone(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, 0, 0, timeZone);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converte o limite de um período vindo da API. Data sem hora (`AAAA-MM-DD`,
 * o que o seletor de data do front manda) vira o começo do dia — ou o FIM
 * dele, para o limite final, que antes cortava o último dia inteiro. Data
 * com hora (ISO completo) é respeitada como veio.
 */
export function parsePeriodBoundary(
  value: string,
  timeZone: string,
  edge: 'start' | 'end',
): Date {
  const m = DATE_ONLY.exec(value);
  if (!m) return new Date(value);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return edge === 'start'
    ? zonedTimeToUtc(y, mo, d, 0, 0, 0, 0, timeZone)
    : zonedTimeToUtc(y, mo, d, 23, 59, 59, 999, timeZone);
}

/** Fuso configurado da empresa (cai no padrão se ausente ou inválido). */
export async function loadCompanyTimeZone(
  prisma: { company: { findUnique: (args: any) => Promise<{ timezone: string } | null> } },
  companyId: string,
): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return resolveTimeZone(company?.timezone);
}
