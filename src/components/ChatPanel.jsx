import { createElement as h, useRef, useEffect, useState } from 'react';
import { Icon } from './icons';

const MEDIA_LABELS = {
  IMAGE: 'Foto',
  STICKER: 'Figurinha',
  AUDIO: 'Mensagem de voz',
  VIDEO: 'Vídeo',
  DOCUMENT: 'Documento',
  LOCATION: 'Localização',
  CONTACT_CARD: 'Contato',
};

// Conteúdo do balão: anexos (imagem/figurinha inline, áudio/vídeo com player,
// resto como link), placeholder para mídia ainda não baixada e o texto/caption
function renderBubbleContent(msg) {
  const parts = [];
  const attachments = msg.attachments || [];

  for (const att of attachments) {
    const mime = att.mimeType || '';
    const isImage =
      mime.startsWith('image/') ||
      msg.mediaType === 'IMAGE' ||
      msg.mediaType === 'STICKER';

    if (isImage) {
      parts.push(h('img', {
        key: att.id,
        src: att.url,
        alt: MEDIA_LABELS[msg.mediaType] || 'Imagem',
        className: `bubble-media${msg.mediaType === 'STICKER' ? ' sticker' : ''}`,
        loading: 'lazy',
      }));
    } else if (mime.startsWith('audio/')) {
      parts.push(h('audio', { key: att.id, src: att.url, controls: true, className: 'bubble-audio' }));
    } else if (mime.startsWith('video/')) {
      parts.push(h('video', { key: att.id, src: att.url, controls: true, className: 'bubble-media' }));
    } else {
      parts.push(h(
        'a',
        { key: att.id, href: att.url, target: '_blank', rel: 'noreferrer', className: 'bubble-file' },
        h(Icon, { name: 'paperclip', size: 13 }),
        ` ${att.fileName || MEDIA_LABELS[msg.mediaType] || 'Arquivo'}`,
      ));
    }
  }

  // Mensagem de mídia sem anexo carregado (evento em tempo real chega antes
  // do download terminar) — mostra um placeholder em vez de balão vazio
  if (parts.length === 0 && msg.mediaType && msg.mediaType !== 'TEXT' && !msg.text) {
    parts.push(h(
      'span',
      { key: 'placeholder', className: 'bubble-placeholder' },
      h(Icon, { name: 'paperclip', size: 13 }),
      ` ${MEDIA_LABELS[msg.mediaType] || 'Anexo'}`,
    ));
  }

  if (msg.text) parts.push(h('div', { key: 'text', className: 'bubble-text' }, msg.text));
  return parts;
}

export function ChatPanel({ conversation, draft, onDraftChange, onSend, sendError }) {
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [conversation.messages]);

  async function handleSend() {
    const ok = await onSend(attachments);
    if (ok) {
      attachments.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
      setAttachments([]);
    }
  }

  function handleKeyDown(event) {
    // Enter sozinho = enviar
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
    // Shift+Enter = nova linha
  }

  function addFiles(files) {
    const newAttachments = files.map((file) => ({
      file, // File original — necessário para o upload
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
  }

  function handleFileSelect(event) {
    addFiles(Array.from(event.target.files || []));
    event.target.value = ''; // permite anexar o mesmo arquivo de novo
  }

  // Print/imagem colado com Ctrl+V direto no composer — sem salvar em arquivo
  function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const images = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean)
      .map((file, i) =>
        file.name && file.name !== 'image.png'
          ? file
          : new File([file], `print-${Date.now()}${i ? `-${i}` : ''}.png`, {
              type: file.type || 'image/png',
            }),
      );

    if (images.length > 0) {
      event.preventDefault(); // não cola o nome/base64 como texto
      addFiles(images);
    }
  }

  function removeAttachment(index) {
    const removed = attachments[index];
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
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
        h('div', { className: 'chat-header-avatar' },
          conversation.avatarUrl
            ? h('img', { src: conversation.avatarUrl, alt: '', className: 'avatar-img' })
            : getInitials(conversation.contact)),
        h(
          'div',
          { className: 'chat-info' },
          h('h3', null, conversation.contact),
          h('p', null, h(Icon, { name: 'smartphone', size: 13 }), ` ${conversation.channel}`),
        ),
      ),
      h('button', { className: 'icon-btn', type: 'button', title: 'Mais opções' },
        h(Icon, { name: 'dots', size: 18, label: 'Mais opções' })),
    ),
    h(
      'div',
      {
        ref: messagesRef,
        className: 'chat-messages',
        role: 'log',
        'aria-live': 'polite',
      },
      conversation.messages.map((msg) =>
        h(
          'div',
          { key: msg.id, className: `message ${msg.type}` },
          h('div', { className: 'message-bubble' }, renderBubbleContent(msg)),
          h('div', { className: 'message-time' }, msg.time),
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
            h('div', { className: 'attachment-icon' }, h(Icon, { name: 'paperclip', size: 18 }))
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
            h(Icon, { name: 'x', size: 12, label: 'Remover arquivo' })
          ),
        ),
      ),
    ),

    // Aviso de falha no envio (a mensagem otimista é removida — sem isso o
    // envio falha silenciosamente e o usuário não sabe o que aconteceu)
    sendError && h(
      'div',
      { className: 'send-error', role: 'alert' },
      h(Icon, { name: 'warning', size: 15 }),
      ` ${sendError}`,
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
        h(Icon, { name: 'paperclip', size: 18, label: 'Anexar arquivo' })
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
          onPaste: handlePaste,
          rows: 1,
        },
      ),
      h(
        'button',
        {
          className: 'send-button',
          type: 'button',
          onClick: handleSend,
          disabled: !draft.trim() && attachments.length === 0,
          title: 'Enviar (Enter)',
        },
        h(Icon, { name: 'send', size: 18, label: 'Enviar mensagem' }),
      ),
    ),
  );
}
