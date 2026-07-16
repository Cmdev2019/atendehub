import { createElement as h } from 'react';
import { Icon } from './icons';

export function CustomerPanel({ conversation }) {
  const getInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return h(
    'aside',
    { className: 'customer-panel' },
    h(
      'section',
      { className: 'customer-head' },
      h('div', { className: 'customer-head-avatar' },
        conversation.avatarUrl
          ? h('img', { src: conversation.avatarUrl, alt: '', className: 'avatar-img' })
          : getInitials(conversation.contact)),
      h('h3', null, conversation.contact),
      h('p', { className: 'info-label' }, conversation.phone || 'Sem telefone'),
    ),
    h(
      'section',
      { className: 'info-section' },
      h('h3', null, h(Icon, { name: 'clipboard', size: 15 }), ' Informações'),
      h(
        'div',
        { className: 'info-item' },
        h('div', { className: 'info-label' }, 'Responsável'),
        h('div', null, conversation.agent || '-'),
      ),
      h(
        'div',
        { className: 'info-item' },
        h('div', { className: 'info-label' }, 'Canal'),
        h('div', null, h(Icon, { name: 'smartphone', size: 13 }), ` ${conversation.channel}`),
      ),
      h(
        'div',
        { className: 'info-item' },
        h('div', { className: 'info-label' }, 'Tempo em fila'),
        h('div', null, conversation.wait || '-'),
      ),
    ),
    h(
      'section',
      { className: 'info-section' },
      h('h3', null, h(Icon, { name: 'tag', size: 15 }), ' Tags'),
      h(
        'div',
        { className: 'tag-list' },
        (conversation.tags || []).length > 0 ? (
          conversation.tags.map((tag) =>
            h('span', { key: tag, className: 'tag' }, tag),
          )
        ) : (
          h('span', { className: 'info-label' }, 'Sem tags')
        ),
      ),
    ),
    h(
      'section',
      { className: 'info-section' },
      h('h3', null, h(Icon, { name: 'clock', size: 15 }), ' Histórico'),
      h(
        'ol',
        { className: 'timeline', style: { paddingLeft: '16px', fontSize: '0.85rem' } },
        (conversation.timeline || []).length > 0 ? (
          conversation.timeline.map((item, idx) =>
            h('li', { key: idx, style: { marginBottom: '8px', color: '#687386' } }, item),
          )
        ) : (
          h('li', { style: { color: '#687386' } }, 'Nenhum histórico')
        ),
      ),
    ),
  );
}
