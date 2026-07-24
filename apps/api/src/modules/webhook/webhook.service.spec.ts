import { WebhookService } from './webhook.service';

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
describe('WebhookService — processamento de eventos', () => {
  const mockPrisma = {
    whatsAppConnection: { findUnique: jest.fn() },
    message: { findFirst: jest.fn(), updateMany: jest.fn() },
    contact: { update: jest.fn() },
  };
  const mockContactService = { upsertFromWebhook: jest.fn() };
  const mockConversationService = {
    upsertFromWebhook: jest.fn(),
    updateLastMessage: jest.fn(),
  };
  const mockMessageService = { createFromWebhook: jest.fn(), updateStatus: jest.fn() };
  const mockWhatsappService = { handleConnectionUpdate: jest.fn(), handleQrCodeUpdate: jest.fn() };
  const mockEvolutionService = { fetchProfilePictureUrl: jest.fn() };
  const mockEventsService = {
    emitConversationCreated: jest.fn(),
    emitNewMessage: jest.fn(),
    emitMessageStatus: jest.fn(),
    emitConnectionStatus: jest.fn(),
    emitMessageUpdated: jest.fn(),
  };
  const mockMediaDownloadService = { downloadFromEvolution: jest.fn(), downloadAndStore: jest.fn() };

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
      mockMediaDownloadService as any,
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
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce(oldConversation);
      mockMessageService.createFromWebhook.mockResolvedValueOnce({
        id: 'msg-1',
        status: 'SENT',
        sentAt: new Date(),
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
          content: 'Oi, tudo bem?',
          senderType: 'CLIENT',
          externalId: 'wa-1',
        }),
      );
      expect(mockConversationService.updateLastMessage).toHaveBeenCalledWith('conv-1', 'Oi, tudo bem?');
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
      mockConversationService.upsertFromWebhook.mockResolvedValueOnce(oldConversation);
      mockMessageService.createFromWebhook.mockResolvedValueOnce({ id: 'msg-2', status: 'SENT', sentAt: new Date() });

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
      // fromMe → não atualiza preview/unread da conversa via mensagem do CLIENTE
      expect(mockConversationService.updateLastMessage).not.toHaveBeenCalled();
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
        id: 'conv-novo',
        status: 'WAITING',
        channel: 'WHATSAPP',
        createdAt: new Date(), // recém-criada
      });
      mockMessageService.createFromWebhook.mockResolvedValueOnce({ id: 'msg-3', status: 'SENT', sentAt: new Date() });

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
  });

  describe('extractMessageContent (via processMessage) — tipos de mídia/conteúdo', () => {
    const extract = (message: any) => (service as any).extractMessageContent(message);

    it('mensagem de texto simples (conversation)', () => {
      expect(extract({ conversation: 'Olá' })).toEqual({ type: 'TEXT', content: 'Olá' });
    });

    it('mensagem de texto estendida (extendedTextMessage — resposta/link preview)', () => {
      expect(extract({ extendedTextMessage: { text: 'Com link' } })).toEqual({
        type: 'TEXT',
        content: 'Com link',
      });
    });

    it('imagem com legenda', () => {
      expect(
        extract({ imageMessage: { caption: 'Legenda', mimetype: 'image/jpeg', url: 'https://x/img.enc' } }),
      ).toEqual({
        type: 'IMAGE',
        content: 'Legenda',
        mediaUrl: 'https://x/img.enc',
        mimeType: 'image/jpeg',
      });
    });

    it('figurinha (sticker) — mimeType fixo image/webp', () => {
      expect(extract({ stickerMessage: { url: 'https://x/s.webp.enc' } })).toEqual({
        type: 'STICKER',
        content: '',
        mediaUrl: 'https://x/s.webp.enc',
        mimeType: 'image/webp',
      });
    });

    it('documento usa o título como fileName e content', () => {
      expect(
        extract({ documentMessage: { title: 'contrato.pdf', mimetype: 'application/pdf', url: 'https://x/d.enc' } }),
      ).toEqual({
        type: 'DOCUMENT',
        content: 'contrato.pdf',
        mediaUrl: 'https://x/d.enc',
        mimeType: 'application/pdf',
        fileName: 'contrato.pdf',
      });
    });

    it('localização vira "lat,lng" como content', () => {
      expect(
        extract({ locationMessage: { degreesLatitude: -23.5, degreesLongitude: -46.6 } }),
      ).toEqual({ type: 'LOCATION', content: '-23.5,-46.6' });
    });

    it('mensagem sem conteúdo reconhecido cai no fallback TEXT vazio', () => {
      expect(extract(undefined)).toEqual({ type: 'TEXT', content: '' });
      expect(extract({})).toEqual({ type: 'TEXT', content: '' });
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

      expect(mockMessageService.updateStatus).toHaveBeenCalledWith('wa-1', 'DELIVERED');
      expect(mockEventsService.emitMessageStatus).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1', companyId, status: 'DELIVERED' }),
      );
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

      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: { externalId: 'wa-1' },
        data: { isDeleted: true, content: null, type: 'DELETED' },
      });
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
