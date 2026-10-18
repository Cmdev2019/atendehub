import { render, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createElement as h } from 'react';
import { ChatPanel } from './ChatPanel';

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

function renderChatPanel(props = {}) {
  return render(h(ChatPanel, { ...baseProps, ...props }));
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
// via useConversations#closeConversation. B-32: o clique abre um diálogo que
// pede o motivo do encerramento (resolvido/não resolvido) antes de confirmar
// — vira dado real pro dashboard.
describe('ChatPanel — encerrar conversa (B-31/B-32/B-36)', () => {
  it('mostra o botão Encerrar numa conversa aberta e chama onCloseConversation com RESOLVED', async () => {
    const onCloseConversation = jest.fn();
    renderChatPanel({ onCloseConversation });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar', description: 'Encerrar esta conversa' }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolvido' }));

    await waitFor(() => expect(onCloseConversation).toHaveBeenCalledWith('conv-1', 'RESOLVED', undefined));
  });

  it('chama onCloseConversation com UNRESOLVED ao escolher "Não resolvido"', async () => {
    const onCloseConversation = jest.fn();
    renderChatPanel({ onCloseConversation });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar', description: 'Encerrar esta conversa' }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Não resolvido' }));

    await waitFor(() => expect(onCloseConversation).toHaveBeenCalledWith('conv-1', 'UNRESOLVED', undefined));
  });

  it('escolher "Cancelado" pede justificativa obrigatória antes de chamar onCloseConversation', async () => {
    const onCloseConversation = jest.fn();
    renderChatPanel({ onCloseConversation });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar', description: 'Encerrar esta conversa' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelado' }));

    // Ainda não confirmou nada — precisa preencher o motivo primeiro
    expect(onCloseConversation).not.toHaveBeenCalled();
    const confirmBtn = within(dialog).getByRole('button', { name: 'Confirmar cancelamento' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Descreva o motivo do cancelamento'), {
      target: { value: 'Contato não respondeu mais.' },
    });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(onCloseConversation).toHaveBeenCalledWith('conv-1', 'CANCELLED', 'Contato não respondeu mais.'),
    );
  });

  it('"Voltar" na tela de motivo volta pra escolha, sem perder o diálogo', async () => {
    const onCloseConversation = jest.fn();
    renderChatPanel({ onCloseConversation });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar', description: 'Encerrar esta conversa' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelado' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));

    expect(within(dialog).getByRole('button', { name: 'Resolvido' })).toBeInTheDocument();
    expect(onCloseConversation).not.toHaveBeenCalled();
  });

  it('não chama onCloseConversation se o usuário fechar o diálogo (X)', async () => {
    const onCloseConversation = jest.fn();
    renderChatPanel({ onCloseConversation });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar', description: 'Encerrar esta conversa' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));

    expect(onCloseConversation).not.toHaveBeenCalled();
  });

  it('não chama onCloseConversation se o usuário clicar em "Voltar à conversa"', async () => {
    const onCloseConversation = jest.fn();
    renderChatPanel({ onCloseConversation });

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar', description: 'Encerrar esta conversa' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar à conversa' }));

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

// B-77 (M-03): anexo recebido que o servidor não conseguiu salvar — antes o
// balão ficava com o placeholder para sempre.
describe('ChatPanel — anexo recebido não salvo (B-77)', () => {
  it.each([
    ['unsupported_type', 'tipo de arquivo não aceito'],
    ['download_failed', 'não foi possível baixar'],
  ])('mostra o motivo (%s) no lugar do placeholder', (mediaError, label) => {
    renderChatPanel({
      conversation: {
        ...baseConversation,
        messages: [
          { id: 'm1', type: 'customer', text: '', time: '10:00', mediaType: 'DOCUMENT', attachments: [], mediaError },
        ],
      },
    });

    expect(screen.getByRole('note')).toHaveTextContent(`Documento recebido, mas não salvo: ${label}`);
  });

  it('sem erro, segue mostrando o placeholder enquanto o download não termina', () => {
    renderChatPanel({
      conversation: {
        ...baseConversation,
        messages: [{ id: 'm1', type: 'customer', text: '', time: '10:00', mediaType: 'DOCUMENT', attachments: [] }],
      },
    });

    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByText(/Documento/)).toBeInTheDocument();
  });
});

// B-81 (M-02): reação e edição recebidas pelo WhatsApp
describe('ChatPanel — reação e edição (B-81)', () => {
  it('mostra a reação no balão e a marca de editada', () => {
    renderChatPanel({
      conversation: {
        ...baseConversation,
        messages: [{ id: 'm1', type: 'customer', text: 'corrigido', time: '10:00', reaction: '👍', isEdited: true }],
      },
    });

    expect(screen.getByLabelText('Reação: 👍')).toBeInTheDocument();
    expect(screen.getByText(/editada/)).toBeInTheDocument();
  });

  it('sem reação nem edição, nada a mais aparece', () => {
    renderChatPanel();

    expect(screen.queryByLabelText(/Reação/)).toBeNull();
    expect(screen.queryByText(/editada/)).toBeNull();
  });
});
