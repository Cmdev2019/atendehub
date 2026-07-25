import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotifications } from './useNotifications';

jest.mock('../services/api', () => ({
  apiClient: {
    getNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  },
}));

jest.mock('../services/websocket', () => ({
  wsClient: {
    on: jest.fn(),
    off: jest.fn(),
  },
}));

describe('useNotifications (B-8)', () => {
  let mockApiClient;
  let mockWsClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('../services/api').apiClient;
    mockWsClient = require('../services/websocket').wsClient;
  });

  it('busca notificações ao montar e calcula unreadCount a partir de readAt', async () => {
    mockApiClient.getNotifications.mockResolvedValueOnce({
      data: [
        { id: '1', title: 'SLA estourado', readAt: null, createdAt: new Date().toISOString() },
        { id: '2', title: 'Conversa atribuída', readAt: new Date().toISOString(), createdAt: new Date().toISOString() },
      ],
      meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
    });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(2);
    });
    expect(result.current.unreadCount).toBe(1);
  });

  it('marca uma notificação como lida (otimista) e chama a API', async () => {
    mockApiClient.getNotifications.mockResolvedValueOnce({
      data: [{ id: '1', title: 'SLA estourado', readAt: null, createdAt: new Date().toISOString() }],
      meta: {},
    });
    mockApiClient.markNotificationRead.mockResolvedValueOnce({ id: '1' });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markAsRead('1');
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications[0].readAt).not.toBeNull();
    expect(mockApiClient.markNotificationRead).toHaveBeenCalledWith('1');
  });

  it('marca todas como lidas (otimista) e chama a API', async () => {
    mockApiClient.getNotifications.mockResolvedValueOnce({
      data: [
        { id: '1', title: 'A', readAt: null, createdAt: new Date().toISOString() },
        { id: '2', title: 'B', readAt: null, createdAt: new Date().toISOString() },
      ],
      meta: {},
    });
    mockApiClient.markAllNotificationsRead.mockResolvedValueOnce({ message: '2 notificação(ões) marcada(s) como lida(s)' });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(mockApiClient.markAllNotificationsRead).toHaveBeenCalled();
  });

  it('regista erro quando a busca falha', async () => {
    mockApiClient.getNotifications.mockRejectedValueOnce(new Error('Falha de rede'));

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.error).toBe('Falha de rede');
    });
  });

  it('ouve sla.breached e conversation.assigned para reagir a notificações novas, e desinscreve ao desmontar (B-7)', async () => {
    mockApiClient.getNotifications.mockResolvedValue({ data: [], meta: {} });

    const { unmount } = renderHook(() => useNotifications());

    await waitFor(() => expect(mockApiClient.getNotifications).toHaveBeenCalledTimes(1));

    const slaCall = mockWsClient.on.mock.calls.find((call) => call[0] === 'sla.breached');
    const assignedCall = mockWsClient.on.mock.calls.find((call) => call[0] === 'conversation.assigned');
    expect(slaCall).toBeTruthy();
    expect(assignedCall).toBeTruthy();

    unmount();

    expect(mockWsClient.off).toHaveBeenCalledWith('sla.breached', slaCall[1]);
    expect(mockWsClient.off).toHaveBeenCalledWith('conversation.assigned', assignedCall[1]);
  });
});
