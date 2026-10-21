import { useState, useEffect, useRef, useCallback } from 'react';
import { initialConversations } from '../data/mockConversations';
import { apiClient } from '../services/api';
import { wsClient } from '../services/websocket';
import { messagePreview } from '../utils/messagePreview';
import { debounce } from '../utils/debounce';

// B-84 (M-10): eventos de socket chegam em rajada (mensagem + atualização +
// atribuição) e cada um fazia todo navegador aberto buscar as métricas (9
// consultas no servidor). Agora a rajada vira uma busca só, no fim dela.
export const STATS_REFRESH_DEBOUNCE_MS = 500;

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
    // B-77: motivo de o anexo recebido não ter sido salvo (tipo não aceito,
    // download esgotado) — o balão mostra o aviso no lugar do arquivo
    mediaError: message.metadata?.mediaError ?? null,
    // B-81: reação e edição recebidas pelo WhatsApp
    reaction: message.metadata?.reaction?.text ?? null,
    isEdited: Boolean(message.isEdited),
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

// `currentUserId` (B-31) é usado só pra paginar a aba "Meus" no servidor
// (`agentId` do filtro) — sem ele, essa aba simplesmente não pagina (fica
// só com o que já veio no fetch inicial/eventos em tempo real).
export function useConversations(currentUserId) {
  // Começar com mock data como fallback
  const [conversations, setConversations] = useState(initialUiConversations);
  const [activeId, setActiveId] = useState(initialUiConversations[0]?.id);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(emptyStats);
  // true somente após carregar conversas REAIS — evita join/fetch com ids mock
  const [loadedFromApi, setLoadedFromApi] = useState(false);
  // Mensagem de erro do último envio que falhou (visível na UI)
  const [sendError, setSendError] = useState(null);
  const loadingMessagesRef = useRef(new Set());
  // Lista atual acessível pelos handlers de socket (registrados uma única vez)
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  // Idem para a conversa aberta: mensagem nova nela não conta como não lida
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
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
          setConversations(normalized);
          setActiveId(normalized[0]?.id);
          setLoadedFromApi(true);
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

  // Usado só pelos eventos de socket; ações do próprio usuário (atender,
  // encerrar, abrir conversa) seguem buscando na hora
  const scheduleStatsRefreshRef = useRef(null);
  if (!scheduleStatsRefreshRef.current) {
    scheduleStatsRefreshRef.current = debounce(() => fetchStats(), STATS_REFRESH_DEBOUNCE_MS);
  }
  const scheduleStatsRefresh = scheduleStatsRefreshRef.current;
  useEffect(() => () => scheduleStatsRefreshRef.current?.cancel(), []);

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

  // Scroll infinito por aba (B-31) — "Fila"/"Meus"/"Em atendimento" cada uma
  // pagina sua PRÓPRIA busca filtrada no servidor (status/agentId), igual ao
  // que "Encerrados" já fazia — antes as 3 dividiam uma única paginação sem
  // filtro, então a quantidade carregada não batia com o que cada aba
  // mostrava. Resultado de cada busca é fundido no mesmo array `conversations`
  // (dedupe por id) — eventos em tempo real continuam simples, só a busca de
  // mais itens é que agora sabe o filtro certo por aba.
  const mergeConversations = useCallback((fresh) => {
    if (!fresh.length) return;
    setConversations((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const toAdd = fresh.filter((c) => !existingIds.has(c.id));
      return toAdd.length ? [...prev, ...toAdd] : prev;
    });
  }, []);

  const [queuePage, setQueuePage] = useState(0);
  const [queueHasMore, setQueueHasMore] = useState(true);
  const [queueLoadingMore, setQueueLoadingMore] = useState(false);

  const loadMoreQueueConversations = useCallback(async () => {
    if (!loadedFromApi || !queueHasMore || queueLoadingMore) return;

    setQueueLoadingMore(true);
    try {
      const nextPage = queuePage + 1;
      const response = await apiClient.getConversations({ status: 'WAITING', page: nextPage, limit: 20 });
      mergeConversations((response.data || []).map(toUiConversation));
      setQueuePage(nextPage);
      setQueueHasMore(nextPage < (response.meta?.totalPages ?? nextPage));
    } catch (error) {
      console.warn('⚠️ Erro ao carregar mais conversas da fila:', error.message);
    } finally {
      setQueueLoadingMore(false);
    }
  }, [loadedFromApi, queueHasMore, queueLoadingMore, queuePage, mergeConversations]);

  const [minePage, setMinePage] = useState(0);
  const [mineHasMore, setMineHasMore] = useState(true);
  const [mineLoadingMore, setMineLoadingMore] = useState(false);

  const loadMoreMineConversations = useCallback(async () => {
    if (!loadedFromApi || !currentUserId || !mineHasMore || mineLoadingMore) return;

    setMineLoadingMore(true);
    try {
      const nextPage = minePage + 1;
      const response = await apiClient.getConversations({ status: 'OPEN', agentId: currentUserId, page: nextPage, limit: 20 });
      mergeConversations((response.data || []).map(toUiConversation));
      setMinePage(nextPage);
      setMineHasMore(nextPage < (response.meta?.totalPages ?? nextPage));
    } catch (error) {
      console.warn('⚠️ Erro ao carregar mais conversas atribuídas a mim:', error.message);
    } finally {
      setMineLoadingMore(false);
    }
  }, [loadedFromApi, currentUserId, mineHasMore, mineLoadingMore, minePage, mergeConversations]);

  const [openPage, setOpenPage] = useState(0);
  const [openHasMore, setOpenHasMore] = useState(true);
  const [openLoadingMore, setOpenLoadingMore] = useState(false);

  const loadMoreOpenConversations = useCallback(async () => {
    if (!loadedFromApi || !openHasMore || openLoadingMore) return;

    setOpenLoadingMore(true);
    try {
      const nextPage = openPage + 1;
      const response = await apiClient.getConversations({ status: 'OPEN', page: nextPage, limit: 20 });
      mergeConversations((response.data || []).map(toUiConversation));
      setOpenPage(nextPage);
      setOpenHasMore(nextPage < (response.meta?.totalPages ?? nextPage));
    } catch (error) {
      console.warn('⚠️ Erro ao carregar mais conversas em atendimento:', error.message);
    } finally {
      setOpenLoadingMore(false);
    }
  }, [loadedFromApi, openHasMore, openLoadingMore, openPage, mergeConversations]);

  // B-104 (L-09): busca da fila no servidor (nome/telefone do contato), com o
  // filtro da aba — antes a busca só olhava o que já estava carregado
  const searchConversations = useCallback(
    async (term, tab) => {
      const filters = {
        queue: { status: 'WAITING' },
        mine: { status: 'OPEN', agentId: currentUserId },
        open: { status: 'OPEN' },
        closed: { status: 'CLOSED' },
      }[tab] ?? {};
      const response = await apiClient.getConversations({ ...filters, search: term, page: 1, limit: 50 });
      return (response.data || []).map(toUiConversation);
    },
    [currentUserId],
  );

  // B-74 (M-09): eventos emitidos enquanto o socket esteve fora não voltam —
  // ao reconectar, a lista e as métricas são buscadas de novo. A conversa
  // aberta continua selecionada se ainda estiver na lista; as mensagens dela
  // recarregam porque a lista nova chega com `messagesLoaded: false`.
  useEffect(() => {
    const resync = async () => {
      try {
        const response = await apiClient.getConversations();
        if (!response.data) return;
        const normalized = response.data.map(toUiConversation);
        setConversations(normalized);
        setActiveId((current) =>
          normalized.some((c) => c.id === current) ? current : normalized[0]?.id,
        );
        setLoadedFromApi(true);
        // A paginação por aba recomeça da lista nova
        setQueuePage(0);
        setQueueHasMore(true);
        setMinePage(0);
        setMineHasMore(true);
        setOpenPage(0);
        setOpenHasMore(true);
      } catch (error) {
        console.warn('⚠️ Erro ao ressincronizar conversas:', error.message);
      }
      fetchStats();
    };

    wsClient.on('reconnected', resync);
    return () => wsClient.off('reconnected', resync);
  }, [fetchStats]);

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

      setConversations((prev) =>
        prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev],
      );
      scheduleStatsRefresh();
    };

    // Payload: { conversationId, companyId, message }
    const handleMessageNew = (payload) => {
      const conversationId = payload?.conversationId;
      const message = toUiMessage(payload?.message);
      if (!conversationId || !message) return;

      if (!conversationsRef.current.some((c) => c.id === conversationId)) {
        fetchMissingConversation(conversationId);
        return;
      }
      // B-60: a conversa aberta não acumula não lidas — o atendente está
      // vendo a mensagem chegar; o backend incrementou, então zera lá também.
      const isOpenNow = conversationId === activeIdRef.current;
      if (isOpenNow && message.type === 'customer') {
        apiClient.markConversationRead(conversationId).catch(() => {});
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
            // B-60: prévia acompanha o backend — toda mensagem nova, do
            // cliente ou do atendente; mídia sem legenda vira o rótulo
            // ("Áudio", "Imagem"...). Antes só texto do cliente mudava a prévia.
            summary: messagePreview(message),
            // Só mensagem do cliente numa conversa que não está aberta conta
            unreadCount: isOpenNow
              ? 0
              : (conv.unreadCount || 0) + (message.type === 'customer' ? 1 : 0),
          };
        }),
      );
      // Mensagem de cliente pode incrementar unreadCount no backend
      scheduleStatsRefresh();
    };

    // Payload: { conversationId, messageId, attachment } — o download da mídia
    // termina DEPOIS do message.new; este evento troca o placeholder pela
    // mídia real sem precisar de refresh
    const handleMessageUpdated = (payload) => {
      const { conversationId, messageId, attachment, mediaError, content, isEdited, reaction } = payload ?? {};
      if (!conversationId || !messageId) return;

      // B-77: anexo não salvo (mediaError); B-81: edição (content/isEdited) e
      // reação (null = removida) recebidas — atualiza só os campos que vieram
      if (!attachment?.url) {
        const changes = {
          ...(mediaError && { mediaError }),
          ...(content !== undefined && { text: content }),
          ...(isEdited !== undefined && { isEdited }),
          ...(reaction !== undefined && { reaction }),
        };
        if (Object.keys(changes).length === 0) return;
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id !== conversationId
              ? conv
              : {
                  ...conv,
                  messages: conv.messages?.map((m) => (m.id === messageId ? { ...m, ...changes } : m)),
                },
          ),
        );
        return;
      }

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
      scheduleStatsRefresh();
    };

    // Payload: { companyId, conversationId, agentId, departmentId, agent, status, waitingSince }
    // Emitido ao atender (POST /attend) e ao transferir (PATCH /assign) —
    // distinto de conversation.updated (o backend usa um evento próprio).
    const handleConversationAssigned = (payload) => {
      const { conversationId, agentId, agent, status, waitingSince, attendedAt, serviceSlaDueAt } = payload ?? {};
      if (!conversationId) return;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                agent: agent?.name || null,
                agentId: agentId || null,
                // B-66: com o status, quem atendeu tira a conversa da Fila de
                // todos na hora; devolvida à fila, ela volta
                ...(status && { status }),
                ...(waitingSince !== undefined && { waitingSince }),
                // B-68: o ciclo do atendimento (B-114) — mudou de setor, o
                // prazo recomeça; voltou para a fila, some
                ...(attendedAt !== undefined && { attendedAt }),
                ...(serviceSlaDueAt !== undefined && { serviceSlaDueAt }),
                ...(attendedAt !== undefined && attendedAt !== conv.attendedAt && { serviceSlaBreachedAt: null }),
                // Atribuir agente sempre encerra a espera — o backend já
                // cancela o job de SLA pendente nesse momento.
                slaBreached: agentId ? false : conv.slaBreached,
              }
            : conv,
        ),
      );
      scheduleStatsRefresh();
    };

    // Payload: { companyId, conversationId, contact, queue, waitTimeSeconds, maxWaitSecs, breachedAt }
    // Destaque visual na fila (F3-4) — a conversa segue WAITING além do
    // maxWaitSecs da fila; some ao ser atribuída ou sair de WAITING (acima).
    const handleSlaBreached = (payload) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) return;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? { ...conv, slaBreached: true, slaBreachedAt: payload.breachedAt }
            : conv,
        ),
      );
    };

    // Payload: { companyId, conversationId, agentId, ..., breachedAt } — B-114:
    // o atendimento passou do prazo do setor; destaque na lista (B-68)
    const handleServiceSlaBreached = (payload) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) return;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId ? { ...conv, serviceSlaBreachedAt: payload.breachedAt } : conv,
        ),
      );
    };

    wsClient.on('conversation.created', handleConversationCreated);
    wsClient.on('message.new', handleMessageNew);
    wsClient.on('message.updated', handleMessageUpdated);
    wsClient.on('conversation.updated', handleConversationUpdated);
    wsClient.on('conversation.assigned', handleConversationAssigned);
    wsClient.on('sla.breached', handleSlaBreached);
    wsClient.on('sla.service_breached', handleServiceSlaBreached);

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
      wsClient.off('sla.service_breached', handleServiceSlaBreached);
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

  // B-60: abrir a conversa marca como lida — no backend (antes o front nunca
  // chamava PATCH /conversations/:id/read) e na lista local. Só para conversas
  // reais com algo a zerar.
  useEffect(() => {
    if (!activeId || !loadedFromApi) return;
    const conv = conversationsRef.current.find((c) => c.id === activeId);
    if (!conv?.unreadCount) return;

    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)),
    );
    apiClient
      .markConversationRead(activeId)
      .then(() => fetchStats())
      .catch((error) => console.warn('⚠️ Erro ao marcar conversa como lida:', error.message));
  }, [activeId, loadedFromApi]);

  // Também busca em closedConversations — clicar numa conversa na aba
  // "Encerrados" (B-31) precisa abrir o histórico dela no ChatPanel também.
  const activeConversation =
    conversations.find((c) => c.id === activeId) ??
    closedConversations.find((c) => c.id === activeId);

  // Atender (B-31; atômico desde o B-66): pega a conversa da fila para quem
  // clicou. Quem chegar primeiro fica com ela — o backend recusa os outros com
  // o motivo ("Fulano já está atendendo", "Fique Online para atender"), que
  // volta em `error` para a tela mostrar. A confirmação otimista evita esperar
  // o round-trip do socket só pra a conversa sumir da aba "Fila".
  // A conversa que acabou de sair da fila com o atendente (Atender ou Pegar
  // próxima): status, quem atende e o ciclo do atendimento (B-114)
  const markAttended = useCallback((conversationId, updated, agent) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? {
              ...conv,
              status: updated?.status || 'OPEN',
              agent: updated?.agent?.name || agent.name,
              agentId: updated?.agent?.id || agent.id,
              slaBreached: false,
              ...(updated?.attendedAt !== undefined && { attendedAt: updated.attendedAt }),
              ...(updated?.serviceSlaDueAt !== undefined && { serviceSlaDueAt: updated.serviceSlaDueAt }),
              serviceSlaBreachedAt: null,
            }
          : conv,
      ),
    );
  }, []);

  const attendConversation = useCallback(async (conversationId, agent) => {
    try {
      const updated = await apiClient.attendConversation(conversationId);
      markAttended(conversationId, updated, agent);
      fetchStats();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || 'Não foi possível atender esta conversa' };
    }
  }, [fetchStats, markAttended]);

  // Pegar próxima (B-68, rota do B-67): a API escolhe a conversa que espera
  // há mais tempo nos setores do atendente. Sem nenhuma esperando, `empty`.
  // Se ela ainda não estava carregada na lista (outra página), entra no topo.
  const attendNextConversation = useCallback(async (agent) => {
    try {
      const picked = await apiClient.attendNextConversation();
      if (!picked) {
        return { ok: false, empty: true, error: 'Nenhuma conversa esperando nos seus setores.' };
      }
      if (!conversationsRef.current.some((conv) => conv.id === picked.id)) {
        try {
          const full = toUiConversation(await apiClient.getConversation(picked.id));
          setConversations((prev) => (prev.some((c) => c.id === full.id) ? prev : [full, ...prev]));
        } catch {
          // Segue com o que já veio do pick: a conversa abre ao ser buscada
        }
      }
      markAttended(picked.id, picked, agent);
      fetchStats();
      return { ok: true, conversationId: picked.id };
    } catch (error) {
      return { ok: false, error: error?.message || 'Não foi possível pegar a próxima conversa' };
    }
  }, [fetchStats, markAttended]);

  // Encerrar (B-31): fecha a conversa ativa — some da fila ativa e, se a aba
  // "Encerrados" já tiver sido aberta antes, entra nela na hora.
  // `resolution` (B-32/B-36, obrigatório no backend): motivo do encerramento
  // ('RESOLVED'/'UNRESOLVED'/'CANCELLED'), escolhido pelo atendente antes de
  // confirmar. `resolutionNote` só existe (e é obrigatória no backend) pra
  // 'CANCELLED' — justificativa do cancelamento.
  // Limpa `activeId` ao final (pedido do usuário): sem isso, a conversa
  // recém-fechada continuava na tela do chat (ainda é achada em
  // `closedConversations`) até o atendente escolher outra manualmente.
  const closeConversation = useCallback(async (conversationId, resolution, resolutionNote) => {
    try {
      await apiClient.updateConversationStatus(conversationId, 'CLOSED', resolution, resolutionNote);
      let closed = null;
      setConversations((prev) =>
        prev.filter((conv) => {
          if (conv.id !== conversationId) return true;
          closed = { ...conv, status: 'CLOSED', resolution, resolutionNote: resolutionNote ?? null };
          return false;
        }),
      );
      if (closed) {
        setClosedConversations((prev) =>
          prev.some((c) => c.id === closed.id) ? prev : [closed, ...prev],
        );
      }
      setActiveId((prev) => (prev === conversationId ? null : prev));
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
    loadMoreQueueConversations,
    queueHasMore,
    queueLoadingMore,
    loadMoreMineConversations,
    mineHasMore,
    mineLoadingMore,
    loadMoreOpenConversations,
    openHasMore,
    openLoadingMore,
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
    searchConversations,
    attendConversation,
    attendNextConversation,
    closeConversation,
  };
}
