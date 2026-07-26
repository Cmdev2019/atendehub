import { createElement as h, useState } from 'react';
import { Icon } from './icons';

export function CustomerPanel({ conversation, availableTags = [], onAddTag, onRemoveTag }) {
  const [tagToAdd, setTagToAdd] = useState('');
  const assignedTagIds = new Set((conversation.tags || []).map((t) => t.id));
  const selectableTags = availableTags.filter((t) => !assignedTagIds.has(t.id));

  const handleAddTag = (e) => {
    const tagId = e.target.value;
    setTagToAdd('');
    if (tagId && onAddTag) onAddTag(tagId);
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
      // Justificativa do cancelamento (B-36) — só existe pra resolution
      // CANCELLED; RESOLVED/UNRESOLVED não pedem explicação nenhuma.
      conversation.resolution === 'CANCELLED' &&
        conversation.resolutionNote &&
        h(
          'div',
          { className: 'info-item' },
          h('div', { className: 'info-label' }, 'Motivo do cancelamento'),
          h('div', null, conversation.resolutionNote),
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
            h(
              'span',
              { key: tag.id, className: 'tag', style: { backgroundColor: tag.color || undefined } },
              tag.name,
              onRemoveTag &&
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'tag-remove',
                    onClick: () => onRemoveTag(tag.id),
                    title: `Remover tag "${tag.name}"`,
                    'aria-label': `Remover tag ${tag.name}`,
                  },
                  h(Icon, { name: 'x', size: 10 }),
                ),
            ),
          )
        ) : (
          h('span', { className: 'info-label' }, 'Sem tags')
        ),
      ),
      onAddTag &&
        selectableTags.length > 0 &&
        h(
          'select',
          {
            className: 'tag-add-select',
            value: tagToAdd,
            onChange: handleAddTag,
            'aria-label': 'Adicionar tag à conversa',
          },
          h('option', { value: '' }, '+ Adicionar tag…'),
          selectableTags.map((tag) => h('option', { key: tag.id, value: tag.id }, tag.name)),
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
