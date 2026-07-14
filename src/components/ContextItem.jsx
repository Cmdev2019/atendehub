import { createElement as h } from 'react';

export function ContextItem({ label, value }) {
  return h(
    'div',
    { className: 'context-item' },
    h('span', null, label),
    h('strong', null, value),
  );
}
