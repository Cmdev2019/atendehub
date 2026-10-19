import { render, screen, fireEvent, act } from '@testing-library/react';
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

    fireEvent.change(screen.getByLabelText('Etapa de atendimento'), { target: { value: 'mine' } });

    expect(screen.getByText('Minha conversa')).toBeInTheDocument();
    expect(screen.queryByText('Conversa de outro')).not.toBeInTheDocument();
    expect(screen.queryByText('Aguardando 1')).not.toBeInTheDocument();
  });

  it('aba "Em atendimento" mostra todas as OPEN, de qualquer atendente', () => {
    render(h(ConversationQueue, { activeId: null, conversations: mixedConversations, onSelect: jest.fn(), currentUserId: 'user-1' }));

    fireEvent.change(screen.getByLabelText('Etapa de atendimento'), { target: { value: 'open' } });

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

    fireEvent.change(screen.getByLabelText('Etapa de atendimento'), { target: { value: 'closed' } });

    expect(onLoadClosed).toHaveBeenCalled();
    expect(screen.getByText('Já encerrada')).toBeInTheDocument();
  });

  it('seletor mostra a contagem de conversas de cada etapa', () => {
    render(h(ConversationQueue, { activeId: null, conversations: mixedConversations, onSelect: jest.fn(), currentUserId: 'user-1' }));

    const select = screen.getByLabelText('Etapa de atendimento');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

    expect(options).toEqual([
      'Fila de atendimento (1)',
      'Meus (1)',
      'Em atendimento (2)',
      'Encerrados',
    ]);
  });

  it('scroll infinito de cada aba usa seu próprio fetch/hasMore/loadingMore', () => {
    const onLoadMoreMine = jest.fn();
    render(h(ConversationQueue, {
      activeId: null, conversations: mixedConversations, onSelect: jest.fn(), currentUserId: 'user-1',
      onLoadMoreMine, mineHasMore: true, mineLoadingMore: false,
    }));

    fireEvent.change(screen.getByLabelText('Etapa de atendimento'), { target: { value: 'mine' } });

    const list = document.querySelector('.queue-list');
    Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 400, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
    fireEvent.scroll(list);

    expect(onLoadMoreMine).toHaveBeenCalled();
  });
});

