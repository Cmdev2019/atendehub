import { useState, useEffect, useRef, useCallback } from 'react';
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
export function toUiMessage(message) {
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

// Converte conversa do contrato da API (contact/agent como objetos, status
// em enum, mensagens ausentes na listagem) para o formato usado pelos
// componentes ({ contact: string, agent: string, ... }). `tags` já chega no
// shape certo pra UI ({id,name,color}[], B-27) — precisa do id pra atribuir/
// remover, então passa direto sem achatar pra string.
export function toUiConversation(conv) {
  // Mock legado/testes com contact já em string — passa direto
  if (!conv || typeof conv.contact !== 'object' || conv.contact === null) {
    return conv;
  }

  // A listagem real da API não inclui mensagens (carregadas sob demanda ao
  // abrir a conversa); fixtures de demonstração podem trazê-las embutidas —
  // presença do array é o que decide se o lazy-load dispara ou não.
  const hasInlineMessages = Array.isArray(conv.messages);

  return {
    ...conv,
    contact: conv.contact.name || conv.contact.phone || 'Contato',
    phone: conv.contact.phone || '',
    avatarUrl: conv.contact.avatarUrl || null,
    channel: conv.channel === 'WHATSAPP' ? 'WhatsApp' : (conv.channel || ''),
    agent: conv.agent?.name || null,
    // Precisa do id (não só o nome) pra filtrar a aba "Meus" (B-31) — o nome
    // sozinho não dá pra comparar com o usuário logado de forma confiável.
    agentId: conv.agent?.id || null,
    tags: conv.tags || [],
    timeline: [],
    summary: conv.lastMessagePreview || '',
    messages: hasInlineMessages ? conv.messages.map(toUiMessage) : [],
    messagesLoaded: hasInlineMessages,
  };
}

// Fixtures de demonstração já no shape UI (normalizadas uma única vez) —
// evita rodar o normalizador a cada render e mantém initialConversations
// no shape do contrato (fiel ao que a API real retorna).
const initialUiConversations = initialConversations.map(toUiConversation);

// Zerado — só passa a refletir dado real após o 1º fetch bem-sucedido
// (B-2: métricas agregadas, independentes da paginação da fila).
const emptyStats = {
  totalActive: 0,
  waiting: 0,
  open: 0,
  resolvedToday: 0,
  unreadCount: 0,
  unreadConversations: 0,
};

export function useConversations() {
  // Começar com mock data como fallback
  const [conversations, setConversations] = useState(initialUiConversations);
  const [activeId, setActiveId] = useState(initialUiConversations[0]?.id);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(emptyStats);
  // Paginação da fila (B-4) — página 1 vem do fetch inicial; loadMoreConversations
  // busca as seguintes conforme o usuário rola a lista.
  const [queuePage, setQueuePage] = useState(1);
  const [queueHasMore, setQueueHasMore] = useState(false);
  const [queueLoadingMore, setQueueLoadingMore] = useState(false);
  // true somente após carregar conversas REAIS — evita join/fetch com ids mock
  const [loadedFromApi, setLoadedFromApi] = useState(false);
  // Mensagem de erro do último envio que falhou (visível na UI)
  const [sendError, setSendError] = useState(null);
  const loadingMessagesRef = useRef(new Set());
  // Lista atual acessível pelos handlers de socket (registrados uma única vez)
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const fetchingConversationsRef = useRef(new Set());

  // Fetch conversas reais do backend
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getConversations();

        // Qualquer resposta do backend (mesmo lista vazia) é autoritativa —
        // manter o mock inicial na tela por trás de um backend real e
        // conectado (ex.: empresa nova via B-9, sem conversa ainda) violava
        // F2-1/F2-2 (mock nunca fica em pé silenciosamente com backend ok).
        if (response.data) {
          const normalized = response.data.map(toUiConversation);
          console.log(
            normalized.length > 0
              ? '✅ Conversas reais carregadas do backend'
              : '✅ Backend conectado — nenhuma conversa ainda',
          );
          setConversations(normalized);
          setActiveId(normalized[0]?.id);
          setLoadedFromApi(true);
          setQueuePage(1);
          setQueueHasMore((response.meta?.totalPages ?? 1) > 1);
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

  // Métricas agregadas (B-2) — endpoint próprio, independente da paginação
  // da fila (ver fetchStats reusado nos handlers de socket abaixo).
  const fetchStats = useCallback(async () => {
    try {
      const result = await apiClient.getConversationStats();
      if (result) setStats(result);
    } catch (error) {
      console.warn('⚠️ Erro ao buscar métricas:', error.message);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Catálogo de tags da empresa (B-27) — carregado uma vez, usado tanto pra
  // exibir quanto pra popular o seletor de "adicionar tag" na conversa ativa.
  const [availableTags, setAvailableTags] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const response = await apiClient.getTags();
        const tags = Array.isArray(response) ? response : response?.data ?? [];
        setAvailableTags(tags);
      } catch (error) {
        console.warn('⚠️ Erro ao buscar tags:', error.message);
      }
    })();
  }, []);

  // ── Encerrados (B-31) — carregado sob demanda só quando a aba é aberta,
  // separado de `conversations` porque o backend já exclui CLOSED da
  // listagem padrão (mesmo filtro implícito usado pela fila ativa).
  const [closedConversations, setClosedConversations] = useState([]);
  const [closedLoaded, setClosedLoaded] = useState(false);
  const [closedPage, setClosedPage] = useState(1);
  const [closedHasMore, setClosedHasMore] = useState(false);
  const [closedLoadingMore, setClosedLoadingMore] = useState(false);

  const loadClosedConversations = useCallback(async () => {
    if (closedLoaded) return; // já carregado — a aba não refaz a cada clique
    try {
      const response = await apiClient.getConversations({ status: 'CLOSED', page: 1, limit: 20 });
      const normalized = (response.data || []).map(toUiConversation);
      setClosedConversations(normalized);
      setClosedLoaded(true);
      setClosedPage(1);
      setClosedHasMore((response.meta?.totalPages ?? 1) > 1);
    } catch (error) {
      console.warn('⚠️ Erro ao buscar conversas encerradas:', error.message);
    }
  }, [closedLoaded]);

  const loadMoreClosedConversations = useCallback(async () => {
    if (!closedHasMore || closedLoadingMore) return;

    setClosedLoadingMore(true);
    try {
      const nextPage = closedPage + 1;
      const response = await apiClient.getConversations({ status: 'CLOSED', page: nextPage, limit: 20 });
      const normalized = (response.data || []).map(toUiConversation);

      setClosedConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        return [...prev, ...normalized.filter((c) => !existingIds.has(c.id))];
      });
      setClosedPage(nextPage);
      setClosedHasMore(nextPage < (response.meta?.totalPages ?? nextPage));
    } catch (error) {
      console.warn('⚠️ Erro ao carregar mais conversas encerradas:', error.message);
    } finally {
      setClosedLoadingMore(false);
    }
  }, [closedHasMore, closedLoadingMore, closedPage]);

  // Scroll infinito da fila (B-4) — busca a próxima página e acrescenta ao
  // final da lista já carregada (dedupe por id: novas conversas podem ter
  // entrado no topo via socket entre uma página e outra).
  const loadMoreConversations = useCallback(async () => {
    if (!loadedFromApi || !queueHasMore || queueLoadingMore) return;

    setQueueLoadingMore(true);
    try {
      const nextPage = queuePage + 1;
      const response = await apiClient.getConversations({ page: nextPage, limit: 20 });
      const normalized = (response.data || []).map(toUiConversation);

      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const fresh = normalized.filter((c) => !existingIds.has(c.id));
        return [...prev, ...fresh];
      });
      setQueuePage(nextPage);
      setQueueHasMore(nextPage < (response.meta?.totalPages ?? nextPage));
    } catch (error) {
      console.warn('⚠️ Erro ao carregar mais conversas:', error.message);
    } finally {
      setQueueLoadingMore(false);
    }
  }, [loadedFromApi, queueHasMore, queueLoadingMore, queuePage]);

  // Setup WebSocket listeners para tempo real
  // Nomes e payloads conforme o backend (events.service.ts)
  useEffect(() => {
    // Rede de segurança: mensagem/evento de uma conversa que não está na
    // lista local (ex.: conversation.created perdido durante reconexão) —
    // busca a conversa na API e a insere no topo da fila.
    const fetchMissingConversation = async (conversationId) => {
      if (fetchingConversationsRef.current.has(conversationId)) return;
      fetchingConversationsRef.current.add(conversationId);
      try {
        const conv = toUiConversation(await apiClient.getConversation(conversationId));
        if (conv?.id) {
          setConversations((prev) =>
            prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev],
          );
        }
      } catch (error) {
        console.warn('⚠️ Erro ao buscar conversa nova:', error.message);
      } finally {
        fetchingConversationsRef.current.delete(conversationId);
      }
    };

    // Payload: { companyId, conversation } — nova conversa entra na fila
    // em tempo real, sem refresh
    const handleConversationCreated = (payload) => {
      const conv = toUiConversation(payload?.conversation);
      if (!conv?.id) return;

      console.log('🆕 Nova conversa na fila', conv.id);
      setConversations((prev) =>
        prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev],
      );
      fetchStats();
    };

    // Payload: { conversationId, companyId, message }
    const handleMessageNew = (payload) => {
      const conversationId = payload?.conversationId;
      const message = toUiMessage(payload?.message);
      if (!conversationId || !message) return;

      console.log('📬 Nova mensagem na conversa', conversationId);
      if (!conversationsRef.current.some((c) => c.id === conversationId)) {
        fetchMissingConversation(conversationId);
        return;
      }
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== conversationId) return conv;
          // Dedupe: ignora se já temos essa mensagem (ex.: eco do próprio envio)
          if (conv.messages?.some((m) => m.id === message.id)) return conv;
          return {
            ...conv,
            messages: [...(conv.messages || []), message],
            lastMessageAt: new Date(),
            // Preview da fila acompanha o backend (só mensagens do cliente)
            summary: message.type === 'customer' && message.text ? message.text : conv.summary,
          };
        }),
      );
      // Mensagem de cliente pode incrementar unreadCount no backend
      fetchStats();
    };

    // Payload: { conversationId, messageId, attachment } — o download da mídia
    // termina DEPOIS do message.new; este evento troca o placeholder pela
    // mídia real sem precisar de refresh
    const handleMessageUpdated = (payload) => {
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
    };

    // Payload: { conversationId, companyId, changes }
    const handleConversationUpdated = (payload) => {
      const { conversationId, changes } = payload ?? {};
      if (!conversationId) return;

      console.log('🔄 Conversa atualizada', conversationId);
      let closedElsewhere = null;
      setConversations((prev) =>
        prev
          .map((conv) => {
            if (conv.id !== conversationId) return conv;
            const next = { ...conv, ...(changes ?? {}) };
            // Saiu de WAITING por qualquer caminho (não só atribuição de
            // agente, ver conversation.assigned abaixo) — o alerta de SLA
            // deixa de fazer sentido.
            if (changes?.status && changes.status !== 'WAITING') {
              next.slaBreached = false;
            }
            // Encerrada (por mim em outra aba, ou por outro agente/supervisor)
            // — sai da lista ativa, igual ao que closeConversation já faz.
            if (changes?.status === 'CLOSED') {
              closedElsewhere = next;
              return null;
            }
            return next;
          })
          .filter(Boolean),
      );
      // Real-time: se a aba "Encerrados" já estava carregada, reflete a
      // conversa recém-fechada nela também, sem esperar um refresh manual.
      if (closedElsewhere) {
        setClosedConversations((prev) =>
          prev.some((c) => c.id === closedElsewhere.id) ? prev : [closedElsewhere, ...prev],
        );
      }
      fetchStats();
    };

    // Payload: { companyId, conversationId, agentId, departmentId, agent }
    // Emitido por PATCH /conversations/:id/assign — distinto de
    // conversation.updated (o backend usa um evento próprio pra atribuição).
    const handleConversationAssigned = (payload) => {
      const { conversationId, agentId, agent } = payload ?? {};
      if (!conversationId) return;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                agent: agent?.name || null,
                agentId: agentId || null,
                // Atribuir agente sempre encerra a espera — o backend já
                // cancela o job de SLA pendente nesse momento
                // (ConversationService#assign).
                slaBreached: agentId ? false : conv.slaBreached,
              }
            : conv,
        ),
      );
      fetchStats();
    };

    // Payload: { companyId, conversationId, contact, queue, waitTimeSeconds, maxWaitSecs, breachedAt }
    // Destaque visual na fila (F3-4) — a conversa segue WAITING além do
    // maxWaitSecs da fila; some ao ser atribuída ou sair de WAITING (acima).
    const handleSlaBreached = (payload) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) return;

      console.log('⚠️ SLA estourado na conversa', conversationId);
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? { ...conv, slaBreached: true, slaBreachedAt: payload.breachedAt }
            : conv,
        ),
      );
    };

    wsClient.on('conversation.created', handleConversationCreated);
    wsClient.on('message.new', handleMessageNew);
    wsClient.on('message.updated', handleMessageUpdated);
    wsClient.on('conversation.updated', handleConversationUpdated);
    wsClient.on('conversation.assigned', handleConversationAssigned);
    wsClient.on('sla.breached', handleSlaBreached);

    // Cleanup — remove só os callbacks registrados aqui (B-7); outros
    // consumidores do mesmo evento (ex.: useNotifications, B-8) não são
    // afetados.
    return () => {
      wsClient.off('conversation.created', handleConversationCreated);
      wsClient.off('message.new', handleMessageNew);
      wsClient.off('message.updated', handleMessageUpdated);
      wsClient.off('conversation.updated', handleConversationUpdated);
      wsClient.off('conversation.assigned', handleConversationAssigned);
      wsClient.off('sla.breached', handleSlaBreached);
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
            c.id === activeId
              ? { ...c, messages, messagesLoaded: true, messagesHasMore: response.meta?.hasMore ?? false }
              : c,
          ),
        );
      } catch (error) {
        console.warn('⚠️ Erro ao carregar mensagens:', error.message);
      } finally {
        loadingMessagesRef.current.delete(activeId);
      }
    })();
  }, [activeId, conversations]);

  // Carrega mensagens mais antigas ao rolar pro topo do histórico (B-4) —
  // cursor é o id da mensagem mais antiga já carregada (a própria API usa o
  // id da mensagem como cursor de paginação, ver ListMessagesDto#before).
  const loadingMoreMessagesRef = useRef(new Set());
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  const loadMoreMessages = useCallback(async (conversationId) => {
    const conv = conversationsRef.current.find((c) => c.id === conversationId);
    if (!conv || conv.messagesHasMore === false) return;
    if (loadingMoreMessagesRef.current.has(conversationId)) return;

    const cursor = conv.messages?.[0]?.id;
    if (!cursor) return;

    loadingMoreMessagesRef.current.add(conversationId);
    setLoadingOlderMessages(true);
    try {
      const response = await apiClient.getMessages(conversationId, 50, cursor);
      const older = (response.data || []).map(toUiMessage);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [...older, ...(c.messages || [])],
                messagesHasMore: response.meta?.hasMore ?? false,
              }
            : c,
        ),
      );
    } catch (error) {
      console.warn('⚠️ Erro ao carregar mensagens antigas:', error.message);
    } finally {
      loadingMoreMessagesRef.current.delete(conversationId);
      setLoadingOlderMessages(false);
    }
  }, []);

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
      wsClient.off('connected', join);
      if (wsClient.isConnected) wsClient.leaveConversation(activeId);
    };
  }, [activeId]);

  // Erro de envio pertence à conversa em que ocorreu — limpa ao trocar
  useEffect(() => {
    setSendError(null);
  }, [activeId]);

  // Também busca em closedConversations — clicar numa conversa na aba
  // "Encerrados" (B-31) precisa abrir o histórico dela no ChatPanel também.
  const activeConversation =
    conversations.find((c) => c.id === activeId) ??
    closedConversations.find((c) => c.id === activeId);

  // Atender (B-31): assume a conversa da fila — atribui a quem clicou e o
  // backend já move pro status OPEN sozinho (ConversationService#assign).
  // A confirmação otimista aqui evita esperar o round-trip do socket só pra
  // a conversa sumir da aba "Fila de atendimento".
  const attendConversation = useCallback(async (conversationId, agent) => {
    try {
      const updated = await apiClient.assignConversation(conversationId, { agentId: agent.id });
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                status: updated?.status || 'OPEN',
                agent: updated?.agent?.name || agent.name,
                agentId: updated?.agent?.id || agent.id,
              }
            : conv,
        ),
      );
      fetchStats();
      return true;
    } catch (error) {
      console.warn('⚠️ Erro ao assumir conversa:', error.message);
      return false;
    }
  }, [fetchStats]);

  // Encerrar (B-31): fecha a conversa ativa — some da fila ativa e, se a aba
  // "Encerrados" já tiver sido aberta antes, entra nela na hora.
  const closeConversation = useCallback(async (conversationId) => {
    try {
      await apiClient.updateConversationStatus(conversationId, 'CLOSED');
      let closed = null;
      setConversations((prev) =>
        prev.filter((conv) => {
          if (conv.id !== conversationId) return true;
          closed = { ...conv, status: 'CLOSED' };
          return false;
        }),
      );
      if (closed) {
        setClosedConversations((prev) =>
          prev.some((c) => c.id === closed.id) ? prev : [closed, ...prev],
        );
      }
      fetchStats();
      return true;
    } catch (error) {
      console.warn('⚠️ Erro ao encerrar conversa:', error.message);
      return false;
    }
  }, [fetchStats]);

  // Atribuir/remover tag na conversa ativa (B-27) — qualquer usuário
  // autenticado pode (backend não restringe por role aqui, só a criação/
  // edição/exclusão da tag em si exige SUPERVISOR+).
  const addTagToConversation = useCallback(
    async (tagId) => {
      if (!activeId) return;
      try {
        await apiClient.addConversationTag(activeId, tagId);
        const tag = availableTags.find((t) => t.id === tagId);
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === activeId && tag && !conv.tags?.some((t) => t.id === tagId)
              ? { ...conv, tags: [...(conv.tags || []), tag] }
              : conv,
          ),
        );
      } catch (error) {
        console.warn('⚠️ Erro ao adicionar tag:', error.message);
      }
    },
    [activeId, availableTags],
  );

  const removeTagFromConversation = useCallback(
    async (tagId) => {
      if (!activeId) return;
      try {
        await apiClient.removeConversationTag(activeId, tagId);
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === activeId
              ? { ...conv, tags: (conv.tags || []).filter((t) => t.id !== tagId) }
              : conv,
          ),
        );
      } catch (error) {
        console.warn('⚠️ Erro ao remover tag:', error.message);
      }
    },
    [activeId],
  );

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
    stats,
    loadMoreConversations,
    queueHasMore,
    queueLoadingMore,
    loadMoreMessages,
    loadingOlderMessages,
    availableTags,
    addTagToConversation,
    removeTagFromConversation,
    closedConversations,
    closedHasMore,
    closedLoadingMore,
    loadClosedConversations,
    loadMoreClosedConversations,
    attendConversation,
    closeConversation,
  };
}
