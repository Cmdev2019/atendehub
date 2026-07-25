import { render, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';
import { ChatPanel } from './ChatPanel';

const baseConversation = {
  id: 'conv-1',
  contact: 'Marina Alves',
  channel: 'WhatsApp',
  messages: [
    { id: 'm1', type: 'customer', text: 'Oi', time: '10:00' },
    { id: 'm2', type: 'agent', text: 'Olá!', time: '10:01' },
  ],
};

describe('ChatPanel — scroll infinito de mensagens antigas (B-4)', () => {
  it('chama onLoadMoreMessages ao rolar perto do topo do histórico', () => {
    const onLoadMoreMessages = jest.fn();

    const { container } = render(
      h(ChatPanel, {
        conversation: baseConversation,
        draft: '',
        onDraftChange: jest.fn(),
        onSend: jest.fn(),
        sendError: null,
        onLoadMoreMessages,
        loadingOlderMessages: false,
      }),
    );

    const messagesEl = container.querySelector('.chat-messages');
    Object.defineProperty(messagesEl, 'scrollTop', { value: 20, writable: true });
    Object.defineProperty(messagesEl, 'scrollHeight', { value: 800, writable: true });

    fireEvent.scroll(messagesEl);

    expect(onLoadMoreMessages).toHaveBeenCalledWith('conv-1');
  });

  it('não chama onLoadMoreMessages enquanto já está carregando mensagens antigas', () => {
    const onLoadMoreMessages = jest.fn();

    const { container } = render(
      h(ChatPanel, {
        conversation: baseConversation,
        draft: '',
        onDraftChange: jest.fn(),
        onSend: jest.fn(),
        sendError: null,
        onLoadMoreMessages,
        loadingOlderMessages: true,
      }),
    );

    const messagesEl = container.querySelector('.chat-messages');
    Object.defineProperty(messagesEl, 'scrollTop', { value: 10, writable: true });

    fireEvent.scroll(messagesEl);

    expect(onLoadMoreMessages).not.toHaveBeenCalled();
  });

  it('não chama onLoadMoreMessages quando o scroll está longe do topo', () => {
    const onLoadMoreMessages = jest.fn();

    const { container } = render(
      h(ChatPanel, {
        conversation: baseConversation,
        draft: '',
        onDraftChange: jest.fn(),
        onSend: jest.fn(),
        sendError: null,
        onLoadMoreMessages,
        loadingOlderMessages: false,
      }),
    );

    const messagesEl = container.querySelector('.chat-messages');
    Object.defineProperty(messagesEl, 'scrollTop', { value: 500, writable: true });

    fireEvent.scroll(messagesEl);

    expect(onLoadMoreMessages).not.toHaveBeenCalled();
  });
});