// B-60: a fila sinaliza mensagens novas — contador de não lidas, ordem por
// atividade e prévia de mídia sem legenda.
describe('ConversationQueue — mensagens novas (B-60)', () => {
  it('mostra o contador de não lidas só nas conversas que têm', () => {
    const convs = [
      { id: '1', contact: 'Com não lidas', messages: [], status: 'WAITING', unreadCount: 3 },
      { id: '2', contact: 'Sem não lidas', messages: [], status: 'WAITING', unreadCount: 0 },
    ];
    render(h(ConversationQueue, { activeId: null, conversations: convs, onSelect: jest.fn() }));

    expect(screen.getByLabelText('3 mensagens não lidas')).toHaveTextContent('3');
    expect(screen.getAllByLabelText(/não lida/)).toHaveLength(1);
  });

  it('limita o contador em 99+', () => {
    const convs = [{ id: '1', contact: 'Muitas', messages: [], status: 'WAITING', unreadCount: 150 }];
    render(h(ConversationQueue, { activeId: null, conversations: convs, onSelect: jest.fn() }));

    expect(screen.getByLabelText('150 mensagens não lidas')).toHaveTextContent('99+');
  });

  it('ordena pela última atividade, mais recente primeiro', () => {
    const convs = [
      { id: 'a', contact: 'Antiga', messages: [], status: 'WAITING', lastMessageAt: '2026-10-17T10:00:00Z' },
      { id: 'b', contact: 'Recente', messages: [], status: 'WAITING', lastMessageAt: '2026-10-17T12:00:00Z' },
      { id: 'c', contact: 'Meio', messages: [], status: 'WAITING', lastMessageAt: '2026-10-17T11:00:00Z' },
    ];
    render(h(ConversationQueue, { activeId: null, conversations: convs, onSelect: jest.fn() }));

    const titles = ['Antiga', 'Recente', 'Meio'].map((t) => screen.getByTitle(t));
    const order = [...titles].sort((x, y) =>
      x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    expect(order.map((el) => el.getAttribute('title'))).toEqual(['Recente', 'Meio', 'Antiga']);
  });

  it('última mensagem de áudio sem texto aparece como "Áudio" na prévia', () => {
    const convs = [
      {
        id: '1',
        contact: 'Cliente',
        status: 'WAITING',
        messages: [{ id: 'm1', type: 'customer', text: '', mediaType: 'AUDIO', attachments: [] }],
      },
    ];
    render(h(ConversationQueue, { activeId: null, conversations: convs, onSelect: jest.fn() }));

    expect(screen.getByText('Áudio')).toBeInTheDocument();
  });
});

// B-104 (L-09): busca no servidor e tempo de espera
describe('ConversationQueue — busca no servidor e tempo na fila (B-104)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('com 2+ caracteres, busca no servidor (com a aba) e mostra o resultado, mesmo fora do que está carregado', async () => {
    const onSearch = jest.fn().mockResolvedValue([
      { id: '99', contact: 'Paula Remota', messages: [], summary: '', status: 'WAITING' },
    ]);
    render(h(ConversationQueue, { activeId: null, conversations, onSelect: jest.fn(), onSearch }));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Pau' } });
    expect(onSearch).not.toHaveBeenCalled(); // espera a digitação parar
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    expect(onSearch).toHaveBeenCalledWith('Pau', 'queue');
    expect(screen.getByText('Paula Remota')).toBeInTheDocument();
    expect(screen.queryByText('Maria Silva')).not.toBeInTheDocument();
  });

  it('com 1 caractere, só filtra o que está carregado', async () => {
    const onSearch = jest.fn();
    render(h(ConversationQueue, { activeId: null, conversations, onSelect: jest.fn(), onSearch }));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'M' } });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('mostra há quanto tempo a conversa espera na fila', () => {
    jest.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    render(h(ConversationQueue, {
      activeId: null,
      conversations: [{ id: '1', contact: 'Maria', messages: [], status: 'WAITING', createdAt: '2026-10-18T11:48:00Z' }],
      onSelect: jest.fn(),
    }));

    expect(screen.getByTitle('Tempo na fila')).toHaveTextContent('12 min');
  });

  // B-66: conversa transferida ou reaberta espera desde que voltou para a fila
  it('conta o tempo desde o início da espera atual (waitingSince), não do createdAt', () => {
    jest.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    render(h(ConversationQueue, {
      activeId: null,
      conversations: [{
        id: '1', contact: 'Maria', messages: [], status: 'WAITING',
        createdAt: '2026-10-17T09:00:00Z', waitingSince: '2026-10-18T11:55:00Z',
      }],
      onSelect: jest.fn(),
    }));

    expect(screen.getByTitle('Tempo na fila')).toHaveTextContent('5 min');
  });
});

// B-66 (ADR-0019, regra 3): quem chegou depois vê o motivo da recusa
describe('ConversationQueue — aviso do Atender recusado', () => {
  it('mostra o motivo e fecha pelo botão', () => {
    const onDismiss = jest.fn();
    render(h(ConversationQueue, {
      activeId: null,
      conversations,
      onSelect: jest.fn(),
      attendNotice: 'Bruno já está atendendo',
      onDismissAttendNotice: onDismiss,
    }));

    expect(screen.getByRole('alert')).toHaveTextContent('Bruno já está atendendo');
    fireEvent.click(screen.getByTitle('Fechar aviso'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('sem aviso, nada aparece', () => {
    render(h(ConversationQueue, { activeId: null, conversations, onSelect: jest.fn() }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
