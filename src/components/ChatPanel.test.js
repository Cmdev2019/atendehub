import { render, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createElement as h } from 'react';
import { ChatPanel } from './ChatPanel';
import { ConfirmProvider } from '../context/ConfirmContext';

const baseConversation = {
  id: 'conv-1',
  contact: 'Marina Alves',
  channel: 'WhatsApp',
  status: 'OPEN',
  messages: [
    { id: 'm1', type: 'customer', text: 'Oi', time: '10:00' },
    { id: 'm2', type: 'agent', text: 'Olá!', time: '10:01' },
  ],
};

const baseProps = {
  conversation: baseConversation,
  draft: '',
  onDraftChange: jest.fn(),
  onSend: jest.fn(),
  sendError: null,
  onLoadMoreMessages: jest.fn(),
  loadingOlderMessages: false,
};

// ChatPanel usa useConfirm() (B-13, e agora também o botão Encerrar de
// B-31) — precisa do ConfirmProvider como ancestral, senão o hook lança.
function renderChatPanel(props = {}) {
  return render(h(ConfirmProvider, null, h(ChatPanel, { ...baseProps, ...props })));
}

describe('ChatPanel — scroll infinito de mensagens antigas (B-4)', () => {
  it('chama onLoadMoreMessages ao rolar perto do topo do histórico', () => {
    const onLoadMoreMessages = jest.fn();
    const { container } = renderChatPanel({ onLoadMoreMessages });

    const messagesEl = container.querySelector('.chat-messages');
    Object.defineProperty(messagesEl, 'scrollTop', { value: 20, writable: true });
    Object.defineProperty(messagesEl, 'scrollHeight', { value: 800, writable: true });

    fireEvent.scroll(messagesEl);

    expect(onLoadMoreMessages).toHaveBeenCalledWith('conv-1');
  });

  it('não chama onLoadMoreMessages enquanto já está carregando mensagens antigas', () => {
    const onLoadMoreMessages = jest.fn();
    const { container } = renderChatPanel({ onLoadMoreMessages, loadingOlderMessages: true });

    const messagesEl = container.querySelector('.chat-messages');
    Object.defineProperty(messagesEl, 'scrollTop', { value: 10, writable: true });

    fireEvent.scroll(messagesEl);

    expect(onLoadMoreMessages).not.toHaveBeenCalled();
  });

  it('não chama onLoadMoreMessages quando o scroll está longe do topo', () => {
    const onLoadMoreMessages = jest.fn();
    const { container } = renderChatPanel({ onLoadMoreMessages });

    const messagesEl = container.querySelector('.chat-messages');
    Object.defineProperty(messagesEl, 'scrollTop', { value: 500, writable: true });

    fireEvent.scroll(messagesEl);

    expect(onLoadMoreMessages).not.toHaveBeenCalled();
  });
});

// B-31: botão "Encerrar" no cabeçalho da conversa — muda status pra CLOSED
// via useConversations#closeConversation (fora do escopo deste componente,
// só o disparo/confirmação são testados aqui).
describe('ChatPanel — encerrar conversa (B-31)', () => {
  it('mostra o botão Encerrar numa conversa aberta e chama onCloseConversation após confirmar', async () => {
    const onCloseConversation = jest.fn();
    renderChatPanel({ onCloseConversation });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar', description: 'Encerrar esta conversa' }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(onCloseConversation).toHaveBeenCalledWith('conv-1'));
  });

  it('não chama onCloseConversation se o usuário cancelar a confirmação', async () => {
    const onCloseConversation = jest.fn();
    renderChatPanel({ onCloseConversation });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar', description: 'Encerrar esta conversa' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(onCloseConversation).not.toHaveBeenCalled();
  });

  it('não mostra o botão Encerrar numa conversa já encerrada', () => {
    renderChatPanel({
      conversation: { ...baseConversation, status: 'CLOSED' },
      onCloseConversation: jest.fn(),
    });

    expect(screen.queryByRole('button', { name: /Encerrar/ })).not.toBeInTheDocument();
  });

  it('não mostra o botão Encerrar sem onCloseConversation (compat de quem ainda não passa a prop)', () => {
    renderChatPanel();

    expect(screen.queryByRole('button', { name: /Encerrar/ })).not.toBeInTheDocument();
  });
});
