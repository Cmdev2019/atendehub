import { createElement as h, useSyncExternalStore } from 'react';
import { wsClient } from '../services/websocket';
import { Icon } from './icons';

// Aviso de conexão em tempo real perdida (B-74 / M-09). Antes, o WebSocket
// caía em silêncio: o painel parava de receber mensagens sem nenhum sinal na
// tela. Some sozinho quando o socket volta — e a lista é recarregada.
export function RealtimeStatusBanner() {
  const status = useSyncExternalStore(wsClient.onStatusChange, wsClient.getStatus);

  if (status !== 'reconnecting') return null;

  return h(
    'div',
    { className: 'realtime-banner', role: 'status' },
    h(Icon, { name: 'refresh', size: 15 }),
    ' Reconectando ao tempo real — as conversas podem estar desatualizadas',
  );
}
