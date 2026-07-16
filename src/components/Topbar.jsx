import { createElement as h } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Logo } from './Logo';

// O toggle de tema saiu daqui — agora fica em Configurações → Aparência.
export function Topbar({ title = 'Caixa de Entrada', onOpenSettings }) {
  const { logout, user } = useAuth();

  const handleLogout = async () => {
    if (confirm('Deseja fazer logout?')) {
      await logout();
    }
  };

  return h(
    'header',
    { className: 'topbar' },
    h(
      'div',
      { className: 'topbar-brand' },
      h(Logo, { size: 36 }),
      h('strong', null, 'AtendeHub'),
    ),
    h(
      'div',
      { className: 'topbar-title' },
      h('h2', null, title),
    ),
    h(
      'div',
      { className: 'topbar-actions' },
      user && h('span', { className: 'user-display' }, `👤 ${user.name}`),
      h('button', { className: 'icon-btn', title: 'Notificações', type: 'button' }, '🔔'),
      h('button',
        {
          className: 'icon-btn',
          title: 'Configurações',
          type: 'button',
          onClick: onOpenSettings,
        },
        '⚙️'
      ),
      h('button',
        {
          className: 'btn-logout',
          onClick: handleLogout,
          type: 'button',
          title: 'Fazer logout'
        },
        '🚪 Sair'
      ),
    ),
  );
}
