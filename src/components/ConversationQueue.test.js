import { render, screen, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';
import { ConversationQueue } from './ConversationQueue';

const conversations = [
  { id: '1', contact: 'Maria Silva', messages: [], summary: 'Oi', status: 'WAITING' },
  { id: '2', contact: 'João Souza', messages: [], summary: 'Olá', status: 'WAITING' },
];

// B-14: a conversa aberta na fila só era indicada por CSS (.active) — sem
// aria-current, leitor de tela não sabia qual conversa estava selecionada.
describe('ConversationQueue — aria-current na conversa ativa (B-14)', () => {
  it('marca aria-current="true" só na conversa selecionada', () => {
    render(h(ConversationQueue, { activeId: '1', conversations, onSelect: jest.fn() }));

    const activeItem = screen.getByTitle('Maria Silva');
    const otherItem = screen.getByTitle('João Souza');

    expect(activeItem).toHaveAttribute('aria-current', 'true');
    expect(otherItem).not.toHaveAttribute('aria-current');
  });

  it('nenhuma conversa marcada quando activeId não corresponde a nenhum item', () => {
    render(h(ConversationQueue, { activeId: 'inexistente', conversations, onSelect: jest.fn() }));

    expect(screen.getByTitle('Maria Silva')).not.toHaveAttribute('aria-current');
    expect(screen.getByTitle('João Souza')).not.toHaveAttribute('aria-current');
  });
});

// B-31: etapas de atendimento — fila (WAITING), meus (OPEN + meu id), em
// atendimento (OPEN de qualquer um) e encerrados (busca própria no servidor).
describe('ConversationQueue — etapas de atendimento (B-31)', () => {
  const mixedConversations = [
    { id: 'w1', contact: 'Aguardando 1', messages: [], status: 'WAITING' },
    { id: 'o1', contact: 'Minha conversa', messages: [], status: 'OPEN', agent: 'Eu', agentId: 'user-1' },
    { id: 'o2', contact: 'Conversa de outro', messages: [], status: 'OPEN', agent: 'Fulano', agentId: 'user-2' },
  ];

  it('aba "Fila de atendimento" mostra só WAITING, com botão Atender', () => {
    render(h(ConversationQueue, { activeId: null, conversations: mixedConversations, onSelect: jest.fn(), currentUserId: 'user-1' }));

    expect(screen.getByText('Aguardando 1')).toBeInTheDocument();
    expect(screen.queryByText('Minha conversa')).not.toBeInTheDocument();
    expect(screen.queryByText('Conversa de outro')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atender' })).toBeInTheDocument();
  });

  it('clicar em "Atender" chama onAttend sem também disparar onSelect', () => {
    const onAttend = jest.fn();
    const onSelect = jest.fn();
    render(h(ConversationQueue, {
      activeId: null, conversations: mixedConversations, onSelect, currentUserId: 'user-1', onAttend,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Atender' }));

    expect(onAttend).toHaveBeenCalledWith('w1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('aba "Meus" mostra só OPEN atribuído ao usuário logado', () => {
    render(h(ConversationQueue, { activeId: null, conversations: mixedConversations, onSelect: jest.fn(), currentUserId: 'user-1' }));

    fireEvent.click(screen.getByRole('tab', { name: /Meus/ }));

    expect(screen.getByText('Minha conversa')).toBeInTheDocument();
    expect(screen.queryByText('Conversa de outro')).not.toBeInTheDocument();
    expect(screen.queryByText('Aguardando 1')).not.toBeInTheDocument();
  });

  it('aba "Em atendimento" mostra todas as OPEN, de qualquer atendente', () => {
    render(h(ConversationQueue, { activeId: null, conversations: mixedConversations, onSelect: jest.fn(), currentUserId: 'user-1' }));

    fireEvent.click(screen.getByRole('tab', { name: /Em atendimento/ }));

    expect(screen.getByText('Minha conversa')).toBeInTheDocument();
    expect(screen.getByText('Conversa de outro')).toBeInTheDocument();
  });

  it('aba "Encerrados" busca a lista própria (onLoadClosed) e usa closedConversations', () => {
    const onLoadClosed = jest.fn();
    const closedConversations = [{ id: 'c1', contact: 'Já encerrada', messages: [], status: 'CLOSED' }];
    render(h(ConversationQueue, {
      activeId: null, conversations: mixedConversations, onSelect: jest.fn(),
      currentUserId: 'user-1', closedConversations, onLoadClosed,
    }));

    fireEvent.click(screen.getByRole('tab', { name: /Encerrados/ }));

    expect(onLoadClosed).toHaveBeenCalled();
    expect(screen.getByText('Já encerrada')).toBeInTheDocument();
  });
});
