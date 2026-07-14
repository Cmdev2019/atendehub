import { createElement as h } from 'react';

export function ConversationQueue({ activeId, conversations, onSelect }) {
  return h(
    'div',
    { className: 'queue', 'aria-label': 'Lista de conversas' },
    h(
      'div',
      { className: 'section-header' },
      h('div', null,
        h('h2', null, 'Atendimentos'),
        h('small', null, 'Fila por prioridade e SLA'),
      ),
      h('button', { type: 'button' }, 'Filtrar'),
    ),
    h(
      'div',
      { className: 'search-box' },
      h('span', { 'aria-hidden': 'true' }, '⌕'),
      h('input', {
        type: 'search',
        placeholder: 'Buscar contato, canal ou tag',
        'aria-label': 'Buscar conversa',
      }),
    ),
    h(
      'div',
      { className: 'queue-tabs', role: 'tablist', 'aria-label': 'Filtros de fila' },
      ['Todas', 'Minhas', 'Aguardando'].map((tab, index) =>
        h('button', {
          key: tab,
          className: index === 0 ? 'active' : '',
          type: 'button',
          role: 'tab',
          'aria-selected': index === 0,
        }, tab),
      ),
    ),
    h(
      'div',
      { className: 'conversation-list' },
      conversations.map((conv) =>
        h(
          'button',
          {
            key: conv.id,
            className: `conversation${activeId === conv.id ? ' active' : ''}`,
            type: 'button',
            'aria-current': activeId === conv.id ? 'true' : undefined,
            onClick: () => onSelect(conv.id),
          },
          h('span', { className: `avatar ${conv.tone}`, 'aria-hidden': 'true' }, conv.initials),
          h(
            'span',
            { className: 'conversation-main' },
            h(
              'span',
              { className: 'conversation-title' },
              h('strong', null, conv.contact),
              h('em', null, conv.wait),
            ),
            h('small', null, conv.summary),
            h(
              'span',
              { className: 'conversation-meta' },
              h('b', null, conv.channel),
              h('span', null, conv.agent),
            ),
          ),
          h(
            'span',
            { className: `badge${conv.badge === 'Urgente' ? ' urgent' : ''}` },
            conv.badge,
          ),
        ),
      ),
    ),
  );
}
