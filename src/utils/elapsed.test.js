import { formatElapsed } from './elapsed';

describe('formatElapsed (B-104)', () => {
  const now = new Date('2026-10-18T12:00:00Z').getTime();
  it.each([
    ['2026-10-18T11:59:40Z', 'agora'],
    ['2026-10-18T11:48:00Z', '12 min'],
    ['2026-10-18T09:00:00Z', '3 h'],
    ['2026-10-16T11:00:00Z', '2 d'],
  ])('%s → %s', (date, expected) => {
    expect(formatElapsed(date, now)).toBe(expected);
  });

  it('data ausente ou inválida → vazio', () => {
    expect(formatElapsed(null, now)).toBe('');
    expect(formatElapsed('lixo', now)).toBe('');
  });
});
