import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MessageType, Role, ConversationStatus, SenderType, MessageStatus } from '@prisma/client';
import { SendMessageService } from './send-message.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';
import { EvolutionService } from '../whatsapp/evolution.service';
import { EventsService } from '../events/events.service';

// B4-5: envio de mensagem é síncrono (decisão B2-1 — sem fila/retry, a
// própria requisição HTTP espera a Evolution confirmar). Isolamento
// multi-tenant, permissões de quem pode enviar e o que acontece quando a
// Evolution falha são o que mais importa aqui — não há um processor por trás
// para "consertar" um erro silenciosamente.
describe('SendMessageService', () => {
  let service: SendMessageService;

  const mockPrisma = {
    conversation: { findFirst: jest.fn(), update: jest.fn() },
    message: { create: jest.fn() },
    attachment: { create: jest.fn() },
  };
  const mockStorage = { upload: jest.fn() };
  const mockEvolution = { sendTextMessage: jest.fn(), sendMediaMessage: jest.fn() };
  const mockEvents = { emitNewMessage: jest.fn(), emitMessageUpdated: jest.fn() };

  const companyId = 'company-1';
  const conversationId = 'conv-1';
  const senderId = 'user-1';

  const baseConversation = {
    id: conversationId,
    status: ConversationStatus.OPEN,
    agentId: senderId,
    companyId,
    contact: { id: 'contact-1', phone: '5512999999999', isBlocked: false },
    whatsapp: { id: 'wa-1', sessionName: 'session-1', status: 'CONNECTED' },
  };

  const textDto = { type: MessageType.TEXT, content: 'Olá!' } as any;

  beforeEach(async () => {
    // resetAllMocks (não só clearAllMocks): vários testes deste arquivo
    // lançam exceção antes de consumir todo mockResolvedValueOnce/
    // mockRejectedValueOnce enfileirado — clearAllMocks não esvazia essa
    // fila, e o valor sobrando vaza para o próximo teste que chamar o mesmo
    // mock (foi exatamente isso que aconteceu na 1ª versão deste arquivo).
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendMessageService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: EvolutionService, useValue: mockEvolution },
        { provide: EventsService, useValue: mockEvents },
      ],
    }).compile();

    service = module.get(SendMessageService);
  });

  describe('validações de prepareSend (compartilhadas)', () => {
    it('lança NotFoundException quando a conversa não existe (cobre também isolamento multi-tenant — findFirst já filtra por companyId)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.send(companyId, conversationId, senderId, Role.AGENT, textDto),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: conversationId, companyId } }),
      );
      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
    });

    it('rejeita envio para conversa encerrada (CLOSED)', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...baseConversation,
        status: ConversationStatus.CLOSED,
      });

      await expect(
        service.send(companyId, conversationId, senderId, Role.AGENT, textDto),
      ).rejects.toThrow(BadRequestException);
      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
    });

    it('rejeita envio para contato bloqueado', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...baseConversation,
        contact: { ...baseConversation.contact, isBlocked: true },
      });

      await expect(
        service.send(companyId, conversationId, senderId, Role.AGENT, textDto),
      ).rejects.toThrow(BadRequestException);
      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
    });

    it('rejeita AGENT que não está atribuído à conversa', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...baseConversation,
        agentId: 'outro-agente',
      });

      await expect(
        service.send(companyId, conversationId, senderId, Role.AGENT, textDto),
      ).rejects.toThrow(ForbiddenException);
      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
    });

    it.each([Role.ADMIN, Role.SUPERVISOR, Role.SUPER_ADMIN])(
      '%s pode enviar mesmo sem estar atribuído à conversa',
      async (role) => {
        mockPrisma.conversation.findFirst.mockResolvedValueOnce({
          ...baseConversation,
          agentId: 'outro-agente',
        });
        mockEvolution.sendTextMessage.mockResolvedValueOnce({ key: { id: 'wa-msg-1' } });
        mockPrisma.message.create.mockResolvedValueOnce({
          id: 'msg-1',
          senderType: SenderType.AGENT,
          content: 'Olá!',
          type: MessageType.TEXT,
          status: MessageStatus.SENT,
          sentAt: new Date(),
          externalId: 'wa-msg-1',
        });
        mockPrisma.conversation.update.mockResolvedValueOnce({});

        await expect(
          service.send(companyId, conversationId, senderId, role, textDto),
        ).resolves.toBeDefined();
      },
    );

    it('rejeita quando a conversa não tem conexão WhatsApp associada', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...baseConversation,
        whatsapp: null,
      });

      await expect(
        service.send(companyId, conversationId, senderId, Role.AGENT, textDto),
      ).rejects.toThrow(BadRequestException);
      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
    });

    it('rejeita quando a conexão WhatsApp não está CONNECTED', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...baseConversation,
        whatsapp: { ...baseConversation.whatsapp, status: 'DISCONNECTED' },
      });

      await expect(
        service.send(companyId, conversationId, senderId, Role.AGENT, textDto),
      ).rejects.toThrow(BadRequestException);
      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
    });
  });

  describe('envio de texto — caminho feliz', () => {
    beforeEach(() => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ ...baseConversation });
    });

    it('envia via Evolution, persiste no banco com status SENT e emite message.new', async () => {
      mockEvolution.sendTextMessage.mockResolvedValueOnce({ key: { id: 'wa-msg-1' } });
      mockPrisma.message.create.mockResolvedValueOnce({
        id: 'msg-1',
        senderType: SenderType.AGENT,
        content: 'Olá!',
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        sentAt: new Date(),
        externalId: 'wa-msg-1',
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({});

      const result = await service.send(companyId, conversationId, senderId, Role.AGENT, textDto);

      expect(mockEvolution.sendTextMessage).toHaveBeenCalledWith(
        'session-1',
        '5512999999999',
        'Olá!',
      );
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId,
            senderId,
            senderType: SenderType.AGENT,
            content: 'Olá!',
            status: MessageStatus.SENT,
            externalId: 'wa-msg-1',
          }),
        }),
      );
      expect(mockEvents.emitNewMessage).toHaveBeenCalledWith(
        expect.objectContaining({ companyId, conversationId }),
      );
      expect(result.id).toBe('msg-1');
    });

    it('conversa em WAITING (sem agente ainda) vira OPEN e ganha o remetente como agente — SUPERVISOR assumindo da fila', async () => {
      mockPrisma.conversation.findFirst.mockReset();
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({
        ...baseConversation,
        status: ConversationStatus.WAITING,
        agentId: null, // ninguém atribuído ainda — só ADMIN/SUPERVISOR pode enviar direto (canSend)
      });
      mockEvolution.sendTextMessage.mockResolvedValueOnce({ key: { id: 'wa-msg-1' } });
      mockPrisma.message.create.mockResolvedValueOnce({
        id: 'msg-1',
        senderType: SenderType.AGENT,
        content: 'Olá!',
        type: MessageType.TEXT,
        status: MessageStatus.SENT,
        sentAt: new Date(),
        externalId: 'wa-msg-1',
      });
      mockPrisma.conversation.update.mockResolvedValueOnce({});

      await service.send(companyId, conversationId, senderId, Role.SUPERVISOR, textDto);

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: expect.objectContaining({
            status: ConversationStatus.OPEN,
            agentId: senderId,
          }),
        }),
      );
    });
  });

  describe('falha da Evolution API', () => {
    it('propaga como BadRequestException e NÃO persiste mensagem no banco', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ ...baseConversation });
      mockEvolution.sendTextMessage.mockRejectedValueOnce(new Error('Instância desconectada'));

      await expect(
        service.send(companyId, conversationId, senderId, Role.AGENT, textDto),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockEvents.emitNewMessage).not.toHaveBeenCalled();
    });
  });
});
