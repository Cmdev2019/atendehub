import { createElement as h } from 'react';

export function Topbar() {
  return h(
    'header',
    { className: 'topbar' },
    h(
      'div',
      null,
      h('p', { className: 'eyebrow' }, 'Central operacional'),
      h('h1', null, 'Caixa de entrada unificada'),
    ),
    h(
      'div',
      { className: 'topbar-actions' },
      h('button', { className: 'icon-button', type: 'button', 'aria-label': 'Pesquisar' }, '⌕'),
      h('button', { className: 'ghost-button', type: 'button' }, 'Transferir'),
      h('button', { className: 'primary-button', type: 'button' }, 'Novo atendimento'),
    ),
  );
}
