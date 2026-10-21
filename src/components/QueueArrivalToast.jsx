import { createElement as h, useEffect, useState } from 'react';
import { Icon } from './icons';
import { wsClient } from '../services/websocket';

// Quanto tempo o aviso fica na tela antes de sumir sozinho
export const ARRIVAL_TOAST_MS = 8000;

// B-68 (ADR-0019, regra 10): aviso de conversa nova na fila — só para quem
// está Online. Offline continua vendo a lista, mas não é chamado. O evento
// `conversation.created` já chega só a quem enxerga o setor da conversa (B-40).
export function QueueArrivalToast({ online, onAttend }) {
  const [arrival, setArrival] = useState(null);

  useEffect(() => {
    if (!online) {
      setArrival(null);
      return undefined;
    }
    return wsClient.on('conversation.created', (payload) => {
      const conversation = payload?.conversation;
      if (!conversation || conversation.status !== 'WAITING') return;
      setArrival({
        id: conversation.id,
        contact: conversation.contact?.name || conversation.contact?.phone || 'Contato',
      });
    });
  }, [online]);

  useEffect(() => {
    if (!arrival) return undefined;
    const timer = setTimeout(() => setArrival(null), ARRIVAL_TOAST_MS);
    return () => clearTimeout(timer);
  }, [arrival]);

  if (!arrival) return null;

  return h(
    'div',
    { className: 'arrival-toast', role: 'status', 'aria-live': 'polite' },
    h(Icon, { name: 'bell', size: 16 }),
    h(
      'div',
      { className: 'arrival-toast-text' },
      h('strong', null, 'Nova conversa na fila'),
      h('span', null, arrival.contact),
    ),
    h('button', {
      type: 'button',
      className: 'arrival-toast-attend',
      onClick: () => {
        onAttend?.(arrival.id);
        setArrival(null);
      },
    }, 'Atender'),
    h('button', {
      type: 'button',
      className: 'arrival-toast-close',
      onClick: () => setArrival(null),
      title: 'Fechar aviso',
    }, h(Icon, { name: 'x', size: 12, label: 'Fechar aviso' })),
  );
}
