import { useState, useEffect, useRef } from 'react';
import { initialConversations } from '../data/mockConversations';
import { apiClient } from '../services/api';
import { wsClient } from '../services/websocket';

let _msgCounter = 0;
function newMsgId() {
  _msgCounter += 1;
  return `new-${_msgCounter}`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Converte mensagem do contrato da API (senderType/content/sentAt) para o
// formato usado pelos componentes ({ type, text, time }).
// A unificação completa do contrato é o item F1-2 do roadmap.
function toUiMessage(message) {
  if (!message) return null;
  if (message.text !== undefined) return message; // já está no formato da UI

  const sentAt = message.sentAt ? new Date(message.sentAt) : new Date();
  return {
    id: message.id,
    // SenderType do backend: AGENT | CLIENT | BOT | SYSTEM
    type: message.senderType === 'CLIENT' ? 'customer' : 'agent',
    text: message.content ?? '',
    time: formatTime(sentAt),
    // Tipo da mensagem no backend (TEXT | IMAGE | STICKER | AUDIO | ...) e
    // anexos baixados para o MinIO — usados pelo ChatPanel para renderizar
    // mídia real ou placeholder
    mediaType: message.type || 'TEXT',
    attachments: (message.attachments || []).map((a) => ({
      id: a.id,
      url: a.url,
      mimeType: a.mimeType || '',
      fileName: a.fileName || null,
    })),
  };
}

// Converte conversa do contrato da API (contact/agent/tags como objetos,
// sem array de mensagens) para o formato usado pelos componentes.
// A unificação completa do contrato é o item F1-2 do roadmap.
function toUiConversation(conv) {
  // Mock e testes já usam contact como string — passa direto
  if (!conv || typeof conv.contact !== 'object' || conv.contact === null) {
    return conv;
  }

  return {
    ...conv,
    contact: conv.contact.name || conv.contact.phone || 'Contato',
    phone: conv.contact.phone || '',
    avatarUrl: conv.contact.avatarUrl || null,
    channel: conv.channel === 'WHATSAPP' ? 'WhatsApp' : (conv.channel || ''),
    agent: conv.agent?.name || null,
    tags: (conv.tags || []).map((tag) => tag?.name ?? tag),
    timeline: [],
    summary: conv.lastMessagePreview || '',
    // A listagem não inclui mensagens — carregadas sob demanda ao abrir a conversa
    messages: [],
    messagesLoaded: false,
  };
}

export function useConversations() {
  // Começar com mock data como fallback
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations[0]?.id);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  // true somente após carregar conversas REAIS — evita join/fetch com ids mock
  const [loadedFromApi, setLoadedFromApi] = useState(false);
  // Mensagem de erro do último envio que falhou (visível na UI)
  const [sendError, setSendError] = useState(null);
  const loadingMessagesRef = useRef(new Set());

  // Fetch conversas reais do backend
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getConversations();

        if (response.data && response.data.length > 0) {
          console.log('✅ Conversas reais carregadas do backend');
          const normalized = response.data.map(toUiConversation);
          setConversations(normalized);
          setActiveId(normalized[0]?.id);
          setLoadedFromApi(true);
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
  // Nomes e payloads conforme o backend (events.service.ts)
  useEffect(() => {
    // Payload: { conversationId, companyId, message }
    wsClient.on('message.new', (payload) => {
      const conversationId = payload?.conversationId;
      const message = toUiMessage(payload?.message);
      if (!conversationId || !message) return;

      console.log('📬 Nova mensagem na conversa', conversationId);
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== conversationId) return conv;
          // Dedupe: ignora se já temos essa mensagem (ex.: eco do próprio envio)
          if (conv.messages?.some((m) => m.id === message.id)) return conv;
          return {
            ...conv,
            messages: [...(conv.messages || []), message],
            lastMessageAt: new Date(),
          };
        }),
      );
    });

    // Payload: { conversationId, messageId, attachment } — o download da mídia
    // termina DEPOIS do message.new; este evento troca o placeholder pela
    // mídia real sem precisar de refresh
    wsClient.on('message.updated', (payload) => {
      const { conversationId, messageId, attachment } = payload ?? {};
      if (!conversationId || !messageId || !attachment?.url) return;

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== conversationId) return conv;
          return {
            ...conv,
            messages: conv.messages?.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    attachments: [
                      ...(m.attachments || []).filter((a) => a.id !== attachment.id),
                      {
                        id: attachment.id,
                        url: attachment.url,
                        mimeType: attachment.mimeType || '',
                        fileName: attachment.fileName || null,
                      },
                    ],
                  }
                : m,
            ),
          };
        }),
      );
    });

    // Payload: { conversationId, companyId, changes }
    wsClient.on('conversation.updated', (payload) => {
      const { conversationId, changes } = payload ?? {};
      if (!conversationId) return;

      console.log('🔄 Conversa atualizada', conversationId);
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, ...(changes ?? {}) } : conv,
        ),
      );
    });

    // Cleanup
    return () => {
      wsClient.off('message.new');
      wsClient.off('message.updated');
      wsClient.off('conversation.updated');
    };
  }, []);

  // Carrega as mensagens da conversa ativa sob demanda (a listagem da API
  // não inclui mensagens). Só para conversas reais (messagesLoaded === false).
  useEffect(() => {
    if (!activeId) return;

    const conv = conversations.find((c) => c.id === activeId);
    if (!conv || conv.messagesLoaded !== false) return;
    if (loadingMessagesRef.current.has(activeId)) return;

    loadingMessagesRef.current.add(activeId);

    (async () => {
      try {
        const response = await apiClient.getMessages(activeId);
        const messages = (response.data || []).map(toUiMessage);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId ? { ...c, messages, messagesLoaded: true } : c,
          ),
        );
      } catch (error) {
        console.warn('⚠️ Erro ao carregar mensagens:', error.message);
      } finally {
        loadingMessagesRef.current.delete(activeId);
      }
    })();
  }, [activeId, conversations]);

  // Entra na sala da conversa ativa (join:conversation) para receber os
  // eventos direcionados a ela; sai da sala anterior ao trocar de conversa.
  // Somente para conversas reais — ids mock não existem no servidor e
  // gerariam WARN de acesso não autorizado a cada page load.
  useEffect(() => {
    if (!activeId || !loadedFromApi) return;

    const join = () => wsClient.joinConversation(activeId);

    if (wsClient.isConnected) join();
    // Reentra na sala quando a conexão (re)abrir
    wsClient.on('connected', join);

    return () => {
      wsClient.off('connected');
      if (wsClient.isConnected) wsClient.leaveConversation(activeId);
    };
  }, [activeId]);

  // Erro de envio pertence à conversa em que ocorreu — limpa ao trocar
  useEffect(() => {
    setSendError(null);
  }, [activeId]);

  const activeConversation = conversations.find((c) => c.id === activeId);

  // Envia texto e/ou arquivos de mídia (prints colados, anexos).
  // Retorna true em sucesso — o ChatPanel usa isso para limpar os anexos.
  const sendMessage = async (files = []) => {
    const text = draft.trim();
    const mediaFiles = (files || []).map((f) => f?.file || f).filter(Boolean);

    if (!text && mediaFiles.length === 0) return false;

    setSendError(null);

    // ── Mídia: um envio por arquivo; o texto do composer vira caption do 1º ──
    if (mediaFiles.length > 0) {
      setDraft('');
      try {
        for (let i = 0; i < mediaFiles.length; i++) {
          const response = await apiClient.sendMediaMessage(
            activeId,
            mediaFiles[i],
            i === 0 ? text : '',
          );
          const saved = toUiMessage(response?.message ?? response);
          if (saved?.id) {
            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.id !== activeId) return conv;
                // Eco via socket pode já ter chegado — não duplica
                if (conv.messages?.some((m) => m.id === saved.id)) return conv;
                return { ...conv, messages: [...(conv.messages || []), saved] };
              }),
            );
          }
        }
        return true;
      } catch (error) {
        console.error('❌ Erro ao enviar mídia:', error);
        setSendError(
          `Não foi possível enviar a imagem. ${error?.message || ''}`.trim(),
        );
        return false;
      }
    }

    // Mensagem otimista (aparece imediatamente)
    const optimisticMessage = {
      id: newMsgId(),
      type: 'agent',
      text,
      time: formatTime(new Date()),
    };

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeId
          ? { ...conv, messages: [...(conv.messages || []), optimisticMessage] }
          : conv,
      ),
    );
    setDraft('');

    // Envio sempre via REST: passa pelo DTO validado + fila com retry no
    // backend. O socket serve apenas para RECEBER eventos (o gateway não
    // possui handler de envio de mensagem).
    try {
      const response = await apiClient.sendMessage(activeId, text);

      // Substitui a mensagem otimista pela versão persistida (id real do banco).
      // ATENÇÃO à corrida: o eco via socket (message.new) pode chegar ANTES
      // desta resposta — nesse caso a mensagem real já está na lista e basta
      // remover a otimista (substituir criaria uma duplicata).
      const saved = toUiMessage(response?.message ?? response);
      if (saved?.id) {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== activeId) return conv;
            const echoed = conv.messages?.some((m) => m.id === saved.id);
            return {
              ...conv,
              messages: echoed
                ? conv.messages.filter((m) => m.id !== optimisticMessage.id)
                : conv.messages?.map((m) =>
                    m.id === optimisticMessage.id ? saved : m,
                  ),
            };
          }),
        );
      }
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);

      // Mensagem amigável na UI (a falha típica hoje é WhatsApp não pareado)
      const detail = error?.message || '';
      setSendError(
        detail.includes('WhatsApp')
          ? 'Não foi possível enviar: a conexão WhatsApp desta conversa não está pareada.'
          : `Não foi possível enviar a mensagem. ${detail}`.trim(),
      );

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
      return false;
    }
    return true;
  };

  return {
    conversations,
    activeId,
    setActiveId,
    draft,
    setDraft,
    activeConversation,
    sendMessage,
    sendError,
    loading,
  };
}
