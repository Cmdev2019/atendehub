import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversations } from './useConversations';

// Mock dos serviços
jest.mock('../services/api', () => ({
  apiClient: {
    getConversations: jest.fn(),
    getConversation: jest.fn(),
    sendMessage: jest.fn(),
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

    expect(mockWsClient.off).toHaveBeenCalledWith('message.new');
    expect(mockWsClient.off).toHaveBeenCalledWith('conversation.updated');
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
});
