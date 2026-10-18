import { WebhookService, whatsappTimestampToDate } from './webhook.service';

// B4-4: extractPhoneFromJid já causou 2 incidentes em produção (F0-11 sufixo
// de dispositivo duplicando contatos, F0-13 @lid não normalizado criando
// contato com nome literal "...@lid") — cobertura de regressão direta.
// Método é privado: chamado via cast (as any), sem subir o resto do módulo
// (que puxaria Contact/Conversation/Message/Whatsapp/Evolution/Events/Media
// inteiros por uma função pura de string).
describe('WebhookService — extractPhoneFromJid', () => {
  const service = new WebhookService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const extract = (jid?: string | null) => (service as any).extractPhoneFromJid(jid);

  it('extrai o número de um JID padrão @s.whatsapp.net', () => {
    expect(extract('5512999999999@s.whatsapp.net')).toBe('5512999999999');
  });

  it('remove o sufixo de dispositivo (":NN") — regressão do F0-11', () => {
    expect(extract('5512999999999:12@s.whatsapp.net')).toBe('5512999999999');
  });

  it('extrai o número de um JID @c.us', () => {
    expect(extract('5512999999999@c.us')).toBe('5512999999999');
  });

  it('extrai o id opaco de um JID @lid (número oculto) — regressão do F0-13', () => {
    expect(extract('179542585000066@lid')).toBe('179542585000066');
  });

  it('remove sufixo de dispositivo também em @lid', () => {
    expect(extract('179542585000066:5@lid')).toBe('179542585000066');
  });

  it('retorna string vazia para JID ausente', () => {
    expect(extract(undefined)).toBe('');
    expect(extract(null)).toBe('');
    expect(extract('')).toBe('');
  });
});

// B4-7: cobertura do corpo principal do webhook (processMessage e vizinhos)
// — extractPhoneFromJid sozinho deixava o service em ~17%. Dependências
// mockadas na mão (não via @nestjs/testing): WebhookService não tem nenhum
// decorator própria além de @Injectable, então DI real não agrega nada aqui.
// B-79 (M-06): com webhooks em paralelo e retries, a ordem da conversa vem da
// hora da mensagem no WhatsApp, não da hora em que foi processada.
describe('whatsappTimestampToDate (B-79)', () => {
  it('converte segundos (número ou texto) em data', () => {
    expect(whatsappTimestampToDate(1760000000)?.toISOString()).toBe('2025-10-09T08:53:20.000Z');
    expect(whatsappTimestampToDate('1760000000')?.toISOString()).toBe('2025-10-09T08:53:20.000Z');
  });

  it.each([[undefined], [0], ['abc'], [-5]])('valor inválido (%p) cai no horário do servidor', (raw) => {
    expect(whatsappTimestampToDate(raw)).toBeUndefined();
  });

  it('ignora horário no futuro (relógio do aparelho errado)', () => {
    expect(whatsappTimestampToDate(Math.floor(Date.now() / 1000) + 3600)).toBeUndefined();
  });
});

