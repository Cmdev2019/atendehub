import { createElement as h, useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const menuItems = [
  { id: 'inbox', label: '📥 Caixa de entrada', icon: '💬', badge: '34' },
  { id: 'automations', label: '🤖 Automações', icon: '⚙️', badge: '8' },
  { id: 'contacts', label: '👥 Contatos', icon: '👤', badge: '' },
  { id: 'funnels', label: '📊 Funis', icon: '📈', badge: '' },
  { id: 'reports', label: '📈 Relatórios', icon: '📊', badge: '' },
  { id: 'settings', label: '⚙️ Configurações', icon: '🔧', badge: '' },
];

const channels = [
  { type: 'whatsapp', label: 'WhatsApp', amount: 18 },
  { type: 'instagram', label: 'Instagram', amount: 7 },
  { type: 'email', label: 'E-mail', amount: 5 },
  { type: 'site', label: 'Chat site', amount: 4 },
];

export function Sidebar() {
  const [activeMenu, setActiveMenu] = useState('inbox');
  const { logout } = useAuth();

  const handleLogout = async () => {
    if (confirm('Deseja fazer logout?')) {
      await logout();
    }
  };

  return h(
    'aside',
    { className: 'sidebar', 'aria-label': 'Navegação principal' },

    // Menu principal
    h(
      'nav',
      { className: 'nav-menu' },
      menuItems.map(({ id, label, icon, badge }) =>
        h(
          'button',
          {
            key: id,
            className: `nav-item${activeMenu === id ? ' active' : ''}`,
            onClick: () => setActiveMenu(id),
            type: 'button',
            title: label,
          },
          h('span', { className: 'nav-icon' }, icon),
          h('span', { className: 'nav-label' }, label.split(' ')[1] || label),
          badge && h('span', { className: 'badge' }, badge),
        ),
      ),
    ),

    // Canais conectados
    h(
      'section',
      { className: 'channels-section' },
      h('h3', { className: 'channels-title' }, '📡 Canais'),
      channels.map(({ type, label, amount }) =>
        h(
          'div',
          { key: type, className: 'channel-item' },
          h('span', { className: `channel-dot ${type}` }),
          h('span', { className: 'channel-label' }, label),
          h('span', { className: 'channel-badge' }, amount),
        ),
      ),
    ),

    // Botão de logout
    h(
      'button',
      {
        className: 'btn-sidebar-logout',
        onClick: handleLogout,
        type: 'button',
        title: 'Fazer logout do sistema'
      },
      '🚪 Sair',
    ),
  );
}
