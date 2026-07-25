import { createElement as h, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { useNotifications } from '../hooks/useNotifications';

const TYPE_ICON = {
  sla_breach: 'warning',
  conversation_assigned: 'chat',
};

function formatRelativeTime(isoDate) {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

// Sino de notificações (B-8) — o backend expõe GET/PATCH /notifications
// desde B1-3, mas nenhum componente do frontend consumia; este é o 1º.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const { notifications, unreadCount, loading, error, fetchNotifications, markAsRead, markAllAsRead } =
    useNotifications();

  // Fecha ao clicar fora do sino/painel
  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) fetchNotifications();
      return next;
    });
  };

  return h(
    'div',
    { className: 'notification-bell', ref: containerRef },
    h(
      'button',
      {
        className: 'icon-btn',
        title: 'Notificações',
        type: 'button',
        'aria-haspopup': 'true',
        'aria-expanded': open,
        onClick: toggleOpen,
      },
      h(Icon, { name: 'bell', size: 18, label: 'Notificações' }),
      unreadCount > 0 &&
        h('span', { className: 'notification-badge' }, unreadCount > 99 ? '99+' : String(unreadCount)),
    ),
    open &&
      h(
        'div',
        { className: 'notification-panel', role: 'menu' },
        h(
          'div',
          { className: 'notification-panel-header' },
          h('strong', null, 'Notificações'),
          unreadCount > 0 &&
            h(
              'button',
              { className: 'notification-mark-all', type: 'button', onClick: markAllAsRead },
              'Marcar todas como lidas',
            ),
        ),
        loading &&
          notifications.length === 0 &&
          h('p', { className: 'notification-empty' }, 'Carregando…'),
        error && h('p', { className: 'notification-empty notification-error' }, error),
        !loading &&
          !error &&
          notifications.length === 0 &&
          h('p', { className: 'notification-empty' }, 'Nenhuma notificação por aqui.'),
        h(
          'ul',
          { className: 'notification-list' },
          notifications.map((n) =>
            h(
              'li',
              {
                key: n.id,
                className: `notification-item${n.readAt ? '' : ' unread'}`,
                role: 'menuitem',
                tabIndex: 0,
                onClick: () => !n.readAt && markAsRead(n.id),
                onKeyDown: (e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !n.readAt) markAsRead(n.id);
                },
              },
              h(Icon, { name: TYPE_ICON[n.type] || 'bell', size: 16 }),
              h(
                'div',
                { className: 'notification-item-body' },
                h('span', { className: 'notification-item-title' }, n.title),
                n.body && h('span', { className: 'notification-item-text' }, n.body),
                h('span', { className: 'notification-item-time' }, formatRelativeTime(n.createdAt)),
              ),
              !n.readAt && h('span', { className: 'notification-dot', 'aria-hidden': 'true' }),
            ),
          ),
        ),
      ),
  );
}
