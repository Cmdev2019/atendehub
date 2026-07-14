import { useState, useEffect } from 'react';
import { initialConversations } from '../data/mockConversations';
import { apiClient } from '../services/api';
import { wsClient } from '../services/websocket';

let _msgCounter = 0;
function newMsgId() {
  _msgCounter += 1;
  return `new-${_msgCounter}`;
}

export function useConversations() {
  // Começar com mock data como fallback
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations[0]?.id);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch conversas reais do backend
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getConversations();

        if (response.data && response.data.length > 0) {
          console.log('✅ Conversas reais carregadas do backend');
          setConversations(response.data);
          setActiveId(response.data[0]?.id);
        } else {
          console.log('ℹ️ Nenhuma conversa no backend, usando mock data');
        }
      } catch (error) {
        console.warn('⚠️ Erro ao buscar conversas:', error.message);
        // Mantém mock data como fallback
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  // Setup WebSocket listeners para tempo real
  useEffect(() => {
    // Ouvir novas mensagens em tempo real
    wsClient.on('message:created', (message) => {
      console.log('📬 Nova mensagem recebida:', message);
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === message.conversationId
            ? {
                ...conv,
                messages: [...(conv.messages || []), message],
                lastMessageAt: new Date(),
              }
            : conv,
        ),
      );
    });

    // Ouvir atualizações de conversa em tempo real
    wsClient.on('conversation:updated', (data) => {
      console.log('🔄 Conversa atualizada:', data);
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === data.conversationId
            ? { ...conv, ...data }
            : conv,
        ),
      );
    });

    // Cleanup
    return () => {
      wsClient.off('message:created');
      wsClient.off('conversation:updated');
    };
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Mensagem otimista (aparece imediatamente)
    const optimisticMessage = {
      id: newMsgId(),
      type: 'agent',
      text,
      time,
    };

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeId
          ? { ...conv, messages: [...(conv.messages || []), optimisticMessage] }
          : conv,
      ),
    );
    setDraft('');

    // Enviar via WebSocket ou API
    try {
      if (wsClient.isConnected) {
        // Usar WebSocket se conectado
        wsClient.sendMessage(activeId, text);
        console.log('📤 Mensagem enviada via WebSocket');
      } else {
        // Fallback para API HTTP
        await apiClient.sendMessage(activeId, text);
        console.log('📤 Mensagem enviada via API HTTP');
      }
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      // Remover mensagem otimista em caso de erro
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeId
            ? {
                ...conv,
                messages: conv.messages?.filter((m) => m.id !== optimisticMessage.id),
              }
            : conv,
        ),
      );
    }
  };

  return {
    conversations,
    activeId,
    setActiveId,
    draft,
    setDraft,
    activeConversation,
    sendMessage,
    loading,
  };
}
