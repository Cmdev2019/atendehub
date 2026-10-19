import { createElement as h, useEffect, useState } from 'react';
import { Icon } from './icons';
import { messagePreview } from '../utils/messagePreview';
import { formatElapsed } from '../utils/elapsed';

// B-104 (L-09): a partir de quantos caracteres a busca vai ao servidor, e o
// intervalo de digitação antes de buscar
export const SERVER_SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 300;

// Distância (px) do fim da lista que já dispara a busca da próxima página —
// carrega antes do usuário bater no fim de verdade, pra parecer contínuo.
const LOAD_MORE_THRESHOLD_PX = 150;

// Etapas de atendimento (B-31) — cada uma com sua PRÓPRIA busca paginada no
// servidor (status/agentId certos por aba, ver useConversations.js), fundidas
// no mesmo array `conversations` e filtradas aqui só pra exibição. Seletor
// único (não abas em linha, B-31 correção): dropdown compacto que nunca
// quebra o layout, independente do tamanho da janela.
const TABS = [
  { id: 'queue', label: 'Fila de atendimento' },
  { id: 'mine', label: 'Meus' },
  { id: 'open', label: 'Em atendimento' },
  { id: 'closed', label: 'Encerrados' },
];

const EMPTY_MESSAGES = {
  queue: 'Nenhuma conversa na fila.',
  mine: 'Você não tem conversas em atendimento.',
  open: 'Nenhuma conversa em atendimento.',
  closed: 'Nenhuma conversa encerrada ainda.',
};

