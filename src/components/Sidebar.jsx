import { createElement as h } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Icon } from './icons';

// WhatsApp/Conectar e o tema saíram do menu vertical — agora vivem em
// Configurações, junto com usuários, grupos e níveis de acesso.
const menuItems = [
  { id: 'inbox', label: 'Caixa de Entrada', shortLabel: 'Mensagens', icon: 'chat', badge: '' },
  { id: 'contacts', label: 'Contatos', shortLabel: 'Contatos', icon: 'users', badge: '' },
  { id: 'funnels', label: 'Funis', shortLabel: 'Funis', icon: 'funnel', badge: '' },
  { id: 'reports', label: 'Relatórios', shortLabel: 'Relatórios', icon: 'chart', badge: '' },
  { id: 'settings', label: 'Configurações', shortLabel: 'Config', icon: 'settings', badge: '' },
];

// Itens que já possuem uma tela correspondente
const NAVIGABLE = new Set(['inbox', 'settings']);

export function Sidebar({ activeView = 'inbox', onNavigate }) {
  const { logout } = useAuth();

  const handleLogout = async () => {
    if (confirm('Deseja fazer logout?')) {
      await logout();
    }
  };

  const handleClick = (id) => {
    if (NAVIGABLE.has(id) && onNavigate) {
      onNavigate(id);
    }
  };

  return h(
    'aside',
    { className: 'sidebar', 'aria-label': 'Navegação principal' },

    // Menu principal
    h(
      'nav',
      { className: 'nav-menu' },
      menuItems.map(({ id, label, shortLabel, icon, badge }) =>
        h(
          'button',
          {
            key: id,
            className: `nav-item${activeView === id ? ' active' : ''}`,
            onClick: () => handleClick(id),
            type: 'button',
            title: NAVIGABLE.has(id) ? label : `${label} (em breve)`,
            disabled: !NAVIGABLE.has(id),
          },
          h('span', { className: 'nav-icon' }, h(Icon, { name: icon, size: 20 })),
          h('span', { className: 'nav-label' }, shortLabel),
          badge && h('span', { className: 'badge' }, badge),
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
      h(Icon, { name: 'logout', size: 16 }),
      ' Sair',
    ),
  );
}
