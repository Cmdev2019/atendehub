import { registerDecorator, ValidationOptions } from 'class-validator';

const WEEKDAYS = new Set(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// B-99 (L-11): `businessHours` era um objeto livre — um JSON malformado
// (dia com nome errado, hora "9h", início depois do fim) desligava o
// auto-atendimento sem aviso, porque nenhum intervalo casava. Formato:
// { mon: [{ start: "09:00", end: "18:00" }], ... }; dia ausente = fechado.
export function isValidBusinessHours(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([day, ranges]) =>
      WEEKDAYS.has(day) &&
      Array.isArray(ranges) &&
      ranges.length <= 10 &&
      ranges.every(
        (r) =>
          r !== null &&
          typeof r === 'object' &&
          HHMM.test((r as { start?: unknown }).start as string) &&
          HHMM.test((r as { end?: unknown }).end as string) &&
          (r as { start: string }).start < (r as { end: string }).end,
      ),
  );
}

export function IsBusinessHours(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isBusinessHours',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'businessHours inválido: use { mon: [{ start: "09:00", end: "18:00" }], ... } (dias sun–sat, HH:MM, início antes do fim)',
        ...options,
      },
      validator: { validate: (value: unknown) => isValidBusinessHours(value) },
    });
}
