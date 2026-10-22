import { Logger } from '@nestjs/common';
import { ConversationStatus } from '../../generated/prisma/client';
import { SlaReconciliationService } from './sla-reconciliation.service';

// B-107 (D3, D5 e D6): a rodada da reconciliação — o que ela consulta, como
// conta e registra, quando para e que não se sobrepõe. O que acontece com cada
// conversa (refazer, manter, ignorar) fica no conversation.service.sla-sync.spec.
describe('SlaReconciliationService (B-107)', () => {
  const mockPrisma = { conversation: { findMany: jest.fn() } };
  const mockConversations = { reconcileSla: jest.fn() };
  let service: SlaReconciliationService;

  const candidates = (...ids: string[]) => ids.map((id) => ({ id }));

  beforeEach(() => {
    jest.clearAllMocks();
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    service = new SlaReconciliationService(mockPrisma as any, mockConversations as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('consulta só conversas com um ciclo aberto e prazo por vencer, de todas as empresas', async () => {
    mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

    await service.reconcile();

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: {
        // o status no topo deixa o Postgres usar o índice parcial das ativas
        status: { in: [ConversationStatus.WAITING, ConversationStatus.OPEN] },
        OR: [
          { status: ConversationStatus.WAITING, waitSlaDueAt: { not: null }, slaBreachedAt: null },
          { status: ConversationStatus.OPEN, serviceSlaDueAt: { not: null }, serviceSlaBreachedAt: null },
        ],
      },
      select: { id: true },
    });
  });

  it('confere cada conversa e registra o tempo, quantas avaliou e o que fez', async () => {
    mockPrisma.conversation.findMany.mockResolvedValueOnce(candidates('c1', 'c2', 'c3', 'c4'));
    mockConversations.reconcileSla
      .mockResolvedValueOnce('ok')
      .mockResolvedValueOnce('rescheduled')
      .mockResolvedValueOnce('skipped')
      .mockResolvedValueOnce('ok');

    const summary = await service.reconcile();

    expect(mockConversations.reconcileSla.mock.calls).toEqual([['c1'], ['c2'], ['c3'], ['c4']]);
    expect(summary).toMatchObject({ evaluated: 4, ok: 2, rescheduled: 1, skipped: 1, failed: 0, aborted: false });
    expect(summary.durationMs).toEqual(expect.any(Number));
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      expect.stringMatching(/4 conversa\(s\) avaliada\(s\) em \d+ ms .*2 em dia, 1 job\(s\) refeito\(s\).*0 erro/),
    );
  });

  it('erro numa conversa não para a rodada; o erro entra na contagem e no aviso', async () => {
    mockPrisma.conversation.findMany.mockResolvedValueOnce(candidates('c1', 'c2', 'c3'));
    mockConversations.reconcileSla
      .mockResolvedValueOnce('ok')
      .mockRejectedValueOnce(new Error('Command timed out'))
      .mockResolvedValueOnce('rescheduled');

    const summary = await service.reconcile();

    expect(summary).toMatchObject({ evaluated: 3, ok: 1, rescheduled: 1, failed: 1, aborted: false });
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('Último erro: Command timed out'));
  });

  it('3 falhas seguidas (Redis ou banco fora): interrompe a rodada e deixa para a próxima', async () => {
    mockPrisma.conversation.findMany.mockResolvedValueOnce(candidates('c1', 'c2', 'c3', 'c4', 'c5'));
    mockConversations.reconcileSla.mockRejectedValue(new Error('Command timed out'));

    const summary = await service.reconcile();

    expect(mockConversations.reconcileSla).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ evaluated: 5, failed: 3, aborted: true });
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('rodada interrompida'));
  });

  it('sem nada para conferir: só um registro de depuração', async () => {
    mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

    await expect(service.reconcile()).resolves.toMatchObject({ evaluated: 0, failed: 0 });

    expect(Logger.prototype.debug).toHaveBeenCalled();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  describe('sem sobreposição (D6)', () => {
    it('chamada no meio de uma rodada devolve a mesma rodada, sem consultar de novo', async () => {
      let release!: (rows: { id: string }[]) => void;
      mockPrisma.conversation.findMany.mockReturnValueOnce(new Promise((r) => (release = r)));

      const first = service.reconcile();
      const second = service.reconcile();
      release([]);

      expect(await first).toBe(await second);
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledTimes(1);
    });

    it('o agendamento pula o minuto (com aviso) se a rodada anterior ainda não terminou', async () => {
      let release!: (rows: { id: string }[]) => void;
      mockPrisma.conversation.findMany.mockReturnValueOnce(new Promise((r) => (release = r)));

      const running = service.reconcileOnSchedule();
      await service.reconcileOnSchedule();

      expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('esta foi pulada'));
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledTimes(1);
      release([]);
      await running;

      // terminada, a próxima roda normalmente
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);
      await service.reconcileOnSchedule();
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledTimes(2);
    });

    it('banco fora na consulta: o agendamento registra o erro e não derruba o processo', async () => {
      mockPrisma.conversation.findMany.mockRejectedValueOnce(new Error('connection refused'));

      await expect(service.reconcileOnSchedule()).resolves.toBeUndefined();

      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
      // a trava foi solta: a próxima rodada acontece
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);
      await service.reconcileOnSchedule();
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
