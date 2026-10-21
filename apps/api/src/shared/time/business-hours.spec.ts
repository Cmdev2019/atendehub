import { addBusinessTime, BusinessHours, isWithinBusinessHours } from './business-hours';

const SP = 'America/Sao_Paulo'; // UTC-3, sem horário de verão
const FIVE_MIN = 300;

// Segunda a sexta, 08:00–12:00 e 13:00–18:00 (almoço fechado)
const WEEKDAYS_WITH_LUNCH: BusinessHours = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri'].map((day) => [
    day,
    [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '18:00' },
    ],
  ]),
);

// Outubro de 2026: 19 é segunda, 23 é sexta, 24 é sábado, 26 é segunda.
// Horários de parede em São Paulo, convertidos para UTC (+3 h).
const at = (iso: string) => new Date(iso);
const due = (start: string, seconds: number, hours: BusinessHours | null = WEEKDAYS_WITH_LUNCH, tz = SP) =>
  addBusinessTime(at(start), seconds, hours, tz)?.toISOString() ?? null;

describe('addBusinessTime — relógio do SLA no expediente (B-112)', () => {
  it('sem horário configurado, o relógio anda o dia todo', () => {
    // terça 23:00 em São Paulo
    expect(due('2026-10-21T02:00:00Z', FIVE_MIN, null)).toBe('2026-10-21T02:05:00.000Z');
  });

  it('dentro do expediente, o prazo cabe no mesmo trecho', () => {
    // terça 10:00 → 10:05
    expect(due('2026-10-20T13:00:00Z', FIVE_MIN)).toBe('2026-10-20T13:05:00.000Z');
  });

  it('chegou antes de abrir: conta a partir da abertura', () => {
    // terça 07:00 → 08:05
    expect(due('2026-10-20T10:00:00Z', FIVE_MIN)).toBe('2026-10-20T11:05:00.000Z');
  });

  it('chegou depois de fechar: conta a partir da abertura do dia seguinte', () => {
    // terça 20:00 → quarta 08:05
    expect(due('2026-10-20T23:00:00Z', FIVE_MIN)).toBe('2026-10-21T11:05:00.000Z');
  });

  it('a espera que atravessa o fechamento continua na abertura seguinte', () => {
    // terça 17:58: 2 min na terça + 3 min na quarta → quarta 08:03
    expect(due('2026-10-20T20:58:00Z', FIVE_MIN)).toBe('2026-10-21T11:03:00.000Z');
  });

  it('o almoço também para o relógio', () => {
    // terça 11:58: 2 min antes do almoço + 3 min depois → 13:03
    expect(due('2026-10-20T14:58:00Z', FIVE_MIN)).toBe('2026-10-20T16:03:00.000Z');
  });

  it('fim de semana: a espera de sexta no fim do dia continua na segunda', () => {
    // sexta 17:58 → segunda 08:03
    expect(due('2026-10-23T20:58:00Z', FIVE_MIN)).toBe('2026-10-26T11:03:00.000Z');
  });

  it('chegou no sábado: conta da abertura de segunda', () => {
    // sábado 10:00 → segunda 08:05
    expect(due('2026-10-24T13:00:00Z', FIVE_MIN)).toBe('2026-10-26T11:05:00.000Z');
  });

  it('prazo maior que um dia de expediente atravessa para o dia seguinte', () => {
    // segunda 08:00 + 10 h de expediente: 9 h na segunda + 1 h na terça → terça 09:00
    expect(due('2026-10-19T11:00:00Z', 10 * 3600)).toBe('2026-10-20T12:00:00.000Z');
  });

  it('prazo que termina exatamente no fechamento', () => {
    // terça 17:55 → 18:00
    expect(due('2026-10-20T20:55:00Z', FIVE_MIN)).toBe('2026-10-20T21:00:00.000Z');
  });

  it('o expediente vale no fuso da empresa', () => {
    const hours: BusinessHours = { tue: [{ start: '08:00', end: '18:00' }] };
    // 11:00 UTC de terça: 08:00 em São Paulo (aberto) e 07:00 em Manaus (fechado até 12:00 UTC)
    expect(due('2026-10-20T11:00:00Z', FIVE_MIN, hours, SP)).toBe('2026-10-20T11:05:00.000Z');
    expect(due('2026-10-20T11:00:00Z', FIVE_MIN, hours, 'America/Manaus')).toBe('2026-10-20T12:05:00.000Z');
  });

  it('faixas que se cruzam contam o trecho em comum uma vez só', () => {
    const hours: BusinessHours = {
      tue: [
        { start: '08:00', end: '12:00' },
        { start: '11:00', end: '14:00' },
      ],
    };
    // terça 11:58: segue aberto até 14:00 → 12:03 (somando duas vezes daria 12:01)
    expect(due('2026-10-20T14:58:00Z', FIVE_MIN, hours)).toBe('2026-10-20T15:03:00.000Z');
  });

  it('expediente que nunca abre: sem prazo', () => {
    expect(due('2026-10-20T13:00:00Z', FIVE_MIN, {})).toBeNull();
    expect(due('2026-10-20T13:00:00Z', FIVE_MIN, { mon: [] })).toBeNull();
  });

  it('concorda com isWithinBusinessHours: dentro do expediente, o relógio já está andando', () => {
    const start = at('2026-10-22T19:30:00Z'); // quinta 16:30
    expect(isWithinBusinessHours(WEEKDAYS_WITH_LUNCH, start, SP)).toBe(true);
    expect(addBusinessTime(start, 60, WEEKDAYS_WITH_LUNCH, SP)!.getTime() - start.getTime()).toBe(60_000);
  });
});
