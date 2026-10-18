import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';
import { wsClient } from '../services/websocket';
import { debounce } from '../utils/debounce';

// B-84 (M-10): eventos em rajada viram uma busca só
export const NOTIFICATIONS_REFRESH_DEBOUNCE_MS = 500;

// B-8: o backend não empurra notificação por socket (só REST, ver B1-3 em
// docs/09-APIs/API_CONTRACT.md) — refaz o fetch nos 2 eventos que de fato criam uma
// notificação lá (sla.breached e conversation.assigned), reaproveitando o
// mesmo padrão de fetchStats() em useConversations.js. Callbacks nomeados +
// off(event, callback) porque outros hooks já ouvem os mesmos eventos e o
// off(event) sem callback derrubaria os dois de uma vez (B-7).
// `currentUserId` (B-84): conversation.assigned só cria notificação para o
// agente atribuído — antes, toda atribuição fazia todo navegador recarregar.
export function useNotifications(currentUserId) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getNotifications({ limit: 20 });
      const data = response.data || [];
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.readAt).length);
      setError(null);
    } catch (err) {
      setError(err.message || 'Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    const handleRefetch = () => fetchNotifications();
    const scheduleRefetch = debounce(handleRefetch, NOTIFICATIONS_REFRESH_DEBOUNCE_MS);
    const handleAssigned = (payload) => {
      if (!currentUserId || payload?.agentId === currentUserId) scheduleRefetch();
    };
    wsClient.on('sla.breached', scheduleRefetch);
    wsClient.on('conversation.assigned', handleAssigned);
    // B-74: notificações criadas enquanto o socket esteve fora
    wsClient.on('reconnected', handleRefetch);

    return () => {
      scheduleRefetch.cancel();
      wsClient.off('sla.breached', scheduleRefetch);
      wsClient.off('conversation.assigned', handleAssigned);
      wsClient.off('reconnected', handleRefetch);
    };
  }, [fetchNotifications, currentUserId]);

  const markAsRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await apiClient.markNotificationRead(id);
    } catch (err) {
      console.warn('⚠️ Erro ao marcar notificação como lida:', err.message);
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await apiClient.markAllNotificationsRead();
    } catch (err) {
      console.warn('⚠️ Erro ao marcar todas as notificações como lidas:', err.message);
      fetchNotifications();
    }
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
