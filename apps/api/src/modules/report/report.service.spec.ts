import { Test, TestingModule } from '@nestjs/testing';
import { ReportService } from './report.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

const mockPrisma = {
  conversation: { findMany: jest.fn(), count: jest.fn() },
  tag: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
};

describe('ReportService (B-33)', () => {
  let service: ReportService;
  const companyA = 'company-a';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  describe('getAttendanceReport', () => {
    it('sempre filtra por companyId e período (createdAt)', async () => {
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getAttendanceReport(companyA, '2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z');

      const call = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe(companyA);
      expect(call.where.createdAt.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(call.where.createdAt.lte.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    });

    it('sem from/to, usa os últimos 30 dias terminando agora', async () => {
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);
      const before = Date.now();

      const result = await service.getAttendanceReport(companyA);

      const spanMs = result.period.to.getTime() - result.period.from.getTime();
      expect(spanMs).toBe(30 * 24 * 60 * 60 * 1000);
      expect(result.period.to.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('achata contato/agente/departamento/tags pro shape da linha', async () => {
      mockPrisma.conversation.findMany.mockResolvedValueOnce([
        {
          id: 'c1',
          channel: 'WHATSAPP',
          status: 'CLOSED',
          resolution: 'RESOLVED',
          createdAt: new Date('2026-01-10T10:00:00.000Z'),
          closedAt: new Date('2026-01-10T12:00:00.000Z'),
          contact: { name: 'Marina', phone: '5511999999999' },
          agent: { name: 'Ana' },
          department: { name: 'Comercial' },
          tags: [{ name: 'Entrega' }, { name: 'Prioridade' }],
        },
      ]);

      const result = await service.getAttendanceReport(companyA);

      expect(result.rows).toEqual([
        expect.objectContaining({
          contato: 'Marina',
          canal: 'WHATSAPP',
          atendente: 'Ana',
          departamento: 'Comercial',
          status: 'CLOSED',
          resolucao: 'Resolvido',
          tags: 'Entrega, Prioridade',
        }),
      ]);
    });

    it('usa telefone quando o contato não tem nome, e "—" quando não há agente/departamento/tags', async () => {
      mockPrisma.conversation.findMany.mockResolvedValueOnce([
        {
          id: 'c1',
          channel: 'WHATSAPP',
          status: 'WAITING',
          resolution: null,
          createdAt: new Date(),
          closedAt: null,
          contact: { name: null, phone: '5511999999999' },
          agent: null,
          department: null,
          tags: [],
        },
      ]);

      const result = await service.getAttendanceReport(companyA);

      expect(result.rows[0]).toEqual(
        expect.objectContaining({
          contato: '5511999999999',
          atendente: '—',
          departamento: '—',
          resolucao: '—',
          tags: '—',
        }),
      );
    });
  });

  describe('getByTagReport', () => {
    it('sempre filtra por companyId', async () => {
      mockPrisma.tag.findMany.mockResolvedValueOnce([]);

      await service.getByTagReport(companyA);

      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: companyA } }),
      );
    });

    it('esconde tag sem nenhuma conversa no período', async () => {
      mockPrisma.tag.findMany.mockResolvedValueOnce([{ id: 'tag-1', name: 'Entrega' }]);
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      const result = await service.getByTagReport(companyA);

      expect(result.rows).toHaveLength(0);
    });

    it('calcula total/resolvidas/não resolvidas e tempo médio de resolução por tag', async () => {
      mockPrisma.tag.findMany.mockResolvedValueOnce([{ id: 'tag-1', name: 'Entrega' }]);
      mockPrisma.conversation.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(3) // resolvidas
        .mockResolvedValueOnce(1); // não resolvidas
      mockPrisma.conversation.findMany.mockResolvedValueOnce([
        { createdAt: new Date('2026-01-01T10:00:00.000Z'), closedAt: new Date('2026-01-01T12:00:00.000Z') }, // 2h
        { createdAt: new Date('2026-01-02T10:00:00.000Z'), closedAt: new Date('2026-01-02T14:00:00.000Z') }, // 4h
      ]);

      const result = await service.getByTagReport(companyA);

      expect(result.rows).toEqual([
        { tag: 'Entrega', total: 5, resolvidas: 3, naoResolvidas: 1, tempoMedioResolucaoHoras: 3 },
      ]);
    });

    it('cada consulta de conversa filtra pela tag certa (tags.some)', async () => {
      mockPrisma.tag.findMany.mockResolvedValueOnce([{ id: 'tag-1', name: 'Entrega' }]);
      mockPrisma.conversation.count.mockResolvedValue(1);
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getByTagReport(companyA);

      const countCall = mockPrisma.conversation.count.mock.calls[0][0];
      expect(countCall.where.tags).toEqual({ some: { id: 'tag-1' } });
    });
  });

  describe('getByAgentReport', () => {
    it('sempre filtra por companyId e agente ativo', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      await service.getByAgentReport(companyA);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: companyA, isActive: true } }),
      );
    });

    it('esconde agente sem nenhuma atividade (nem no período, nem em aberto agora)', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'agent-1', name: 'Ana' }]);
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      const result = await service.getByAgentReport(companyA);

      expect(result.rows).toHaveLength(0);
    });

    it('"em aberto" reflete o estado ATUAL, não o período — consulta sem filtro de createdAt', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'agent-1', name: 'Ana' }]);
      mockPrisma.conversation.count.mockResolvedValue(0);
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      await service.getByAgentReport(companyA);

      // 4ª chamada de count() é a de "emAberto" (ver ordem no Promise.all do service)
      const emAbertoCall = mockPrisma.conversation.count.mock.calls[3][0];
      expect(emAbertoCall.where).toEqual({ companyId: companyA, agentId: 'agent-1', status: 'OPEN' });
      expect(emAbertoCall.where.createdAt).toBeUndefined();
    });

    it('mantém o agente na lista se ele só tem conversa em aberto (nenhuma no período)', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'agent-1', name: 'Ana' }]);
      mockPrisma.conversation.count
        .mockResolvedValueOnce(0) // atendidas (período)
        .mockResolvedValueOnce(0) // resolvidas
        .mockResolvedValueOnce(0) // não resolvidas
        .mockResolvedValueOnce(2); // em aberto (agora)
      mockPrisma.conversation.findMany.mockResolvedValueOnce([]);

      const result = await service.getByAgentReport(companyA);

      expect(result.rows).toEqual([
        expect.objectContaining({ atendente: 'Ana', atendidas: 0, emAberto: 2 }),
      ]);
    });
  });

  describe('exportadores (CSV/PDF)', () => {
    it('toAttendanceExportRows traduz as chaves pra cabeçalho em PT-BR e formata as datas', () => {
      const rows = service.toAttendanceExportRows([
        {
          contato: 'Marina',
          canal: 'WHATSAPP',
          atendente: 'Ana',
          departamento: 'Comercial',
          status: 'CLOSED',
          resolucao: 'Resolvido',
          tags: 'Entrega',
          criadaEm: new Date('2026-01-10T10:00:00.000Z'),
          encerradaEm: new Date('2026-01-10T12:00:00.000Z'),
        },
      ]);

      expect(Object.keys(rows[0])).toEqual([
        'Contato', 'Canal', 'Atendente', 'Departamento', 'Status', 'Resolução', 'Tags', 'Criada em', 'Encerrada em',
      ]);
      expect(rows[0]['Contato']).toBe('Marina');
    });

    it('toByTagExportRows formata tempo médio em horas/minutos e trata null como "—"', () => {
      const rows = service.toByTagExportRows([
        { tag: 'Entrega', total: 5, resolvidas: 3, naoResolvidas: 1, tempoMedioResolucaoHoras: 2.5 },
        { tag: 'Prioridade', total: 1, resolvidas: 0, naoResolvidas: 0, tempoMedioResolucaoHoras: null },
      ]);

      expect(rows[0]['Tempo médio de resolução']).toBe('2h 30min');
      expect(rows[1]['Tempo médio de resolução']).toBe('—');
    });

    it('toByAgentExportRows inclui todas as colunas esperadas', () => {
      const rows = service.toByAgentExportRows([
        { atendente: 'Ana', atendidas: 5, resolvidas: 3, naoResolvidas: 1, emAberto: 1, tempoMedioResolucaoHoras: 1 },
      ]);

      expect(rows[0]).toEqual({
        'Atendente': 'Ana',
        'Atendidas': '5',
        'Resolvidas': '3',
        'Não resolvidas': '1',
        'Em aberto': '1',
        'Tempo médio de resolução': '1h 0min',
      });
    });
  });
});
