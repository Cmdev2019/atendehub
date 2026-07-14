import { createElement as h, useRef, useEffect, useState } from 'react';

export function ChatPanel({ conversation, draft, onDraftChange, onSend }) {
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [conversation.messages]);

  function handleKeyDown(event) {
    // Enter sozinho = enviar
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
    // Shift+Enter = nova linha
  }

  function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    const newAttachments = files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setAttachments([...attachments, ...newAttachments]);
  }

  function removeAttachment(index) {
    setAttachments(attachments.filter((_, i) => i !== index));
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
    // Attachments preview
    attachments.length > 0 && h(
      'div',
      { className: 'attachments-preview' },
      attachments.map((file, index) =>
        h(
          'div',
          { key: index, className: 'attachment-item' },
          file.preview ? (
            h('img', { src: file.preview, alt: file.name, className: 'attachment-image' })
          ) : (
            h('div', { className: 'attachment-icon' }, '📎')
          ),
          h('div', { className: 'attachment-info' },
            h('div', { className: 'attachment-name' }, file.name),
            h('div', { className: 'attachment-size' }, `${(file.size / 1024).toFixed(0)} KB`),
          ),
          h(
            'button',
            {
              className: 'attachment-remove',
              onClick: () => removeAttachment(index),
              type: 'button',
              title: 'Remover arquivo'
            },
            '✕'
          ),
        ),
      ),
    ),

    h(
      'footer',
      { className: 'composer' },
      h('input', {
        ref: fileInputRef,
        type: 'file',
        multiple: true,
        onChange: handleFileSelect,
        style: { display: 'none' },
        accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt',
      }),
      h(
        'button',
        {
          className: 'attach-button',
          type: 'button',
          onClick: () => fileInputRef.current?.click(),
          title: 'Anexar arquivo ou imagem',
        },
        '📎'
      ),
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
          disabled: !draft.trim() && attachments.length === 0,
          title: 'Enviar (Enter)',
        },
        '📤',
      ),
    ),
  );
}
