import { createElement as h } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useConfirm } from '../hooks/useConfirm';
import { Icon } from './icons';

// WhatsApp/Conectar e o tema saíram do menu vertical — agora vivem em
// Configurações, junto com usuários, grupos e níveis de acesso.
// B-32: "Funis" (nunca teve tela) virou "Dashboard" — 1ª opção do menu,
// antes da Caixa de Entrada (pedido do usuário: dashboard é a 1ª tela).
const menuItems = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: 'chart', badge: '' },
  { id: 'inbox', label: 'Caixa de Entrada', shortLabel: 'Mensagens', icon: 'chat', badge: '' },
  { id: 'contacts', label: 'Contatos', shortLabel: 'Contatos', icon: 'users', badge: '' },
  { id: 'reports', label: 'Relatórios', shortLabel: 'Relatórios', icon: 'clipboard', badge: '' },
  { id: 'settings', label: 'Configurações', shortLabel: 'Config', icon: 'settings', badge: '' },
];

// Itens que já possuem uma tela correspondente
const NAVIGABLE = new Set(['dashboard', 'inbox', 'contacts', 'reports', 'settings']);

export function Sidebar({ activeView = 'inbox', onNavigate }) {
  const { logout } = useAuth();
  const confirm = useConfirm();

  const handleLogout = async () => {
    if (await confirm('Deseja fazer logout?')) {
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
            // B-14: a seção ativa só era indicada por CSS (.active) — sem
            // aria-current, leitor de tela não sabia qual item estava selecionado.
            'aria-current': activeView === id ? 'page' : undefined,
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
