import { zonedParts } from './company-time';

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
