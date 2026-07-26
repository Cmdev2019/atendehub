import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { AutoAttendanceAction, ConversationResolution, ConversationStatus } from '@prisma/client';
import { AutoAttendanceEngineService } from './auto-attendance-engine.service';
import { AutoAttendanceSessionService } from './auto-attendance-session.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EvolutionService } from '../whatsapp/evolution.service';
import { ConversationService } from '../conversation/conversation.service';
import { EventsService } from '../events/events.service';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

const mockPrisma = {
  autoAttendanceFlow: { findUnique: jest.fn() },
  message: { create: jest.fn() },
  conversation: { findUnique: jest.fn() },
};
const mockEvolution = { sendTextMessage: jest.fn().mockResolvedValue({}) };
const mockConversationService = {
  updateLastMessage: jest.fn(),
  updateStatus: jest.fn(),
  routeAutoAttendance: jest.fn(),
};
const mockEvents = { emitNewMessage: jest.fn() };
const mockSession = {
  setAwaitingMenuReply: jest.fn(),
  isAwaitingMenuReply: jest.fn(),
  clear: jest.fn(),
};
const fakeJob = { remove: jest.fn().mockResolvedValue(undefined) };
const mockInactivityQueue = { add: jest.fn(), getJob: jest.fn() };

describe('AutoAttendanceEngineService', () => {
  let service: AutoAttendanceEngineService;
  const companyId = 'company-1';
  const conversationId = 'conv-1';
  const sessionName = 'session-1';
  const contactPhone = '5511999999999';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockInactivityQueue.getJob.mockResolvedValue(null);
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-bot-1', sentAt: new Date(), status: 'SENT' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoAttendanceEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EvolutionService, useValue: mockEvolution },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: EventsService, useValue: mockEvents },
        { provide: AutoAttendanceSessionService, useValue: mockSession },
        { provide: getQueueToken(QUEUE_NAMES.AUTO_ATTENDANCE_INACTIVITY), useValue: mockInactivityQueue },
      ],
    }).compile();

    service = module.get<AutoAttendanceEngineService>(AutoAttendanceEngineService);
  });

  describe('handleNewConversation', () => {
    it('não faz nada quando não há flow configurado para a empresa', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce(null);

      await service.handleNewConversation({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        queueGreetingMsg: null,
      });

      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
    });

    it('não faz nada quando o flow existe mas está desativado', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({ isActive: false });

      await service.handleNewConversation({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        queueGreetingMsg: null,
      });

      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
    });

    it('envia a saudação da FILA de preferência à da empresa quando as duas existem', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        isActive: true,
        greetingMessage: 'Saudação da empresa',
        businessHours: null,
        menuOptions: [],
      });

      await service.handleNewConversation({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        queueGreetingMsg: 'Saudação da fila',
      });

      expect(mockEvolution.sendTextMessage).toHaveBeenCalledWith(sessionName, contactPhone, 'Saudação da fila');
    });

    it('fora do horário de atendimento, envia só a mensagem de fora do expediente (sem saudação/menu)', async () => {
      const sunday = new Date('2026-08-02T10:00:00'); // domingo
      jest.useFakeTimers().setSystemTime(sunday);

      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        isActive: true,
        greetingMessage: 'Saudação',
        businessHours: { mon: [{ start: '09:00', end: '18:00' }] }, // domingo ausente = fechado
        outOfHoursMessage: 'Estamos fora do horário',
        menuOptions: [{ id: 'opt-1', order: 1, label: 'Suporte' }],
      });

      await service.handleNewConversation({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        queueGreetingMsg: null,
      });

      expect(mockEvolution.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(mockEvolution.sendTextMessage).toHaveBeenCalledWith(
        sessionName,
        contactPhone,
        'Estamos fora do horário',
      );
      expect(mockSession.setAwaitingMenuReply).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('com menu configurado, envia saudação + menu, marca sessão e agenda o timeout de inatividade', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        isActive: true,
        greetingMessage: 'Olá!',
        businessHours: null,
        inactivityTimeoutSecs: 120,
        menuOptions: [
          { id: 'opt-1', order: 1, label: 'Suporte' },
          { id: 'opt-2', order: 2, label: 'Financeiro' },
        ],
      });

      await service.handleNewConversation({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        queueGreetingMsg: null,
      });

      expect(mockEvolution.sendTextMessage).toHaveBeenNthCalledWith(1, sessionName, contactPhone, 'Olá!');
      expect(mockEvolution.sendTextMessage).toHaveBeenNthCalledWith(
        2,
        sessionName,
        contactPhone,
        '1 - Suporte\n2 - Financeiro',
      );
      expect(mockSession.setAwaitingMenuReply).toHaveBeenCalledWith(conversationId);
      expect(mockInactivityQueue.add).toHaveBeenCalledWith(
        { conversationId, companyId },
        { jobId: `auto-attendance-inactivity:${conversationId}`, delay: 120_000 },
      );
    });

    it('sem opções de menu, não marca sessão nem agenda inatividade (só saudação)', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        isActive: true,
        greetingMessage: 'Olá!',
        businessHours: null,
        menuOptions: [],
      });

      await service.handleNewConversation({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        queueGreetingMsg: null,
      });

      expect(mockEvolution.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(mockSession.setAwaitingMenuReply).not.toHaveBeenCalled();
      expect(mockInactivityQueue.add).not.toHaveBeenCalled();
    });

    it('uma falha ao enviar pelo WhatsApp não propaga (auto-atendimento nunca derruba o processamento do webhook)', async () => {
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        isActive: true,
        greetingMessage: 'Olá!',
        businessHours: null,
        menuOptions: [],
      });
      mockEvolution.sendTextMessage.mockRejectedValueOnce(new Error('Evolution fora do ar'));

      await expect(
        service.handleNewConversation({ companyId, conversationId, contactPhone, sessionName, queueGreetingMsg: null }),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleReply', () => {
    it('quando não há sessão aguardando menu, não faz nada e devolve false', async () => {
      mockSession.isAwaitingMenuReply.mockResolvedValueOnce(false);

      const consumed = await service.handleReply({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        text: '1',
      });

      expect(consumed).toBe(false);
      expect(mockPrisma.autoAttendanceFlow.findUnique).not.toHaveBeenCalled();
    });

    it('resposta numérica válida roteia para o departamento/fila da opção, confirma e cancela o job de inatividade pendente', async () => {
      mockSession.isAwaitingMenuReply.mockResolvedValueOnce(true);
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        menuOptions: [
          { id: 'opt-1', order: 1, label: 'Suporte', action: AutoAttendanceAction.ROUTE_TO_DEPARTMENT, departmentId: 'dept-1', queueId: null },
        ],
      });
      mockInactivityQueue.getJob.mockResolvedValueOnce(fakeJob);

      const consumed = await service.handleReply({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        text: '1',
      });

      expect(consumed).toBe(true);
      expect(mockConversationService.routeAutoAttendance).toHaveBeenCalledWith(companyId, conversationId, {
        departmentId: 'dept-1',
        queueId: undefined,
      });
      expect(mockSession.clear).toHaveBeenCalledWith(conversationId);
      expect(fakeJob.remove).toHaveBeenCalled();
      expect(mockEvolution.sendTextMessage).toHaveBeenCalledWith(
        sessionName,
        contactPhone,
        'Encaminhando você para: Suporte',
      );
    });

    it('resposta por rótulo (texto exato, case-insensitive) também casa com a opção', async () => {
      mockSession.isAwaitingMenuReply.mockResolvedValueOnce(true);
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        menuOptions: [
          { id: 'opt-1', order: 1, label: 'Suporte', action: AutoAttendanceAction.ROUTE_TO_DEPARTMENT, departmentId: 'dept-1', queueId: null },
        ],
      });

      await service.handleReply({ companyId, conversationId, contactPhone, sessionName, text: 'suporte' });

      expect(mockConversationService.routeAutoAttendance).toHaveBeenCalled();
    });

    it('opção END_CONVERSATION envia a mensagem de encerramento e fecha a conversa como UNRESOLVED', async () => {
      mockSession.isAwaitingMenuReply.mockResolvedValueOnce(true);
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        closingMessage: 'Até mais!',
        menuOptions: [
          { id: 'opt-9', order: 9, label: 'Encerrar', action: AutoAttendanceAction.END_CONVERSATION, departmentId: null, queueId: null },
        ],
      });

      await service.handleReply({ companyId, conversationId, contactPhone, sessionName, text: '9' });

      expect(mockEvolution.sendTextMessage).toHaveBeenCalledWith(sessionName, contactPhone, 'Até mais!');
      expect(mockConversationService.updateStatus).toHaveBeenCalledWith(
        companyId,
        conversationId,
        expect.objectContaining({
          status: ConversationStatus.CLOSED,
          resolution: ConversationResolution.UNRESOLVED,
        }),
      );
      expect(mockConversationService.routeAutoAttendance).not.toHaveBeenCalled();
    });

    it('resposta que não corresponde a nenhuma opção reenvia o menu e mantém a sessão', async () => {
      mockSession.isAwaitingMenuReply.mockResolvedValueOnce(true);
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        menuOptions: [{ id: 'opt-1', order: 1, label: 'Suporte', action: AutoAttendanceAction.END_CONVERSATION, departmentId: null, queueId: null }],
      });

      const consumed = await service.handleReply({
        companyId,
        conversationId,
        contactPhone,
        sessionName,
        text: 'blablabla',
      });

      expect(consumed).toBe(true);
      expect(mockSession.clear).not.toHaveBeenCalled();
      expect(mockEvolution.sendTextMessage).toHaveBeenCalledWith(
        sessionName,
        contactPhone,
        expect.stringContaining('Não entendi'),
      );
    });
  });

  describe('handleInactivityTimeout', () => {
    it('não faz nada se a sessão já não está mais aguardando menu (contato já respondeu ou foi limpo)', async () => {
      mockSession.isAwaitingMenuReply.mockResolvedValueOnce(false);

      await service.handleInactivityTimeout(conversationId, companyId);

      expect(mockPrisma.conversation.findUnique).not.toHaveBeenCalled();
    });

    it('se um agente já assumiu a conversa manualmente, só limpa a sessão sem mandar mensagem', async () => {
      mockSession.isAwaitingMenuReply.mockResolvedValueOnce(true);
      mockPrisma.conversation.findUnique.mockResolvedValueOnce({
        status: ConversationStatus.OPEN,
        agentId: 'user-1',
        whatsapp: { sessionName },
        contact: { phone: contactPhone },
      });

      await service.handleInactivityTimeout(conversationId, companyId);

      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();
      expect(mockSession.clear).toHaveBeenCalledWith(conversationId);
    });

    it('no timeout normal, envia inatividade + encerramento e fecha a conversa como UNRESOLVED', async () => {
      mockSession.isAwaitingMenuReply.mockResolvedValueOnce(true);
      mockPrisma.conversation.findUnique.mockResolvedValueOnce({
        status: ConversationStatus.WAITING,
        agentId: null,
        whatsapp: { sessionName },
        contact: { phone: contactPhone },
      });
      mockPrisma.autoAttendanceFlow.findUnique.mockResolvedValueOnce({
        inactivityMessage: 'Ainda está aí?',
        closingMessage: 'Encerrando por inatividade.',
      });

      await service.handleInactivityTimeout(conversationId, companyId);

      expect(mockEvolution.sendTextMessage).toHaveBeenNthCalledWith(1, sessionName, contactPhone, 'Ainda está aí?');
      expect(mockEvolution.sendTextMessage).toHaveBeenNthCalledWith(
        2,
        sessionName,
        contactPhone,
        'Encerrando por inatividade.',
      );
      expect(mockConversationService.updateStatus).toHaveBeenCalledWith(
        companyId,
        conversationId,
        expect.objectContaining({
          status: ConversationStatus.CLOSED,
          resolution: ConversationResolution.UNRESOLVED,
        }),
      );
      expect(mockSession.clear).toHaveBeenCalledWith(conversationId);
    });
  });
});
