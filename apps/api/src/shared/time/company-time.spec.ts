import {
  DEFAULT_TIME_ZONE,
  parsePeriodBoundary,
  resolveTimeZone,
  startOfDayInZone,
  zonedParts,
} from './company-time';

const SP = 'America/Sao_Paulo';

describe('company-time (M-04/B-61)', () => {
  it('22h30 em São Paulo ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC', () => {
    const instant = new Date('2026-10-18T01:30:00Z'); // 22:30 de 17/10 em SP (UTC-3)
    expect(zonedParts(instant, SP)).toMatchObject({ year: 2026, month: 10, day: 17, hour: 22, minute: 30, weekday: 'sat' });
  });

  it('início do dia em São Paulo é 03:00 UTC', () => {
    const instant = new Date('2026-10-18T01:30:00Z');
    expect(startOfDayInZone(instant, SP).toISOString()).toBe('2026-10-17T03:00:00.000Z');
  });

  it('data sem hora: início e FIM do dia no fuso (o fim incluía só até 00:00 UTC antes)', () => {
    expect(parsePeriodBoundary('2026-10-17', SP, 'start').toISOString()).toBe('2026-10-17T03:00:00.000Z');
    expect(parsePeriodBoundary('2026-10-17', SP, 'end').toISOString()).toBe('2026-10-18T02:59:59.999Z');
  });

  it('data com hora (ISO completo) é respeitada como veio', () => {
    expect(parsePeriodBoundary('2026-10-17T12:00:00Z', SP, 'end').toISOString()).toBe('2026-10-17T12:00:00.000Z');
  });

  it('funciona em outros fusos (ex.: Manaus, UTC-4)', () => {
    expect(startOfDayInZone(new Date('2026-10-17T15:00:00Z'), 'America/Manaus').toISOString()).toBe(
      '2026-10-17T04:00:00.000Z',
    );
  });

  it('fuso inválido ou vazio cai no padrão, sem derrubar a requisição', () => {
    expect(resolveTimeZone('Fuso/Inexistente')).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone('Europe/Lisbon')).toBe('Europe/Lisbon');
  });
});
