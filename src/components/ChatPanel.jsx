import { createElement as h, useRef, useEffect } from 'react';

export function ChatPanel({ conversation, draft, onDraftChange, onSend }) {
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);

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

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return h(
    'article',
    { className: 'chat-panel' },
    h(
      'header',
      { className: 'chat-header' },
      h(
        'div',
        { className: 'chat-person' },
        h('div', { className: 'chat-header-avatar' }, getInitials(conversation.contact)),
        h(
          'div',
          { className: 'chat-info' },
          h('h3', null, conversation.contact),
          h('p', null, `📱 ${conversation.channel}`),
        ),
      ),
      h('button', { className: 'icon-btn', type: 'button', title: 'Mais opções' }, '⋯'),
    ),
    h(
      'div',
      {
        ref: messagesRef,
        className: 'chat-messages',
        role: 'log',
        'aria-live': 'polite',
      },
      conversation.messages.map(({ id, type, text, time }) =>
        h(
          'div',
          { key: id, className: `message ${type}` },
          h('div', { className: 'message-bubble' }, text),
          h('div', { className: 'message-time' }, time),
        ),
      ),
    ),
    h(
      'footer',
      { className: 'composer' },
      h(
        'textarea',
        {
          ref: textareaRef,
          className: 'composer-input',
          placeholder: 'Escrever mensagem...',
          value: draft,
          onChange: (e) => {
            onDraftChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
          },
          onKeyDown: handleKeyDown,
          rows: 1,
        },
      ),
      h(
        'button',
        {
          className: 'send-button',
          type: 'button',
          onClick: onSend,
          disabled: !draft.trim(),
          title: 'Enviar mensagem (Ctrl+Enter)',
        },
        '📤',
      ),
    ),
  );
}
