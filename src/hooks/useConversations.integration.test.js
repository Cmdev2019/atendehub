import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversations } from './useConversations';

// Mock dos serviços
jest.mock('../services/api', () => ({
  apiClient: {
    getConversations: jest.fn(),
    sendMessage: jest.fn(),
  },
}));

jest.mock('../services/websocket', () => ({
  wsClient: {
    on: jest.fn(),
    off: jest.fn(),
    sendMessage: jest.fn(),
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

  it('inscreve em eventos WebSocket', () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });

    renderHook(() => useConversations());

    expect(mockWsClient.on).toHaveBeenCalledWith('message:created', expect.any(Function));
    expect(mockWsClient.on).toHaveBeenCalledWith('conversation:updated', expect.any(Function));
  });

  it('desinscreve de eventos ao desmontar', () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [],
      pagination: { page: 1, limit: 20, total: 0 },
    });

    const { unmount } = renderHook(() => useConversations());

    unmount();

    expect(mockWsClient.off).toHaveBeenCalledWith('message:created');
    expect(mockWsClient.off).toHaveBeenCalledWith('conversation:updated');
  });

  it('envia mensagem via WebSocket se conectado', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
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

    act(() => {
      result.current.sendMessage();
    });

    expect(mockWsClient.sendMessage).toHaveBeenCalledWith('1', 'Teste');
  });

  it('envia mensagem via API se WebSocket desconectado', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    mockApiClient.sendMessage.mockResolvedValueOnce({ success: true });
    mockWsClient.isConnected = false;

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.setActiveId('1');
      result.current.setDraft('Teste');
    });

    act(() => {
      result.current.sendMessage();
    });

    expect(mockApiClient.sendMessage).toHaveBeenCalledWith('1', 'Teste');
  });

  it('adiciona mensagem otimista ao enviar', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    mockWsClient.isConnected = true;

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.setActiveId('1');
      result.current.setDraft('Mensagem teste');
    });

    const initialLength = result.current.activeConversation.messages.length;

    act(() => {
      result.current.sendMessage();
    });

    expect(result.current.activeConversation.messages).toHaveLength(initialLength + 1);
    expect(result.current.draft).toBe('');
  });

  it('atualiza conversa ao receber evento WebSocket', async () => {
    mockApiClient.getConversations.mockResolvedValueOnce({
      data: [{ id: '1', contact: 'João', messages: [] }],
      pagination: { page: 1, limit: 20, total: 1 },
    });

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    // Simular evento WebSocket de mensagem criada
    const messageCreatedHandler = mockWsClient.on.mock.calls.find(
      call => call[0] === 'message:created'
    )[1];

    act(() => {
      messageCreatedHandler({
        id: 'msg-1',
        conversationId: '1',
        text: 'Nova mensagem',
        type: 'customer',
      });
    });

    await waitFor(() => {
      expect(result.current.activeConversation.messages).toHaveLength(1);
      expect(result.current.activeConversation.messages[0].text).toBe('Nova mensagem');
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

    mockWsClient.isConnected = true;

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    act(() => {
      result.current.setActiveId('1');
      result.current.setDraft('Teste');
    });

    expect(result.current.draft).toBe('Teste');

    act(() => {
      result.current.sendMessage();
    });

    expect(result.current.draft).toBe('');
  });
});
