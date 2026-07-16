import { createElement as h, useState } from 'react';
import { Icon } from './icons';

export function ConversationQueue({ activeId, conversations, onSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const filteredConversations = conversations.filter(conv =>
    conv.contact.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      { className: 'queue-list' },
      filteredConversations.length > 0 ? (
        filteredConversations.map((conv) =>
          h(
            'button',
            {
              key: conv.id,
              className: `queue-item${activeId === conv.id ? ' active' : ''}`,
              type: 'button',
              onClick: () => onSelect(conv.id),
              title: conv.contact,
            },
            h('div', { className: 'queue-item-avatar' }, getInitials(conv.contact)),
            h(
              'div',
              { className: 'queue-item-content' },
              h('div', { className: 'queue-item-name' }, conv.contact),
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
    ),
  );
}
