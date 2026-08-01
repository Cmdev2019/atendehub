import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { ConversationStatus, Prisma } from '@prisma/client';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`companyId`,`contactId`)',
    { code: 'P2002', clientVersion: '5.22.0' },
  );
}

// B-49: findFirst()+create() em ConversationService#upsertFromWebhook não era
// atômico — dois workers processando duas mensagens do MESMO contato quase
// ao mesmo tempo liam "não existe" antes de qualquer create terminar, e
// nasciam 2 conversas WAITING pro mesmo contato. Agora o create() é
// protegido pelo índice único PARCIAL do Postgres
// (conversations_active_per_contact_key, WHERE status IN (WAITING,OPEN)) e
// P2002 é tratado como "outro processo venceu a corrida" — busca a conversa
// vencedora e devolve isNew=false, nunca duplica.
describe('ConversationService#upsertFromWebhook — idempotência (B-49)', () => {
  let service: ConversationService;
  const companyId = 'company-1';
  const contactId = 'contact-1';

  const mockPrisma = {
    conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    queue: { findFirst: jest.fn() },
  };
  const mockEvents = { emitConversationAssigned: jest.fn(), emitConversationUpdated: jest.fn() };
  const mockAuditLog = { record: jest.fn() };
  const mockNotificationService = { create: jest.fn() };
  const mockSlaQueue = { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSlaQueue.getJob.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEvents },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: getQueueToken(QUEUE_NAMES.SLA_CHECK), useValue: mockSlaQueue },
      ],
    }).compile();

    service = module.get(ConversationService);
  });

  it('conversa ativa já existe com a mesma conexão — devolve ela, isNew=false, sem tentar create', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValueOnce({
      id: 'conv-1',
      whatsappConnectionId: 'wa-conn-1',
      status: ConversationStatus.OPEN,
    });

    const result = await service.upsertFromWebhook(companyId, contactId, 'wa-conn-1');

    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversation: { id: 'conv-1', whatsappConnectionId: 'wa-conn-1', status: ConversationStatus.OPEN },
      isNew: false,
      queue: null,
    });
  });

  it('conversa ativa já existe mas com conexão desatualizada — reaponta via update', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValueOnce({
      id: 'conv-1',
      whatsappConnectionId: 'wa-conn-velha',
      status: ConversationStatus.WAITING,
    });
    mockPrisma.conversation.update.mockResolvedValueOnce({
      id: 'conv-1',
      whatsappConnectionId: 'wa-conn-nova',
    });

    const result = await service.upsertFromWebhook(companyId, contactId, 'wa-conn-nova');

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { whatsappConnectionId: 'wa-conn-nova' },
    });
    expect(result.isNew).toBe(false);
    expect(result.conversation.whatsappConnectionId).toBe('wa-conn-nova');
  });

  it('sob corrida (P2002 no create), busca a conversa vencedora e devolve isNew=false — sem duplicar', async () => {
    mockPrisma.conversation.findFirst
      .mockResolvedValueOnce(null) // 1ª leitura: não existe ainda
      .mockResolvedValueOnce({
        // 2ª leitura, dentro do catch: outro worker já criou
        id: 'conv-vencedora',
        whatsappConnectionId: 'wa-conn-1',
        status: ConversationStatus.WAITING,
      });
    mockPrisma.conversation.create.mockRejectedValueOnce(p2002());

    const result = await service.upsertFromWebhook(companyId, contactId, 'wa-conn-1');

    expect(mockPrisma.conversation.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversation: { id: 'conv-vencedora', whatsappConnectionId: 'wa-conn-1', status: ConversationStatus.WAITING },
      isNew: false,
      queue: null,
    });
  });

  it('sob corrida (P2002), se a conversa vencedora está numa conexão diferente, reaponta antes de devolver', async () => {
    mockPrisma.conversation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-vencedora',
        whatsappConnectionId: 'wa-conn-velha',
        status: ConversationStatus.WAITING,
      });
    mockPrisma.conversation.create.mockRejectedValueOnce(p2002());
    mockPrisma.conversation.update.mockResolvedValueOnce({
      id: 'conv-vencedora',
      whatsappConnectionId: 'wa-conn-nova',
    });

    const result = await service.upsertFromWebhook(companyId, contactId, 'wa-conn-nova');

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-vencedora' },
      data: { whatsappConnectionId: 'wa-conn-nova' },
    });
    expect(result.isNew).toBe(false);
  });

  it('propaga qualquer outro erro do create (não é P2002) sem tentar buscar nada de novo', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
    mockPrisma.conversation.create.mockRejectedValueOnce(new Error('conexão com o banco caiu'));

    await expect(service.upsertFromWebhook(companyId, contactId, 'wa-conn-1')).rejects.toThrow(
      'conexão com o banco caiu',
    );
    expect(mockPrisma.conversation.findFirst).toHaveBeenCalledTimes(1);
  });

  it('cria normalmente quando não há corrida nenhuma (caminho feliz, sem departamento)', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);
    mockPrisma.conversation.create.mockResolvedValueOnce({
      id: 'conv-novo',
      companyId,
      status: ConversationStatus.WAITING,
    });

    const result = await service.upsertFromWebhook(companyId, contactId, 'wa-conn-1');

    expect(result.isNew).toBe(true);
    expect(result.conversation.id).toBe('conv-novo');
  });
});