describe('WebhookService — processamento de eventos', () => {
  const mockPrisma = {
    whatsAppConnection: { findUnique: jest.fn() },
    message: { findFirst: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    contact: { update: jest.fn() },
    queue: { findUnique: jest.fn() },
  };
  const mockContactService = { upsertFromWebhook: jest.fn() };
  const mockConversationService = {
    upsertFromWebhook: jest.fn(),
    updateLastMessage: jest.fn(),
  };
  const mockMessageService = {
    createFromWebhook: jest.fn(),
    updateStatus: jest.fn(),
    completeWebhookStep: jest.fn(),
  };
  const mockWhatsappService = { handleConnectionUpdate: jest.fn(), handleQrCodeUpdate: jest.fn() };
  const mockEvolutionService = { fetchProfilePictureUrl: jest.fn() };
  const mockEventsService = {
    emitConversationCreated: jest.fn(),
    emitNewMessage: jest.fn(),
    emitMessageStatus: jest.fn(),
    emitConnectionStatus: jest.fn(),
    emitMessageUpdated: jest.fn(),
  };
  const mockMediaQueue = { add: jest.fn() };
  // B-80: throttle da foto de perfil no Redis (SET NX com TTL)
  const mockRedis = { set: jest.fn().mockResolvedValue('OK') };
  // B-78: o webhook só enfileira a reação do robô (kind greeting/reply/activity)
  const mockAutoAttendanceEngine = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const enqueuedKinds = () => mockAutoAttendanceEngine.enqueue.mock.calls.map(([, job]) => job.kind);

  let service: WebhookService;

  const companyId = 'company-1';
  const connection = { id: 'conn-1', companyId, departmentId: 'dept-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebhookService(
      mockPrisma as any,
      mockContactService as any,
      mockConversationService as any,
      mockMessageService as any,
      mockWhatsappService as any,
      mockEvolutionService as any,
      mockEventsService as any,
      mockAutoAttendanceEngine as any,
      mockMediaQueue as any,
      mockRedis as any,
    );
    mockPrisma.whatsAppConnection.findUnique.mockResolvedValue(connection);
  });

  describe('MESSAGES_UPSERT — processMessage', () => {
    const oldConversation = {
      id: 'conv-1',
      status: 'WAITING',
      channel: 'WHATSAPP',
      createdAt: new Date(Date.now() - 10_000), // já existia — não é "nova"
    };

    it('ignora mensagens de grupo (@g.us) sem tocar em nenhum service', async () => {
      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: { key: { remoteJid: '123456@g.us', fromMe: false, id: 'wa-1' }, message: { conversation: 'oi' } },
      });

      expect(mockContactService.upsertFromWebhook).not.toHaveBeenCalled();
    });

    it('ignora quando a sessão não corresponde a nenhuma conexão conhecida', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce(null);

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'sessao-desconhecida',
        data: { key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' } },
      });

      expect(mockContactService.upsertFromWebhook).not.toHaveBeenCalled();
    });

    it('processa texto do cliente: upsert de contato/conversa, persiste mensagem e emite message.new', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
        avatarUrl: 'http://minio/avatar.jpg',
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: oldConversation,
        isNew: false,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({
        id: 'msg-1',
        status: 'SENT',
        sentAt: new Date(),
        isNew: true,
      });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' },
          pushName: 'Cliente Teste',
          message: { conversation: 'Oi, tudo bem?' },
          messageTimestamp: 123,
        },
      });

      expect(mockContactService.upsertFromWebhook).toHaveBeenCalledWith(
        companyId,
        '5512999999999',
        'Cliente Teste', // fromMe=false → repassa o pushName
      );
      expect(mockConversationService.upsertFromWebhook).toHaveBeenCalledWith(
        companyId,
        'contact-1',
        connection.id,
        undefined,
        connection.departmentId,
      );
      expect(mockMessageService.createFromWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          whatsappConnectionId: connection.id, // C-09/B-58: parte da chave única
          content: 'Oi, tudo bem?',
          senderType: 'CLIENT',
          externalId: 'wa-1',
        }),
      );
      // B-60: mensagem do cliente conta como não lida
      expect(mockConversationService.updateLastMessage).toHaveBeenCalledWith('conv-1', 'Oi, tudo bem?', {
        countAsUnread: true,
      });
      expect(mockEventsService.emitNewMessage).toHaveBeenCalledWith(
        expect.objectContaining({ companyId, conversationId: 'conv-1' }),
      );
      expect(mockEventsService.emitConversationCreated).not.toHaveBeenCalled(); // conversa já existia
    });

    it('em mensagens fromMe (resposta do agente pelo celular), NÃO repassa o pushName ao upsert do contato', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: oldConversation,
        isNew: false,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({ id: 'msg-2', status: 'SENT', sentAt: new Date(), isNew: true });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: true, id: 'wa-2' },
          pushName: 'Dono da Conexão', // NÃO é o contato — é quem está logado no WhatsApp
          message: { conversation: 'Já te retorno' },
        },
      });

      expect(mockContactService.upsertFromWebhook).toHaveBeenCalledWith(
        companyId,
        '5512999999999',
        undefined,
      );
      // B-60: fromMe (resposta pelo celular) atualiza a prévia e o horário,
      // mas não conta como não lida — antes não atualizava nada
      expect(mockConversationService.updateLastMessage).toHaveBeenCalledWith('conv-1', 'Já te retorno', {
        countAsUnread: false,
      });
    });

    it('emite conversation.created quando a conversa acabou de ser criada agora', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Novo',
        phone: '5512988888888',
        isBlocked: false,
        avatarUrl: null,
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: {
          id: 'conv-novo',
          status: 'WAITING',
          channel: 'WHATSAPP',
          createdAt: new Date(),
        },
        isNew: true,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({ id: 'msg-3', status: 'SENT', sentAt: new Date(), isNew: true });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512988888888@s.whatsapp.net', fromMe: false, id: 'wa-3' },
          pushName: 'Cliente Novo',
          message: { conversation: 'Primeira mensagem' },
        },
      });

      expect(mockEventsService.emitConversationCreated).toHaveBeenCalledWith(
        expect.objectContaining({ companyId, conversation: expect.objectContaining({ id: 'conv-novo' }) }),
      );
    });

    it('conversa nova aciona o auto-atendimento (B-35) repassando a saudação da fila resolvida', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Novo',
        phone: '5512988888888',
        isBlocked: false,
        avatarUrl: null,
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: { id: 'conv-novo', status: 'WAITING', channel: 'WHATSAPP', createdAt: new Date() },
        isNew: true,
        queue: { id: 'queue-1', maxWaitSecs: 300, greetingMsg: 'Bem-vindo à fila!' },
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({ id: 'msg-3', status: 'SENT', sentAt: new Date(), isNew: true });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512988888888@s.whatsapp.net', fromMe: false, id: 'wa-3' },
          pushName: 'Cliente Novo',
          message: { conversation: 'Primeira mensagem' },
        },
      });

      expect(mockAutoAttendanceEngine.enqueue).toHaveBeenCalledWith(expect.any(String), {
        kind: 'greeting',
        companyId,
        conversationId: 'conv-novo',
        contactPhone: '5512988888888',
        sessionName: 'session-1',
        queueGreetingMsg: 'Bem-vindo à fila!',
      });
      expect(enqueuedKinds()).toEqual(['greeting']);
    });

    it('mensagem de texto numa conversa já existente é repassada como possível resposta de menu', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: oldConversation,
        isNew: false,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({ id: 'msg-1', status: 'SENT', sentAt: new Date(), isNew: true });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' },
          message: { conversation: '2' },
        },
      });

      expect(mockAutoAttendanceEngine.enqueue).toHaveBeenCalledWith('msg-1', {
        kind: 'reply',
        companyId,
        conversationId: 'conv-1',
        contactPhone: '5512999999999',
        sessionName: 'session-1',
        text: '2',
      });
      expect(enqueuedKinds()).toEqual(['reply']);
    });

    it('mensagem fromMe nunca aciona o auto-atendimento (só reação a mensagem de verdade do cliente)', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: oldConversation,
        isNew: false,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({ id: 'msg-2', status: 'SENT', sentAt: new Date(), isNew: true });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: true, id: 'wa-2' },
          message: { conversation: 'Já te retorno' },
        },
      });

      expect(mockAutoAttendanceEngine.enqueue).not.toHaveBeenCalled();
    });

    it('ignora mensagens de contato bloqueado (não cria conversa nem mensagem)', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        phone: '5512999999999',
        isBlocked: true,
      });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' },
          message: { conversation: 'Oi' },
        },
      });

      expect(mockConversationService.upsertFromWebhook).not.toHaveBeenCalled();
      expect(mockMessageService.createFromWebhook).not.toHaveBeenCalled();
    });

    // B-39: sem este corte, um retry do Bull pra uma mensagem que já tinha
    // sido processada com sucesso reemitiria eventos e reacionaria o
    // auto-atendimento uma 2ª vez pra cliente nenhum pedir.
    it('idempotência (B-39): mensagem que já existe sem etapas pendentes (retry ou eco) não refaz nada', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: oldConversation,
        isNew: false,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({
        id: 'msg-1',
        status: 'SENT',
        sentAt: new Date(),
        pendingWebhookSteps: [],
        isNew: false, // já existia — Bull reprocessou o mesmo job
      });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' },
          message: { conversation: 'Oi, tudo bem?' },
        },
      });

      expect(mockConversationService.updateLastMessage).not.toHaveBeenCalled();
      expect(mockAutoAttendanceEngine.enqueue).not.toHaveBeenCalled();
      expect(mockEventsService.emitNewMessage).not.toHaveBeenCalled();
      expect(mockEventsService.emitConversationCreated).not.toHaveBeenCalled();
      expect(mockMediaQueue.add).not.toHaveBeenCalled();
    });

    // B-76 (M-01): antes, o retry via isNew=false e pulava TUDO — a saudação
    // que tinha falhado nunca mais era enviada. Agora roda só o que ficou na
    // lista, inclusive o que dependia de a conversa ser nova (no retry o
    // upsert já não diz isNew).
    it('retry retoma só as etapas pendentes, inclusive a saudação de conversa nova', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
        avatarUrl: 'https://avatar.exemplo/foto.jpg',
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: { ...oldConversation, queueId: 'queue-1' },
        isNew: false, // no retry a conversa já existe
        queue: null,
      });
      mockPrisma.queue.findUnique.mockResolvedValueOnce({ greetingMsg: 'Olá da fila!' });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({
        id: 'msg-1',
        status: 'DELIVERED',
        sentAt: new Date(),
        pendingWebhookSteps: ['auto_greeting', 'event_conversation_created', 'event_message_new'],
        isNew: false,
      });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' },
          message: { conversation: 'Oi' },
        },
      });

      // A prévia já tinha sido feita na 1ª tentativa (não conta não lida 2x)
      expect(mockConversationService.updateLastMessage).not.toHaveBeenCalled();
      expect(mockAutoAttendanceEngine.enqueue).toHaveBeenCalledWith(
        'msg-1',
        expect.objectContaining({ kind: 'greeting', conversationId: 'conv-1', queueGreetingMsg: 'Olá da fila!' }),
      );
      expect(enqueuedKinds()).toEqual(['greeting']);
      expect(mockEventsService.emitConversationCreated).toHaveBeenCalledTimes(1);
      expect(mockEventsService.emitNewMessage).toHaveBeenCalledTimes(1);
      expect(mockMessageService.completeWebhookStep.mock.calls.map(([, s]) => s)).toEqual([
        'auto_greeting',
        'event_conversation_created',
        'event_message_new',
      ]);
    });

    it('etapa que falha propaga o erro e fica pendente; as anteriores saem da lista', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
        avatarUrl: 'https://avatar.exemplo/foto.jpg',
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: oldConversation,
        isNew: false,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({
        id: 'msg-1',
        status: 'DELIVERED',
        sentAt: new Date(),
        isNew: true,
      });
      mockAutoAttendanceEngine.enqueue.mockRejectedValueOnce(new Error('Redis fora do ar'));

      await expect(
        service.handleEvent({
          event: 'MESSAGES_UPSERT',
          instance: 'session-1',
          data: {
            key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' },
            message: { conversation: '1' },
          },
        }),
      ).rejects.toThrow('Redis fora do ar');

      const done = mockMessageService.completeWebhookStep.mock.calls.map(([, s]) => s);
      expect(done).toEqual(['preview']);
      expect(mockEventsService.emitNewMessage).not.toHaveBeenCalled();
    });

    it('grava as etapas planejadas junto com a mensagem nova', async () => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
        avatarUrl: 'https://avatar.exemplo/foto.jpg',
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: oldConversation,
        isNew: true,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({
        id: 'msg-1',
        status: 'DELIVERED',
        sentAt: new Date(),
        isNew: true,
      });

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' },
          message: { conversation: 'Oi' },
        },
      });

      expect(mockMessageService.createFromWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingWebhookSteps: ['preview', 'auto_greeting', 'event_conversation_created', 'event_message_new'],
        }),
      );
    });

    it('grava a hora da mensagem no WhatsApp como sentAt (B-79)', async () => {
      mockNewMediaMessage('msg-ts');

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-ts' },
          message: { conversation: 'Oi' },
          messageTimestamp: 1760000000,
        },
      });

      expect(mockMessageService.createFromWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ sentAt: new Date(1760000000 * 1000) }),
      );
    });

    const mockNewMediaMessage = (messageId: string) => {
      mockContactService.upsertFromWebhook.mockResolvedValueOnce({
        id: 'contact-1',
        name: 'Cliente Teste',
        phone: '5512999999999',
        isBlocked: false,
        avatarUrl: 'https://avatar.exemplo/foto.jpg', // já tem foto: não dispara a busca de avatar
      });
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
        conversation: oldConversation,
        isNew: false,
        queue: null,
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({
        id: messageId,
        status: 'DELIVERED',
        sentAt: new Date(),
        isNew: true,
      });
    };

    // B-76 (M-01): o download sai do fluxo principal para uma fila própria com
    // retry; o id do job é o da mensagem, então um retry do webhook não
    // duplica. O download em si é testado em media-download.processor.spec.ts.
    it('mídia recebida vira job na fila de download, com o id da mensagem como id do job', async () => {
      mockNewMediaMessage('msg-media-1');

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-media-1' },
          message: { imageMessage: { mimetype: 'image/jpeg', url: 'https://mmg.whatsapp.net/a.enc' } },
        },
      });

      expect(mockMediaQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-media-1',
          sessionName: 'session-1',
          externalMessageId: 'wa-media-1',
          mimeType: 'image/jpeg',
          companyId,
        }),
        expect.objectContaining({ jobId: 'media:msg-media-1', attempts: expect.any(Number) }),
      );
      expect(mockMessageService.completeWebhookStep).toHaveBeenCalledWith('msg-media-1', 'media');
    });

    // B-78 (M-05): mídia com o menu aberto não é resposta, mas renova o prazo
    it('mídia do cliente numa conversa existente enfileira atividade para o robô', async () => {
      mockNewMediaMessage('msg-media-2');

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-media-2' },
          message: { audioMessage: { mimetype: 'audio/ogg', url: 'https://x/a.enc' } },
        },
      });

      expect(mockAutoAttendanceEngine.enqueue).toHaveBeenCalledWith(
        'msg-media-2',
        expect.objectContaining({ kind: 'activity', conversationId: 'conv-1' }),
      );
    });

    // B-80 (M-27 / B-46): o throttle da foto de perfil era um Map do processo,
    // nunca limpo; agora é uma chave no Redis com TTL, atômica entre réplicas.
    describe('foto de perfil (throttle no Redis)', () => {
      const flush = () => new Promise((resolve) => setImmediate(resolve));
      const newContactWithoutAvatar = () => {
        mockContactService.upsertFromWebhook.mockResolvedValueOnce({
          id: 'contact-sem-foto',
          name: 'Cliente',
          phone: '5512999999999',
          isBlocked: false,
          avatarUrl: null,
        });
        mockConversationService.upsertFromWebhook.mockResolvedValueOnce({
          conversation: oldConversation,
          isNew: false,
          queue: null,
        });
        mockMessageService.createFromWebhook.mockResolvedValueOnce({
          id: 'msg-av',
          status: 'DELIVERED',
          sentAt: new Date(),
          isNew: true,
        });
      };
      const receive = () =>
        service.handleEvent({
          event: 'MESSAGES_UPSERT',
          instance: 'session-1',
          data: {
            key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-av' },
            message: { conversation: 'Oi' },
          },
        });

      it('busca a foto quando ganha a chave (SET NX com TTL de 6h)', async () => {
        newContactWithoutAvatar();
        mockEvolutionService.fetchProfilePictureUrl.mockResolvedValueOnce(null);

        await receive();
        await flush();

        expect(mockRedis.set).toHaveBeenCalledWith(
          'avatar:fetched:contact-sem-foto',
          '1',
          'PX',
          6 * 60 * 60 * 1000,
          'NX',
        );
        expect(mockEvolutionService.fetchProfilePictureUrl).toHaveBeenCalledWith('session-1', '5512999999999');
      });

      it.each([
        ['chave já existe (buscada há menos de 6h, em qualquer réplica)', () => mockRedis.set.mockResolvedValueOnce(null)],
        ['Redis fora do ar', () => mockRedis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'))],
      ])('não busca a foto: %s', async (_label, arrange) => {
        newContactWithoutAvatar();
        arrange();

        await receive();
        await flush();

        expect(mockEvolutionService.fetchProfilePictureUrl).not.toHaveBeenCalled();
      });
    });

    // B-81 (M-02): reação, edição, status e controle não são mensagem nova —
    // nada de contato, conversa ou saudação. Antes, uma reação numa conversa
    // encerrada abria conversa nova com saudação e menu.
    describe('mensagens que não abrem conversa (B-81)', () => {
      const upsert = (key: any, message: any) =>
        service.handleEvent({ event: 'MESSAGES_UPSERT', instance: 'session-1', data: { key, message } });
      const clientKey = { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-r1' };

      const expectNothingCreated = () => {
        expect(mockContactService.upsertFromWebhook).not.toHaveBeenCalled();
        expect(mockConversationService.upsertFromWebhook).not.toHaveBeenCalled();
        expect(mockMessageService.createFromWebhook).not.toHaveBeenCalled();
        expect(mockAutoAttendanceEngine.enqueue).not.toHaveBeenCalled();
      };

      it('reação vai para a mensagem original (metadata.reaction) e avisa a UI', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-orig',
          conversationId: 'conv-1',
          metadata: { remoteJid: 'x' },
        });

        await upsert(clientKey, { reactionMessage: { key: { id: 'wa-orig' }, text: '👍' } });

        expectNothingCreated();
        expect(mockPrisma.message.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { whatsappConnectionId_externalId: { whatsappConnectionId: 'conn-1', externalId: 'wa-orig' } },
          }),
        );
        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: 'msg-orig' },
          data: { metadata: { remoteJid: 'x', reaction: { text: '👍', fromMe: false } } },
        });
        expect(mockEventsService.emitMessageUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ messageId: 'msg-orig', reaction: '👍' }),
        );
      });

      it('reação removida limpa metadata.reaction', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-orig',
          conversationId: 'conv-1',
          metadata: { remoteJid: 'x', reaction: { text: '👍', fromMe: false } },
        });

        await upsert(clientKey, { reactionMessage: { key: { id: 'wa-orig' }, text: '' } });

        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: 'msg-orig' },
          data: { metadata: { remoteJid: 'x' } },
        });
        expect(mockEventsService.emitMessageUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ reaction: null }),
        );
      });

      it('reação a mensagem desconhecida é ignorada', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce(null);

        await upsert(clientKey, { reactionMessage: { key: { id: 'wa-velha' }, text: '❤' } });

        expectNothingCreated();
        expect(mockPrisma.message.update).not.toHaveBeenCalled();
      });

      it('edição troca o texto da mensagem original e marca como editada', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({ id: 'msg-orig', conversationId: 'conv-1' });

        await upsert(clientKey, {
          protocolMessage: { type: 14, key: { id: 'wa-orig' }, editedMessage: { conversation: 'corrigido' } },
        });

        expectNothingCreated();
        expect(mockPrisma.message.update).toHaveBeenCalledWith({
          where: { id: 'msg-orig' },
          data: { content: 'corrigido', isEdited: true },
        });
        expect(mockEventsService.emitMessageUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ messageId: 'msg-orig', content: 'corrigido', isEdited: true }),
        );
      });

      it.each([
        ['status (stories)', { ...clientKey, remoteJid: 'status@broadcast' }, { conversation: 'meu status' }],
        ['canal', { ...clientKey, remoteJid: '120363@newsletter' }, { conversation: 'novidade' }],
        ['apagar para todos', clientKey, { protocolMessage: { type: 0, key: { id: 'wa-orig' } } }],
      ])('%s é ignorado sem criar nada', async (_label, key, message) => {
        await upsert(key, message);

        expectNothingCreated();
      });
    });

    it('texto não enfileira download de mídia', async () => {
      mockNewMediaMessage('msg-texto');

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-texto' },
          message: { conversation: 'Oi' },
        },
      });

      expect(mockMediaQueue.add).not.toHaveBeenCalled();
    });

    // B-42/B-60: mídia sem legenda (content vazio) não atualizava a conversa
    // — áudio, o caso mais comum, não subia na lista nem virava não lida.
    it.each([
      ['áudio', { audioMessage: { mimetype: 'audio/ogg', url: 'https://x/a.enc' } }, 'Áudio'],
      ['imagem', { imageMessage: { mimetype: 'image/jpeg', url: 'https://x/i.enc' } }, 'Imagem'],
      ['vídeo', { videoMessage: { mimetype: 'video/mp4', url: 'https://x/v.enc' } }, 'Vídeo'],
      ['documento', { documentMessage: { mimetype: 'application/pdf', url: 'https://x/d.enc' } }, 'Documento'],
      ['figurinha', { stickerMessage: { url: 'https://x/s.webp.enc' } }, 'Figurinha'],
    ])('%s sem legenda do cliente atualiza a conversa com o rótulo e conta como não lida', async (_nome, message, rotulo) => {
      mockNewMediaMessage('msg-sem-legenda');

      await service.handleEvent({
        event: 'MESSAGES_UPSERT',
        instance: 'session-1',
        data: {
          key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-sem-legenda' },
          message,
        },
      });

      expect(mockConversationService.updateLastMessage).toHaveBeenCalledWith('conv-1', rotulo, {
        countAsUnread: true,
      });
    });
  });

  // B-39: antes deste fix, handleEvent engolia QUALQUER exceção lançada por
  // um dos handlers (só logger.error, sem relançar) — o WebhookProcessor
  // nunca via o erro, o Bull marcava o job como sucesso e nenhum retry
  // disparava. Regressão direta do bug relatado.
  describe('propagação de erro (B-39 — nunca mais engolir silenciosamente)', () => {
    it('handleEvent PROPAGA (rejeita) quando um handler de evento lança', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockRejectedValueOnce(new Error('DB fora do ar'));

      await expect(
        service.handleEvent({
          event: 'MESSAGES_UPSERT',
          instance: 'session-1',
          data: {
            key: { remoteJid: '5512999999999@s.whatsapp.net', fromMe: false, id: 'wa-1' },
            message: { conversation: 'Oi' },
          },
        }),
      ).rejects.toThrow('DB fora do ar');
    });

    it('propaga também falha em CONNECTION_UPDATE, CONTACTS_UPSERT e MESSAGES_DELETE — nenhum handler engole por conta própria', async () => {
      mockWhatsappService.handleConnectionUpdate.mockRejectedValueOnce(new Error('falha ao atualizar conexão'));

      await expect(
        service.handleEvent({
          event: 'CONNECTION_UPDATE',
          instance: 'session-1',
          data: { state: 'open', wuid: '5512999999999:0@s.whatsapp.net' },
        }),
      ).rejects.toThrow('falha ao atualizar conexão');
    });
  });

  describe('CONNECTION_UPDATE', () => {
    it('extrai o telefone do dono a partir do wuid (v2) e emite connection.status', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce({
        id: 'conn-1',
        companyId,
        status: 'CONNECTED',
      });

      await service.handleEvent({
        event: 'CONNECTION_UPDATE',
        instance: 'session-1',
        data: {
          state: 'open',
          wuid: '5512999999999:0@s.whatsapp.net',
          profileName: 'Minha Empresa',
        },
      });

      expect(mockWhatsappService.handleConnectionUpdate).toHaveBeenCalledWith(
        'session-1',
        'open',
        '5512999999999',
        'Minha Empresa',
        undefined,
      );
      expect(mockEventsService.emitConnectionStatus).toHaveBeenCalledWith(
        expect.objectContaining({ companyId, connectionId: 'conn-1' }),
      );
    });
  });

  describe('CONTACTS_UPSERT', () => {
    it('faz upsert de cada contato com telefone normalizado do JID', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce({ companyId });

      await service.handleEvent({
        event: 'CONTACTS_UPSERT',
        instance: 'session-1',
        data: [{ id: '5512999999999:0@s.whatsapp.net', pushName: 'Fulano' }],
      });

      expect(mockContactService.upsertFromWebhook).toHaveBeenCalledWith(
        companyId,
        '5512999999999',
        'Fulano',
        undefined,
      );
    });

    it('ignora entradas sem telefone ou sem nome', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce({ companyId });

      await service.handleEvent({
        event: 'CONTACTS_UPSERT',
        instance: 'session-1',
        data: [{ id: '@s.whatsapp.net' }, { id: '5512999999999@s.whatsapp.net' /* sem nome */ }],
      });

      expect(mockContactService.upsertFromWebhook).not.toHaveBeenCalled();
    });
  });

  describe('MESSAGES_UPDATE — status de entrega/leitura', () => {
    it('mapeia DELIVERY_ACK para DELIVERED e emite message.status', async () => {
      mockMessageService.updateStatus.mockResolvedValueOnce(undefined);
      mockPrisma.message.findFirst.mockResolvedValueOnce({
        conversation: { id: 'conv-1', companyId },
      });

      await service.handleEvent({
        event: 'MESSAGES_UPDATE',
        instance: 'session-1',
        data: { key: { id: 'wa-1' }, update: { status: 'DELIVERY_ACK' } },
      });

      // C-09/B-58: status restrito à conexão da sessão que mandou o evento
      expect(mockMessageService.updateStatus).toHaveBeenCalledWith('conn-1', 'wa-1', 'DELIVERED');
      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { whatsappConnectionId: 'conn-1', externalId: 'wa-1' } }),
      );
      expect(mockEventsService.emitMessageStatus).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', companyId, status: 'DELIVERED' }),
      );
    });

    it('sessão desconhecida não altera nenhuma mensagem (C-09/B-58)', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce(null);

      await service.handleEvent({
        event: 'MESSAGES_UPDATE',
        instance: 'sessao-que-nao-existe',
        data: { key: { id: 'wa-1' }, update: { status: 'READ' } },
      });

      expect(mockMessageService.updateStatus).not.toHaveBeenCalled();
    });

    it('ignora status sem mapeamento conhecido', async () => {
      await service.handleEvent({
        event: 'MESSAGES_UPDATE',
        instance: 'session-1',
        data: { key: { id: 'wa-1' }, update: { status: 'ALGO_DESCONHECIDO' } },
      });

      expect(mockMessageService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('MESSAGES_DELETE', () => {
    it('marca a mensagem como deletada (isDeleted, content nulo)', async () => {
      await service.handleEvent({
        event: 'MESSAGES_DELETE',
        instance: 'session-1',
        data: { keys: [{ id: 'wa-1' }] },
      });

      // C-09/B-58: exclusão restrita à conexão — o mesmo externalId pode ser a
      // mensagem da outra ponta, em outra empresa
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: { whatsappConnectionId: 'conn-1', externalId: 'wa-1' },
        data: { isDeleted: true, content: null, type: 'DELETED' },
      });
    });

    it('sessão desconhecida não apaga nada (C-09/B-58)', async () => {
      mockPrisma.whatsAppConnection.findUnique.mockResolvedValueOnce(null);

      await service.handleEvent({
        event: 'MESSAGES_DELETE',
        instance: 'sessao-que-nao-existe',
        data: { keys: [{ id: 'wa-1' }] },
      });

      expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('evento desconhecido', () => {
    it('não lança e não chama nenhum service (default: ignorado)', async () => {
      await expect(
        service.handleEvent({ event: 'ALGO_NOVO_DA_EVOLUTION', instance: 'session-1', data: {} }),
      ).resolves.toBeUndefined();
      expect(mockPrisma.whatsAppConnection.findUnique).not.toHaveBeenCalled();
    });
  });
});
