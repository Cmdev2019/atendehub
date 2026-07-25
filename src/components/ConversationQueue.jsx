import { createElement as h, useState } from 'react';
import { Icon } from './icons';

// Distância (px) do fim da lista que já dispara a busca da próxima página —
// carrega antes do usuário bater no fim de verdade, pra parecer contínuo.
const LOAD_MORE_THRESHOLD_PX = 150;

export function ConversationQueue({
  activeId,
  conversations,
  onSelect,
  onLoadMore,
  hasMore,
  loadingMore,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const filteredConversations = conversations.filter(conv =>
    conv.contact.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Scroll infinito (B-4) — só dispara na lista sem filtro de busca: com
  // busca ativa, "chegar perto do fim" é do resultado filtrado (menor que o
  // total real), não sinal de que falta carregar mais do servidor.
  const handleScroll = (e) => {
    if (searchTerm || !onLoadMore || !hasMore || loadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < LOAD_MORE_THRESHOLD_PX) {
      onLoadMore();
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

  return h(
    'div',
    { className: 'queue' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', null, h(Icon, { name: 'chat', size: 16 }), ' Conversas'),
      h('button', { type: 'button', className: 'icon-btn small' },
        h(Icon, { name: 'search', size: 15, label: 'Buscar' })),
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
            'button',
            {
              key: conv.id,
              className: `queue-item${activeId === conv.id ? ' active' : ''}${conv.slaBreached ? ' sla-breached' : ''}`,
              type: 'button',
              onClick: () => onSelect(conv.id),
              title: conv.slaBreached ? `${conv.contact} — SLA de espera estourado` : conv.contact,
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
            ),
            h('div', { className: 'queue-item-time' }, conv.wait || ''),
          ),
        )
      ) : (
        h('div', { style: { padding: '20px', textAlign: 'center', color: '#687386' } }, 'Nenhuma conversa')
      ),
      loadingMore &&
        h('div', { className: 'queue-loading-more' }, 'Carregando mais conversas…'),
    ),
  );
}
