import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversations } from './useConversations';

// Mock dos serviços
jest.mock('../services/api', () => ({
  apiClient: {
    getConversations: jest.fn(),
    getConversation: jest.fn(),
    getConversationStats: jest.fn(),
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
    getTags: jest.fn(),
    addConversationTag: jest.fn(),
    removeConversationTag: jest.fn(),
  },
}));

jest.mock('../services/websocket', () => ({
  wsClient: {
    on: jest.fn(),
    off: jest.fn(),
    joinConversation: jest.fn(),
    leaveConversation: jest.fn(),
    isConnected: true,
  },
}));

describe('useConversations Integration Tests', () => {
  let mockApiClient;
  let mockWsClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('../services/api').apiClient;
    mockWsClient = require('../services/websocket').wsClient;
    mockWsClient.isConnected = true;
  });

  it('retorna estrutura inicial de conversas', () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });

    const { result } = renderHook(() => useConversations());

    expect(result.current).toHaveProperty('conversations');
    expect(result.current).toHaveProperty('activeId');
    expect(result.current).toHaveProperty('draft');
    expect(result.current).toHaveProperty('sendMessage');
    expect(result.current).toHaveProperty('stats');
  });

  it('busca stats agregado (B-2) ao montar e expõe no retorno do hook', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({ data: [], pagination: {} });
    mockApiClient.getConversationStats.mockResolvedValueOnce({
      totalActive: 7,
      waiting: 3,
      open: 4,
      resolvedToday: 1,
      unreadCount: 9,
      unreadConversations: 2,
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.stats.totalActive).toBe(7);
    });
    expect(result.current.stats.unreadCount).toBe(9);
  });

  it('refaz o fetch de stats ao receber conversation.created (mantém métricas atualizadas)', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    mockApiClient.getConversationStats
      .mockResolvedValueOnce({ totalActive: 1, waiting: 1, open: 0, resolvedToday: 0, unreadCount: 0, unreadConversations: 0 })
      .mockResolvedValueOnce({ totalActive: 2, waiting: 2, open: 0, resolvedToday: 0, unreadCount: 0, unreadConversations: 0 });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.stats.totalActive).toBe(1);
    });

    const conversationCreatedHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'conversation.created'
    )[1];

    act(() => {
      conversationCreatedHandler({
        companyId: 'company-1',
        conversation: {
          id: 'conv-nova',
          status: 'WAITING',
          channel: 'WHATSAPP',
          contact: { id: 'ct-1', name: 'Paloma', phone: '5512999999999', avatarUrl: null },
          createdAt: '2026-07-24T20:17:00.000Z',
        },
      });
    });

    await waitFor(() => {
      expect(result.current.stats.totalActive).toBe(2);
    });
  });

  it('carrega conversas do API ao montar', async () => {
    const mockConversations = [
      {
        id: '1',
        contact: 'João',
        messages: [{ text: 'Olá' }],
      },
    ];

    mockApiClient.getConversations.mockResolvedValueOnce({
      data: mockConversations,
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toEqual(mockConversations);
    });
  });

  it('substitui o mock inicial por fila real vazia quando o backend responde sem conversas (regressão: mock ficava preso mesmo com backend conectado)', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toEqual([]);
    });
  });

  it('usa mock data se API falhar', async () => {
    mockApiClient.getConversations.mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toBeDefined();
      expect(Array.isArray(result.current.conversations)).toBe(true);
    });
  });

  it('inscreve nos eventos WebSocket do backend (message.new, conversation.updated)', () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });

    renderHook(() => useConversations());

    expect(mockWsClient.on).toHaveBeenCalledWith('message.new', expect.any(Function));
    expect(mockWsClient.on).toHaveBeenCalledWith('conversation.updated', expect.any(Function));
  });

  it('desinscreve de eventos ao desmontar', () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });

    const { unmount } = renderHook(() => useConversations());

    unmount();

    expect(mockWsClient.off).toHaveBeenCalledWith('message.new', expect.any(Function));
    expect(mockWsClient.off).toHaveBeenCalledWith('conversation.updated', expect.any(Function));
  });

  it('entra na sala da conversa ativa via join:conversation', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    expect(mockWsClient.joinConversation).toHaveBeenCalledWith('1');
  });

  it('sai da sala anterior ao trocar de conversa ativa', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [
        { id: '1', contact: 'João', messages: [] },
        { id: '2', contact: 'Maria', messages: [] },
      ],
      pagination: { page: 1, limit: 20, total: 2 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2);
    });

    act(() => {
      result.current.setActiveId('2');
    });

    expect(mockWsClient.leaveConversation).toHaveBeenCalledWith('1');
    expect(mockWsClient.joinConversation).toHaveBeenCalledWith('2');
  });

  it('envia mensagem sempre via API REST (mesmo com WebSocket conectado)', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    mockApiClient.sendMessage.mockResolvedValueOnce({
      id: 'db-1',
      senderType: 'AGENT',
      content: 'Teste',
      sentAt: new Date().toISOString(),
    });

    mockWsClient.isConnected = true;

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.setActiveId('1');
      result.current.setDraft('Teste');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(mockApiClient.sendMessage).toHaveBeenCalledWith('1', 'Teste');
  });

  it('substitui a mensagem otimista pela versão persistida da API', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    mockApiClient.sendMessage.mockResolvedValueOnce({
      id: 'db-42',
      senderType: 'AGENT',
      content: 'Teste',
      sentAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.setActiveId('1');
      result.current.setDraft('Teste');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.activeConversation.messages).toHaveLength(1);
    expect(result.current.activeConversation.messages[0].id).toBe('db-42');
    expect(result.current.activeConversation.messages[0].text).toBe('Teste');
  });

  it('remove a mensagem otimista se o envio falhar', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    mockApiClient.sendMessage.mockRejectedValueOnce(new Error('API fora do ar'));

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.setActiveId('1');
      result.current.setDraft('Teste');
    });

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.activeConversation.messages).toHaveLength(0);
    // O erro precisa ficar visível para o usuário (F2-6)
    expect(result.current.sendError).toBeTruthy();
  });

  it('adiciona mensagem otimista ao enviar', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    // Sem id na resposta: a mensagem otimista permanece
    mockApiClient.sendMessage.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.setActiveId('1');
      result.current.setDraft('Mensagem teste');
    });

    const initialLength = result.current.activeConversation.messages.length;

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.activeConversation.messages).toHaveLength(initialLength + 1);
    expect(result.current.draft).toBe('');
  });

  it('adiciona mensagem ao receber message.new do WebSocket', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    // Payload real do backend: { conversationId, companyId, message }
    const messageNewHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'message.new'
    )[1];

    act(() => {
      messageNewHandler({
        conversationId: '1',
        companyId: 'company-1',
        message: {
          id: 'msg-1',
          senderType: 'CLIENT',
          content: 'Nova mensagem',
          type: 'TEXT',
          status: 'RECEIVED',
          sentAt: '2026-07-15T10:00:00.000Z',
        },
      });
    });

    await waitFor(() => {
      expect(result.current.activeConversation.messages).toHaveLength(1);
      expect(result.current.activeConversation.messages[0].text).toBe('Nova mensagem');
      expect(result.current.activeConversation.messages[0].type).toBe('customer');
    });
  });

  it('não duplica mensagem recebida via message.new (dedupe por id)', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [{ id: 'msg-1', type: 'customer', text: 'Oi', time: '10:00' }] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    const messageNewHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'message.new'
    )[1];

    act(() => {
      messageNewHandler({
        conversationId: '1',
        companyId: 'company-1',
        message: { id: 'msg-1', senderType: 'CLIENT', content: 'Oi', type: 'TEXT', status: 'RECEIVED', sentAt: '2026-07-15T10:00:00.000Z' },
      });
    });

    expect(result.current.activeConversation.messages).toHaveLength(1);
  });

  it('aplica changes ao receber conversation.updated do WebSocket', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', status: 'WAITING', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    // Payload real do backend: { conversationId, companyId, changes }
    const conversationUpdatedHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'conversation.updated'
    )[1];

    act(() => {
      conversationUpdatedHandler({
        conversationId: '1',
        companyId: 'company-1',
        changes: { status: 'OPEN' },
      });
    });

    await waitFor(() => {
      expect(result.current.activeConversation.status).toBe('OPEN');
    });
  });

  it('marca slaBreached ao receber sla.breached do WebSocket (F3-4)', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', status: 'WAITING', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    // Payload real do backend: { companyId, conversationId, contact, queue, waitTimeSeconds, maxWaitSecs, breachedAt }
    const slaBreachedHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'sla.breached'
    )[1];

    act(() => {
      slaBreachedHandler({
        companyId: 'company-1',
        conversationId: '1',
        waitTimeSeconds: 320,
        maxWaitSecs: 300,
        breachedAt: '2026-07-24T12:00:00.000Z',
      });
    });

    await waitFor(() => {
      expect(result.current.conversations[0].slaBreached).toBe(true);
    });
  });

  it('limpa slaBreached ao receber conversation.assigned com agentId (F3-4)', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', status: 'WAITING', slaBreached: true, messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations[0].slaBreached).toBe(true);
    });

    // Payload real do backend: { companyId, conversationId, agentId, departmentId, agent }
    const assignedHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'conversation.assigned'
    )[1];

    act(() => {
      assignedHandler({
        companyId: 'company-1',
        conversationId: '1',
        agentId: 'agent-1',
        agent: { id: 'agent-1', name: 'Ana', avatarUrl: null },
      });
    });

    await waitFor(() => {
      expect(result.current.conversations[0].slaBreached).toBe(false);
      expect(result.current.conversations[0].agent).toBe('Ana');
    });
  });

  it('limpa slaBreached ao receber conversation.updated com status fora de WAITING (F3-4)', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', status: 'WAITING', slaBreached: true, messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations[0].slaBreached).toBe(true);
    });

    const conversationUpdatedHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'conversation.updated'
    )[1];

    act(() => {
      conversationUpdatedHandler({
        conversationId: '1',
        companyId: 'company-1',
        changes: { status: 'CLOSED' },
      });
    });

    await waitFor(() => {
      expect(result.current.conversations[0].slaBreached).toBe(false);
    });
  });

  it('adiciona conversa nova na fila ao receber conversation.created', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    // Payload real do backend: { companyId, conversation }
    const conversationCreatedHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'conversation.created'
    )[1];

    act(() => {
      conversationCreatedHandler({
        companyId: 'company-1',
        conversation: {
          id: 'conv-nova',
          status: 'WAITING',
          channel: 'WHATSAPP',
          contact: { id: 'ct-1', name: 'Paloma', phone: '5512999999999', avatarUrl: null },
          createdAt: '2026-07-17T20:17:00.000Z',
        },
      });
    });

    expect(result.current.conversations).toHaveLength(2);
    // Nova conversa entra no topo da fila, normalizada para o shape da UI
    expect(result.current.conversations[0].id).toBe('conv-nova');
    expect(result.current.conversations[0].contact).toBe('Paloma');
    expect(result.current.conversations[0].channel).toBe('WhatsApp');

    // Reemissão do mesmo evento não duplica
    act(() => {
      conversationCreatedHandler({
        companyId: 'company-1',
        conversation: {
          id: 'conv-nova',
          status: 'WAITING',
          channel: 'WHATSAPP',
          contact: { id: 'ct-1', name: 'Paloma', phone: '5512999999999', avatarUrl: null },
          createdAt: '2026-07-17T20:17:00.000Z',
        },
      });
    });
    expect(result.current.conversations).toHaveLength(2);
  });

  it('busca conversa desconhecida na API ao receber message.new dela (rede de segurança)', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    mockApiClient.getConversation.mockResolvedValueOnce({
      id: 'conv-desconhecida',
      status: 'WAITING',
      channel: 'WHATSAPP',
      contact: { id: 'ct-2', name: 'Natanael', phone: '5512988888888', avatarUrl: null },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    const messageNewHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'message.new'
    )[1];

    await act(async () => {
      messageNewHandler({
        conversationId: 'conv-desconhecida',
        companyId: 'company-1',
        message: { id: 'msg-9', senderType: 'CLIENT', content: 'oi', type: 'TEXT', status: 'RECEIVED', sentAt: '2026-07-17T20:17:00.000Z' },
      });
    });

    expect(mockApiClient.getConversation).toHaveBeenCalledWith('conv-desconhecida');
    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2);
      expect(result.current.conversations[0].id).toBe('conv-desconhecida');
      expect(result.current.conversations[0].contact).toBe('Natanael');
    });
  });

  it('alterna conversa ativa corretamente', async () => {
    const mockConversations = [
      { id: '1', contact: 'João', messages: [] },
      { id: '2', contact: 'Maria', messages: [] },
    ];

    mockApiClient.getConversations.mockResolvedValueOnce({
      data: mockConversations,
      pagination: { page: 1, limit: 20, total: 2 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2);
    });

    expect(result.current.activeId).toBe('1');

    act(() => {
      result.current.setActiveId('2');
    });

    expect(result.current.activeId).toBe('2');
    expect(result.current.activeConversation.contact).toBe('Maria');
  });

  it('limpa draft após enviar mensagem', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });
    mockApiClient.sendMessage.mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.setActiveId('1');
      result.current.setDraft('Teste');
    });

    expect(result.current.draft).toBe('Teste');

    await act(async () => {
      await result.current.sendMessage();
    });

    expect(result.current.draft).toBe('');
  });

  describe('scroll infinito da fila (B-4)', () => {
    it('carrega a próxima página e acrescenta ao final da lista', async () => {
      mockApiClient.getConversations.mockResolvedValueOnce({
        data: [{ id: '1', contact: 'João', messages: [] }],
        meta: { total: 2, page: 1, limit: 1, totalPages: 2 },
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.conversations).toHaveLength(1);
        expect(result.current.queueHasMore).toBe(true);
      });

      mockApiClient.getConversations.mockResolvedValueOnce({
        data: [{ id: '2', contact: 'Maria', messages: [] }],
        meta: { total: 2, page: 2, limit: 1, totalPages: 2 },
      });

      await act(async () => {
        await result.current.loadMoreConversations();
      });

      expect(mockApiClient.getConversations).toHaveBeenLastCalledWith(2);
      expect(result.current.conversations).toHaveLength(2);
      expect(result.current.conversations[1].id).toBe('2');
      expect(result.current.queueHasMore).toBe(false);
    });

    it('não busca mais quando já está na última página', async () => {
      mockApiClient.getConversations.mockResolvedValueOnce({
        data: [{ id: '1', contact: 'João', messages: [] }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.queueHasMore).toBe(false);
      });

      await act(async () => {
        await result.current.loadMoreConversations();
      });

      // Só a chamada inicial — loadMore não dispara uma 2ª
      expect(mockApiClient.getConversations).toHaveBeenCalledTimes(1);
    });

    it('não duplica conversa que já chegou via socket antes da próxima página carregar', async () => {
      mockApiClient.getConversations.mockResolvedValueOnce({
        data: [{ id: '1', contact: 'João', messages: [] }],
        meta: { total: 2, page: 1, limit: 1, totalPages: 2 },
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.queueHasMore).toBe(true);
      });

      // Página 2 retorna uma conversa que, por coincidência, já está na lista
      // (ex.: chegou via conversation.created entre as duas chamadas)
      mockApiClient.getConversations.mockResolvedValueOnce({
        data: [{ id: '1', contact: 'João', messages: [] }],
        meta: { total: 2, page: 2, limit: 1, totalPages: 2 },
      });

      await act(async () => {
        await result.current.loadMoreConversations();
      });

      expect(result.current.conversations).toHaveLength(1);
    });
  });

  describe('scroll infinito do histórico de mensagens (B-4)', () => {
    it('busca mensagens antigas usando o id da mais antiga carregada como cursor e prepende no início', async () => {
      mockApiClient.getConversations.mockResolvedValueOnce({
        // contact como objeto (shape real da API) — passa pela normalização
        // de toUiConversation, que também converte messages via toUiMessage
        // (com contact string, o passthrough usado em outros testes deste
        // arquivo pula essa conversão e o teste não reflete o shape real).
        data: [{
          id: '1',
          contact: { id: 'ct-1', name: 'João', phone: '5511999999999', avatarUrl: null },
          messages: [{ id: 'm10', senderType: 'CLIENT', content: 'Recente', type: 'TEXT', sentAt: '2026-07-24T10:00:00.000Z' }],
        }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.conversations).toHaveLength(1);
      });

      // Marca manualmente que há mais mensagens antigas (equivalente ao que o
      // efeito de carregamento inicial faria com messagesHasMore=true)
      act(() => {
        result.current.setActiveId('1');
      });

      mockApiClient.getMessages.mockResolvedValueOnce({
        data: [{ id: 'm5', senderType: 'CLIENT', content: 'Mais antiga', type: 'TEXT', sentAt: '2026-07-24T09:00:00.000Z' }],
        meta: { count: 1, hasMore: false, nextCursor: 'm5' },
      });

      await act(async () => {
        await result.current.loadMoreMessages('1');
      });

      expect(mockApiClient.getMessages).toHaveBeenCalledWith('1', 50, 'm10');
      const conv = result.current.conversations.find((c) => c.id === '1');
      expect(conv.messages[0].text).toBe('Mais antiga');
      expect(conv.messages[1].text).toBe('Recente');
      expect(conv.messagesHasMore).toBe(false);
    });

    it('não busca mensagens antigas sem nenhuma mensagem carregada (sem cursor)', async () => {
      mockApiClient.getConversations.mockResolvedValueOnce({
        data: [{ id: '1', contact: 'João', messages: [] }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.conversations).toHaveLength(1);
      });

      await act(async () => {
        await result.current.loadMoreMessages('1');
      });

      expect(mockApiClient.getMessages).not.toHaveBeenCalled();
    });
  });

  describe('tags da conversa (B-27)', () => {
    it('busca o catálogo de tags da empresa ao montar', async () => {
      mockApiClient.getConversations.mockResolvedValueOnce({ data: [], pagination: {} });
      mockApiClient.getTags.mockResolvedValueOnce([
        { id: 'tag-1', name: 'Entrega', color: '#ef4444' },
        { id: 'tag-2', name: 'Prioridade', color: '#f59e0b' },
      ]);

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.availableTags).toHaveLength(2);
      });
      expect(result.current.availableTags[0].name).toBe('Entrega');
    });

    it('adiciona uma tag à conversa ativa e atualiza o estado local', async () => {
      mockApiClient.getConversations.mockResolvedValueOnce({
        data: [{ id: '1', contact: 'João', tags: [], messages: [] }],
        pagination: { page: 1, limit: 20, total: 1 },
      });
      mockApiClient.getTags.mockResolvedValueOnce([
        { id: 'tag-1', name: 'Entrega', color: '#ef4444' },
      ]);
      mockApiClient.addConversationTag.mockResolvedValueOnce({ message: 'ok' });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.conversations).toHaveLength(1);
        expect(result.current.availableTags).toHaveLength(1);
      });

      act(() => {
        result.current.setActiveId('1');
      });

      await act(async () => {
        await result.current.addTagToConversation('tag-1');
      });

      expect(mockApiClient.addConversationTag).toHaveBeenCalledWith('1', 'tag-1');
      const conv = result.current.conversations.find((c) => c.id === '1');
      expect(conv.tags).toEqual([{ id: 'tag-1', name: 'Entrega', color: '#ef4444' }]);
    });

    it('remove uma tag da conversa ativa e atualiza o estado local', async () => {
      mockApiClient.getConversations.mockResolvedValueOnce({
        data: [{ id: '1', contact: 'João', tags: [{ id: 'tag-1', name: 'Entrega', color: '#ef4444' }], messages: [] }],
        pagination: { page: 1, limit: 20, total: 1 },
      });
      mockApiClient.getTags.mockResolvedValueOnce([]);
      mockApiClient.removeConversationTag.mockResolvedValueOnce({ message: 'ok' });

      const { result } = renderHook(() => useConversations());

      await waitFor(() => {
        expect(result.current.conversations).toHaveLength(1);
      });

      act(() => {
        result.current.setActiveId('1');
      });

      await act(async () => {
        await result.current.removeTagFromConversation('tag-1');
      });

      expect(mockApiClient.removeConversationTag).toHaveBeenCalledWith('1', 'tag-1');
      const conv = result.current.conversations.find((c) => c.id === '1');
      expect(conv.tags).toEqual([]);
    });
  });
});
