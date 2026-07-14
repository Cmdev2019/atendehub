import { createElement as h } from 'react';

const modules = [
  { label: 'Caixa de entrada', amount: '34' },
  { label: 'Automações', amount: '8' },
  { label: 'Contatos', amount: '' },
  { label: 'Funis', amount: '' },
  { label: 'Relatórios', amount: '' },
  { label: 'Configurações', amount: '' },
];

const channels = [
  { type: 'whatsapp', label: 'WhatsApp', amount: 18 },
  { type: 'instagram', label: 'Instagram', amount: 7 },
  { type: 'email', label: 'E-mail', amount: 5 },
  { type: 'site', label: 'Chat site', amount: 4 },
];

export function Sidebar() {
  return h(
    'aside',
    { className: 'sidebar', 'aria-label': 'Navegação principal' },
    h(
      'div',
      { className: 'brand' },
      h('span', { className: 'brand-mark', 'aria-hidden': 'true' }, 'A'),
      h('div', null,
        h('strong', null, 'AtendeHub'),
        h('span', null, 'Omnichannel inbox'),
      ),
    ),
    h(
      'nav',
      { className: 'nav-list' },
      modules.map(({ label, amount }, index) =>
        h(
          'button',
          {
            key: label,
            className: `nav-item${index === 0 ? ' active' : ''}`,
            type: 'button',
          },
          h('span', null, label),
          amount ? h('strong', null, amount) : null,
        ),
      ),
    ),
    h(
      'section',
      { className: 'channel-panel', 'aria-labelledby': 'channels-title' },
      h('h2', { id: 'channels-title' }, 'Canais conectados'),
      channels.map(({ type, label, amount }) =>
        h(
          'div',
          { key: type, className: 'channel-row' },
          h('span', { className: `dot ${type}`, 'aria-hidden': 'true' }),
          h('span', null, label),
          h('strong', null, amount),
        ),
      ),
    ),
  );
}
