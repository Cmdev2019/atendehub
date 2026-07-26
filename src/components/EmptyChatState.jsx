import { createElement as h } from 'react';
import { Icon } from './icons';

// Estado vazio da área de chat (B-36, pedido do usuário) — antes, sem
// conversa selecionada (ex.: logo após encerrar, que agora limpa
// `activeId`), a área central simplesmente não renderizava nada.
export function EmptyChatState() {
  return h(
    'div',
    { className: 'empty-chat-state' },
    h(Icon, { name: 'chat', size: 48, className: 'empty-chat-state-icon' }),
    h('p', null, 'Nenhuma mensagem no momento'),
  );
}
