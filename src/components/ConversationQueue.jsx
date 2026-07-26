import { createElement as h, useState } from 'react';
import { Icon } from './icons';

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
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('queue');

  const sourceList = activeTab === 'closed' ? closedConversations : conversations;

  const tabList = sourceList.filter((conv) => {
    if (activeTab === 'queue') return conv.status === 'WAITING';
    if (activeTab === 'mine') return conv.status === 'OPEN' && conv.agentId === currentUserId;
    if (activeTab === 'open') return conv.status === 'OPEN';
    return true; // closed: já vem filtrado do servidor
  });

  const filteredConversations = tabList.filter((conv) =>
    conv.contact.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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
      tabPaging[activeTab].loadingMore &&
        h('div', { className: 'queue-loading-more' }, 'Carregando mais conversas…'),
    ),
  );
}
