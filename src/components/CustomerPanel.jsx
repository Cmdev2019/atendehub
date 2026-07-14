import { createElement as h } from 'react';
import { ContextItem } from './ContextItem';

export function CustomerPanel({ conversation }) {
  return h(
    'aside',
    { className: 'customer-panel', 'aria-label': 'Contexto do cliente' },
    h(
      'section',
      { className: 'customer-head' },
      h('span', { className: `avatar large ${conversation.tone}`, 'aria-hidden': 'true' }, conversation.initials),
      h('div', null,
        h('h2', null, conversation.contact),
        h('p', null, conversation.phone),
      ),
    ),
    h(
      'section',
      { className: 'context-grid', 'aria-label': 'Dados do atendimento' },
      h(ContextItem, { label: 'Responsável', value: conversation.agent }),
      h(ContextItem, { label: 'SLA', value: conversation.wait }),
      h(ContextItem, { label: 'Valor', value: conversation.value }),
      h(ContextItem, { label: 'Canal', value: conversation.channel }),
    ),
    h(
      'section',
      { className: 'info-section' },
      h('h3', null, 'Tags'),
      h(
        'div',
        { className: 'tag-list' },
        conversation.tags.map((tag) => h('span', { key: tag }, tag)),
      ),
    ),
    h(
      'section',
      { className: 'info-section' },
      h('h3', null, 'Histórico'),
      h(
        'ol',
        { className: 'timeline' },
        conversation.timeline.map((item) => h('li', { key: item }, item)),
      ),
    ),
    h(
      'section',
      { className: 'info-section' },
      h('h3', null, 'Ações rápidas'),
      h('button', { className: 'wide-action', type: 'button' }, 'Criar tarefa'),
      h('button', { className: 'wide-action', type: 'button' }, 'Mover para funil'),
      h('button', { className: 'wide-action danger', type: 'button' }, 'Finalizar conversa'),
    ),
  );
}
