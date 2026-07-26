import { createElement as h, useState } from 'react';
import { Icon } from './icons';

// Distância (px) do fim da lista que já dispara a busca da próxima página —
// carrega antes do usuário bater no fim de verdade, pra parecer contínuo.
const LOAD_MORE_THRESHOLD_PX = 150;

// Etapas de atendimento (B-31): o backend já tem o status certo pra cada
// uma (WAITING/OPEN/CLOSED, ConversationStatus) — as abas só filtram a
// lista já carregada. "Fila"/"Meus"/"Em atendimento" filtram client-side
// (todas vêm do mesmo fetch da lista ativa, que já exclui CLOSED por
// padrão); só "Encerrados" tem sua própria busca no servidor (CLOSED
// nunca está na lista ativa) — ver useConversations.js.
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
  onLoadMore,
  hasMore,
  loadingMore,
  closedConversations = [],
  closedHasMore = false,
  closedLoadingMore = false,
  onLoadClosed,
  onLoadMoreClosed,
  currentUserId,
  onAttend,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('queue');

  const isClosedTab = activeTab === 'closed';
  const sourceList = isClosedTab ? closedConversations : conversations;

  const tabList = sourceList.filter((conv) => {
    if (activeTab === 'queue') return conv.status === 'WAITING';
    if (activeTab === 'mine') return conv.status === 'OPEN' && conv.agentId === currentUserId;
    if (activeTab === 'open') return conv.status === 'OPEN';
    return true; // closed: já vem filtrado do servidor
  });

  const filteredConversations = tabList.filter((conv) =>
    conv.contact.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Contagens rápidas nas abas (menos a de encerrados, que não tem custo
  // baixo pra calcular sem já ter carregado a aba pelo menos uma vez).
  const queueCount = conversations.filter((c) => c.status === 'WAITING').length;
  const mineCount = conversations.filter((c) => c.status === 'OPEN' && c.agentId === currentUserId).length;
  const openCount = conversations.filter((c) => c.status === 'OPEN').length;
  const tabCounts = { queue: queueCount, mine: mineCount, open: openCount, closed: closedConversations.length };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'closed') onLoadClosed?.();
  };

  // Scroll infinito (B-4/B-31) — "Encerrados" pagina a busca própria dela;
  // as outras 3 abas recarregam a mesma lista ativa (só filtram diferente
  // no cliente, ver comentário no topo do arquivo — não é 100% preciso por
  // aba, mas mantém a paginação real existente sem duplicar o fetch).
  const handleScroll = (e) => {
    if (searchTerm) return;
    const loadMoreFn = isClosedTab ? onLoadMoreClosed : onLoadMore;
    const hasMoreFlag = isClosedTab ? closedHasMore : hasMore;
    const loadingFlag = isClosedTab ? closedLoadingMore : loadingMore;
    if (!loadMoreFn || !hasMoreFlag || loadingFlag) return;

    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < LOAD_MORE_THRESHOLD_PX) {
      loadMoreFn();
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
      { className: 'queue-tabs', role: 'tablist', 'aria-label': 'Etapas de atendimento' },
      TABS.map((tab) =>
        h(
          'button',
          {
            key: tab.id,
            type: 'button',
            role: 'tab',
            className: `queue-tab${activeTab === tab.id ? ' active' : ''}`,
            'aria-selected': activeTab === tab.id,
            onClick: () => handleTabClick(tab.id),
          },
          h('span', { className: 'queue-tab-label' }, tab.label),
          tabCounts[tab.id] > 0 && h('span', { className: 'queue-tab-count' }, tabCounts[tab.id]),
        ),
      ),
    ),
    h('input', {
      type: 'search',
      className: 'search-input',
      placeholder: 'Buscar...',
      value: searchTerm,
      onChange: (e) => setSearchTerm(e.target.value),
      'aria-label': 'Buscar conversa',
    }),
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
                conv.slaBreached &&
                  h(
                    'span',
                    { className: 'queue-item-sla-badge' },
                    h(Icon, { name: 'warning', size: 11 }),
                    ' SLA',
                  ),
              ),
              h('div', { className: 'queue-item-preview' },
                (conv.messages && conv.messages[conv.messages.length - 1]?.text) ||
                conv.summary ||
                'Sem mensagens'
              ),
              activeTab !== 'queue' && conv.agent &&
                h('div', { className: 'queue-item-agent' }, h(Icon, { name: 'user', size: 11 }), ` ${conv.agent}`),
            ),
            activeTab === 'queue'
              ? h('button', {
                  type: 'button',
                  className: 'queue-item-attend',
                  onClick: (e) => handleAttend(e, conv.id),
                  title: 'Assumir esta conversa',
                }, 'Atender')
              : h('div', { className: 'queue-item-time' }, conv.wait || ''),
          ),
        )
      ) : (
        h('div', { className: 'queue-empty' }, EMPTY_MESSAGES[activeTab])
      ),
      loadingMore && !isClosedTab &&
        h('div', { className: 'queue-loading-more' }, 'Carregando mais conversas…'),
      closedLoadingMore && isClosedTab &&
        h('div', { className: 'queue-loading-more' }, 'Carregando mais conversas…'),
    ),
  );
}
