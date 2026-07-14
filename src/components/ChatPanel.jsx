import { createElement as h, useRef, useEffect } from 'react';

export function ChatPanel({ conversation, draft, onDraftChange, onSend }) {
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [conversation.messages]);

  function handleKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      onSend();
    }
  }

  return h(
    'article',
    { className: 'chat-panel', 'aria-label': 'Conversa selecionada' },
    h(
      'header',
      { className: 'chat-header' },
      h(
        'div',
        { className: 'chat-person' },
        h('span', { className: `avatar ${conversation.tone}`, 'aria-hidden': 'true' }, conversation.initials),
        h('div', null,
          h('p', { className: 'eyebrow' }, conversation.channel),
          h('h2', null, conversation.contact),
        ),
      ),
      h(
        'div',
        { className: 'chat-actions' },
        h('span', { className: 'status-pill' }, conversation.status),
        h('button', { className: 'icon-button small', type: 'button', 'aria-label': 'Mais opções' }, '⋯'),
      ),
    ),
    h(
      'div',
      { className: 'message-date' },
      h('span', null, 'Hoje'),
    ),
    h(
      'div',
      {
        ref: messagesRef,
        className: 'messages',
        role: 'log',
        'aria-live': 'polite',
        'aria-label': 'Mensagens da conversa',
      },
      conversation.messages.map(({ id, type, text, time }) =>
        h(
          'div',
          { key: id, className: `message ${type}` },
          h('span', null, text, h('small', null, time)),
        ),
      ),
    ),
    h(
      'footer',
      { className: 'composer' },
      h(
        'div',
        { className: 'quick-replies', 'aria-label': 'Respostas rápidas' },
        ['Confirmar dados', 'Enviar rastreio', 'Encaminhar', 'Finalizar'].map((reply) =>
          h(
            'button',
            {
              key: reply,
              type: 'button',
              onClick: () => onDraftChange(reply),
            },
            reply,
          ),
        ),
      ),
      h(
        'div',
        { className: 'composer-box' },
        h('label', { className: 'sr-only', htmlFor: 'message-input' }, 'Mensagem'),
        h('textarea', {
          id: 'message-input',
          rows: 3,
          placeholder: 'Digite uma resposta ou use um modelo salvo (Ctrl+Enter para enviar)',
          value: draft,
          onChange: (event) => onDraftChange(event.target.value),
          onKeyDown: handleKeyDown,
        }),
      ),
      h(
        'div',
        { className: 'composer-actions' },
        h('button', { className: 'ghost-button', type: 'button' }, 'Anexar'),
        h(
          'button',
          {
            className: 'send-button',
            type: 'button',
            onClick: onSend,
            disabled: !draft.trim(),
            'aria-label': 'Enviar mensagem',
          },
          'Enviar',
        ),
      ),
    ),
  );
}
