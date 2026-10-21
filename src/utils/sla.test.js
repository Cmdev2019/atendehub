import { slaLabel, slaState } from './sla';

// B-68: o estado do prazo que a fila e o atendimento mostram
describe('slaState / slaLabel (B-68)', () => {
  const now = Date.parse('2026-10-21T13:00:00Z');
  const at = (offsetMs) => new Date(now + offsetMs).toISOString();

  it('sem prazo (setor sem SLA): nada a mostrar', () => {
    expect(slaState(at(-60_000), null, now)).toBeNull();
    expect(slaLabel(null)).toBe('');
  });

  it('longe do fim: ok, com quanto falta', () => {
    // SLA de 30 min, começou há 10
    const state = slaState(at(-10 * 60_000), at(20 * 60_000), now);
    expect(state.level).toBe('ok');
    expect(slaLabel(state)).toBe('estoura em 20 min');
  });

  it('no último quinto do prazo: perto de estourar', () => {
    // SLA de 30 min, faltam 5 (o aviso começa a 6 min do fim)
    expect(slaState(at(-25 * 60_000), at(5 * 60_000), now).level).toBe('warning');
  });

  it('prazo curto: avisa pelo menos no último minuto', () => {
    // SLA de 2 min, faltam 50 s (um quinto seria 24 s)
    const state = slaState(at(-70_000), at(50_000), now);
    expect(state.level).toBe('warning');
    expect(slaLabel(state)).toBe('estoura em menos de 1 min');
  });

  it('passou do prazo: estourado, com há quanto tempo', () => {
    const state = slaState(at(-12 * 60_000), at(-7 * 60_000), now);
    expect(state.level).toBe('breached');
    expect(slaLabel(state)).toBe('estourou há 7 min');
  });

  it('marcado como estourado pela API: estourado, mesmo com o relógio local atrasado', () => {
    expect(slaState(at(-60_000), at(30_000), now, at(-1000)).level).toBe('breached');
  });

  it('prazo longe (fora do expediente): horas e dias', () => {
    expect(slaLabel(slaState(at(0), at(80 * 60_000), now))).toBe('estoura em 1 h 20 min');
    expect(slaLabel(slaState(at(0), at(50 * 3_600_000), now))).toBe('estoura em 2 d');
  });
});
