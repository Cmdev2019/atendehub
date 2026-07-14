import { createElement as h } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

export function Topbar() {
  const { logout, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();

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
      h('span', { className: 'brand-mark' }, 'A'),
      h('strong', null, 'AtendeHub'),
    ),
    h(
      'div',
      { className: 'topbar-title' },
      h('h2', null, 'Caixa de Entrada'),
    ),
    h(
      'div',
      { className: 'topbar-actions' },
      user && h('span', { className: 'user-display' }, `👤 ${user.name}`),
      h('button', { className: 'icon-btn', title: 'Notificações' }, '🔔'),
      h('button',
        {
          className: 'icon-btn',
          title: isDark ? 'Modo claro' : 'Modo escuro',
          onClick: toggleTheme,
          type: 'button'
        },
        isDark ? '☀️' : '🌙'
      ),
      h('button', { className: 'icon-btn', title: 'Configurações' }, '⚙️'),
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