export function ConversationQueue({
  activeId,
  conversations,
  onSelect,
  hasMore,
  loadingMore,
  onLoadMoreQueue,
  mineHasMore,
  mineLoadingMore,
  onLoadMoreMine,
  openHasMore,
  openLoadingMore,
  onLoadMoreOpen,
  closedConversations = [],
  closedHasMore = false,
  closedLoadingMore = false,
  onLoadClosed,
  onLoadMoreClosed,
  currentUserId,
  onAttend,
  onSearch,
  // B-66: por que o "Atender" foi recusado ("Fulano já está atendendo")
  attendNotice = null,
  onDismissAttendNotice,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('queue');
  // B-104 (L-09): resultado da busca no servidor para (termo, aba). Antes, a
  // busca filtrava só o que já estava carregado na tela — conversa da 2ª
  // página em diante nunca aparecia.
  const [serverResult, setServerResult] = useState(null);
  // Relógio do tempo de espera, atualizado a cada minuto
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const term = searchTerm.trim();
  useEffect(() => {
    if (!onSearch || term.length < SERVER_SEARCH_MIN_CHARS) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const list = await onSearch(term, activeTab);
        if (!cancelled) setServerResult({ term, tab: activeTab, list });
      } catch {
        // Sem servidor, segue o filtro local abaixo
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, activeTab, onSearch]);

  const usingServer = serverResult && serverResult.term === term && serverResult.tab === activeTab;
  const sourceList = usingServer
    ? serverResult.list
    : activeTab === 'closed'
      ? closedConversations
      : conversations;

  const tabList = sourceList.filter((conv) => {
    if (activeTab === 'queue') return conv.status === 'WAITING';
    if (activeTab === 'mine') return conv.status === 'OPEN' && conv.agentId === currentUserId;
    if (activeTab === 'open') return conv.status === 'OPEN';
    return true; // closed: já vem filtrado do servidor
  });

  // B-60: mais recente primeiro, como o servidor já entrega — sem isto, uma
  // conversa que recebia mensagem em tempo real ficava parada onde estava.
  const activityOf = (conv) => new Date(conv.lastMessageAt || conv.createdAt || 0).getTime();
  const filteredConversations = tabList
    // O servidor já filtrou pelo nome/telefone; o filtro local cobre o
    // intervalo de digitação e o modo sem servidor
    .filter((conv) => usingServer || conv.contact.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => activityOf(b) - activityOf(a));

  // Contagens rápidas no seletor (menos a de encerrados, que só reflete o
  // que já foi carregado, já que a aba busca sob demanda).
  const queueCount = conversations.filter((c) => c.status === 'WAITING').length;
  const mineCount = conversations.filter((c) => c.status === 'OPEN' && c.agentId === currentUserId).length;
  const openCount = conversations.filter((c) => c.status === 'OPEN').length;
  const tabCounts = { queue: queueCount, mine: mineCount, open: openCount, closed: closedConversations.length };

  // Cada aba tem seu próprio par (fetch/estado) — mapa central evita repetir
  // o mesmo if/else em handleScroll e no rodapé de "carregando mais".
  const tabPaging = {
    queue: { loadMore: onLoadMoreQueue, hasMore, loadingMore },
    mine: { loadMore: onLoadMoreMine, hasMore: mineHasMore, loadingMore: mineLoadingMore },
    open: { loadMore: onLoadMoreOpen, hasMore: openHasMore, loadingMore: openLoadingMore },
    closed: { loadMore: onLoadMoreClosed, hasMore: closedHasMore, loadingMore: closedLoadingMore },
  };

  const handleTabChange = (event) => {
    const tabId = event.target.value;
    setActiveTab(tabId);
    if (tabId === 'closed') onLoadClosed?.();
  };

  // Scroll infinito (B-4/B-31) — cada aba busca a página seguinte do seu
  // próprio filtro (ver tabPaging acima); a lista visível reflete exatamente
  // a quantidade de conversas daquela etapa, não mais um total genérico.
  const handleScroll = (e) => {
    if (searchTerm) return;
    const { loadMore, hasMore: tabHasMore, loadingMore: tabLoadingMore } = tabPaging[activeTab];
    if (!loadMore || !tabHasMore || tabLoadingMore) return;

    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < LOAD_MORE_THRESHOLD_PX) {
      loadMore();
    }
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleAttend = (event, convId) => {
    event.stopPropagation();
    onAttend?.(convId);
  };

  const handleItemKeyDown = (event, convId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(convId);
    }
  };

  return h(
    'div',
    { className: 'queue' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', null, h(Icon, { name: 'chat', size: 16 }), ' Conversas'),
    ),
    h(
      'div',
      { className: 'queue-tab-select-wrap' },
      h(
        'select',
        {
          className: 'queue-tab-select',
          'aria-label': 'Etapa de atendimento',
          value: activeTab,
          onChange: handleTabChange,
        },
        TABS.map((tab) =>
          h(
            'option',
            { key: tab.id, value: tab.id },
            tabCounts[tab.id] > 0 ? `${tab.label} (${tabCounts[tab.id]})` : tab.label,
          ),
        ),
      ),
      h(Icon, { name: 'chevron-down', size: 14, className: 'queue-tab-select-icon' }),
    ),
    h('input', {
      type: 'search',
      className: 'search-input',
      placeholder: 'Buscar...',
      value: searchTerm,
      onChange: (e) => setSearchTerm(e.target.value),
      'aria-label': 'Buscar conversa',
    }),
    attendNotice && h(
      'div',
      { className: 'queue-notice', role: 'alert' },
      h(Icon, { name: 'warning', size: 14 }),
      h('span', null, attendNotice),
      onDismissAttendNotice && h('button', {
        type: 'button',
        className: 'queue-notice-close',
        onClick: onDismissAttendNotice,
        title: 'Fechar aviso',
      }, h(Icon, { name: 'x', size: 12, label: 'Fechar aviso' })),
    ),
    h(
      'div',
      { className: 'queue-list', onScroll: handleScroll },
      filteredConversations.length > 0 ? (
        filteredConversations.map((conv) =>
          h(
            'div',
            {
              key: conv.id,
              className: `queue-item${activeId === conv.id ? ' active' : ''}${conv.slaBreached ? ' sla-breached' : ''}`,
              role: 'button',
              tabIndex: 0,
              onClick: () => onSelect(conv.id),
              onKeyDown: (e) => handleItemKeyDown(e, conv.id),
              title: conv.slaBreached ? `${conv.contact} — SLA de espera estourado` : conv.contact,
              // B-14: a conversa aberta só era indicada por CSS (.active)
              'aria-current': activeId === conv.id ? 'true' : undefined,
            },
            h('div', { className: 'queue-item-avatar' },
              conv.avatarUrl
                ? h('img', { src: conv.avatarUrl, alt: '', className: 'avatar-img' })
                : getInitials(conv.contact)),
            h(
              'div',
              { className: 'queue-item-content' },
              h(
                'div',
                { className: 'queue-item-name' },
                conv.contact,
                // B-60: contador de não lidas por conversa
                conv.unreadCount > 0 &&
                  h(
                    'span',
                    {
                      className: 'queue-item-unread',
                      'aria-label': `${conv.unreadCount} ${conv.unreadCount === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`,
                    },
                    conv.unreadCount > 99 ? '99+' : String(conv.unreadCount),
                  ),
                conv.slaBreached &&
                  h(
                    'span',
                    { className: 'queue-item-sla-badge' },
                    h(Icon, { name: 'warning', size: 11 }),
                    ' SLA',
                  ),
              ),
              h('div', { className: 'queue-item-preview' },
                conv.messages?.length
                  ? messagePreview(conv.messages[conv.messages.length - 1])
                  : conv.summary || 'Sem mensagens'
              ),
              activeTab !== 'queue' && conv.agent &&
                h('div', { className: 'queue-item-agent' }, h(Icon, { name: 'user', size: 11 }), ` ${conv.agent}`),
            ),
            activeTab === 'queue'
              ? h(
                  'div',
                  { className: 'queue-item-actions' },
                  // B-104: há quanto tempo a conversa espera na fila — desde o
                  // início da espera atual (B-66), não do nascimento da conversa
                  h('span', { className: 'queue-item-time', title: 'Tempo na fila' },
                    formatElapsed(conv.waitingSince || conv.createdAt, now)),
                  h('button', {
                    type: 'button',
                    className: 'queue-item-attend',
                    onClick: (e) => handleAttend(e, conv.id),
                    title: 'Assumir esta conversa',
                  }, 'Atender'),
                )
              : h('div', { className: 'queue-item-time', title: 'Última atividade' }, formatElapsed(activityOf(conv), now)),
          ),
        )
      ) : (
        h('div', { className: 'queue-empty' }, EMPTY_MESSAGES[activeTab])
      ),
      tabPaging[activeTab].loadingMore &&
        h('div', { className: 'queue-loading-more' }, 'Carregando mais conversas…'),
    ),
  );
}
