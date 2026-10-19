import { EventsService } from './events.service';

// B-65 (ADR-0019): o estado do atendente vai para quem vê a empresa inteira
// (ADMIN/SUPERVISOR) e para as outras abas do próprio usuário — nunca para os
// colegas atendentes.
describe('EventsService — user.availability (B-65)', () => {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const service = new EventsService({ server: { to } } as any, {} as any, {} as any);

  beforeEach(() => jest.clearAllMocks());

  it('emite para a sala da empresa inteira e para a sala do próprio usuário', () => {
    const payload = {
      companyId: 'company-a',
      userId: 'user-1',
      availability: 'ONLINE' as const,
      changedAt: new Date('2026-10-19T10:00:00Z'),
    };

    service.emitUserAvailability(payload);

    expect(to).toHaveBeenCalledWith(['company:company-a:all', 'agent:user-1']);
    expect(emit).toHaveBeenCalledWith('user.availability', payload);
  });
});
