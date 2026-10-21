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

  // Ordem na tela dos itens com estes títulos
  const domOrder = (titles) =>
    titles
      .map((t) => screen.getByTitle(t))
      .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((el) => el.getAttribute('title'));

  it('fora da fila, ordena pela última atividade, mais recente primeiro', () => {
    const convs = [
      { id: 'a', contact: 'Antiga', messages: [], status: 'OPEN', lastMessageAt: '2026-10-17T10:00:00Z' },
      { id: 'b', contact: 'Recente', messages: [], status: 'OPEN', lastMessageAt: '2026-10-17T12:00:00Z' },
      { id: 'c', contact: 'Meio', messages: [], status: 'OPEN', lastMessageAt: '2026-10-17T11:00:00Z' },
    ];
    render(h(ConversationQueue, { activeId: null, conversations: convs, onSelect: jest.fn() }));
    fireEvent.change(screen.getByLabelText('Etapa de atendimento'), { target: { value: 'open' } });

    expect(domOrder(['Antiga', 'Recente', 'Meio'])).toEqual(['Recente', 'Meio', 'Antiga']);
  });

  // B-68: a fila vai por ordem de chegada — a mesma do "Pegar próxima"
  it('na fila, quem espera há mais tempo vem primeiro, mesmo com mensagem mais nova', () => {
    const convs = [
      { id: 'a', contact: 'Chegou por último', messages: [], status: 'WAITING', waitingSince: '2026-10-17T12:00:00Z', lastMessageAt: '2026-10-17T12:01:00Z' },
      { id: 'b', contact: 'Chegou primeiro', messages: [], status: 'WAITING', waitingSince: '2026-10-17T10:00:00Z', lastMessageAt: '2026-10-17T12:30:00Z' },
      { id: 'c', contact: 'Chegou no meio', messages: [], status: 'WAITING', waitingSince: '2026-10-17T11:00:00Z', lastMessageAt: '2026-10-17T11:00:00Z' },
    ];
    render(h(ConversationQueue, { activeId: null, conversations: convs, onSelect: jest.fn() }));

    expect(domOrder(['Chegou por último', 'Chegou primeiro', 'Chegou no meio'])).toEqual([
      'Chegou primeiro',
      'Chegou no meio',
      'Chegou por último',
    ]);
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

// B-68 (ADR-0019): a ação principal da fila e os prazos de SLA visíveis em
// cada conversa — com texto, não só cor
describe('ConversationQueue — Pegar próxima e prazos de SLA (B-68)', () => {
  const NOW = Date.parse('2026-10-21T13:00:00Z');
  const at = (offsetMs) => new Date(NOW + offsetMs).toISOString();

  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  const waiting = (id, contact, startMs, dueMs, extra = {}) => ({
    id, contact, messages: [], status: 'WAITING', waitingSince: at(startMs), waitSlaDueAt: at(dueMs), ...extra,
  });

  it('Online: "Pegar próxima" chama a ação', () => {
    const onAttendNext = jest.fn();
    render(h(ConversationQueue, { activeId: null, conversations, onSelect: jest.fn(), onAttendNext, canAttend: true }));

    fireEvent.click(screen.getByRole('button', { name: /Pegar próxima/ }));

    expect(onAttendNext).toHaveBeenCalledTimes(1);
  });

  it('Offline: o botão fica travado, com o motivo na tela', () => {
    render(h(ConversationQueue, { activeId: null, conversations, onSelect: jest.fn(), onAttendNext: jest.fn(), canAttend: false }));

    const button = screen.getByRole('button', { name: /Pegar próxima/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Fique Online para atender');
    expect(screen.getByText('Fique Online para atender')).toBeInTheDocument();
  });

  it('enquanto pega, o botão mostra o andamento e não aceita outro clique', () => {
    render(h(ConversationQueue, {
      activeId: null, conversations, onSelect: jest.fn(), onAttendNext: jest.fn(), canAttend: true, attendingNext: true,
    }));

    expect(screen.getByRole('button', { name: /Pegando…/ })).toBeDisabled();
  });

  it('o botão só aparece na fila', () => {
    render(h(ConversationQueue, { activeId: null, conversations, onSelect: jest.fn(), onAttendNext: jest.fn(), canAttend: true }));
    fireEvent.change(screen.getByLabelText('Etapa de atendimento'), { target: { value: 'mine' } });

    expect(screen.queryByRole('button', { name: /Pegar próxima/ })).not.toBeInTheDocument();
  });

  it('na fila, cada conversa mostra quanto falta para o SLA da espera — ok, perto de estourar e estourado', () => {
    const convs = [
      waiting('ok', 'Com folga', -60_000, 20 * 60_000),
      waiting('warn', 'Quase', -4 * 60_000, 50_000),
      waiting('late', 'Atrasada', -10 * 60_000, -5 * 60_000),
    ];
    render(h(ConversationQueue, { activeId: null, conversations: convs, onSelect: jest.fn() }));

    expect(screen.getByTitle('SLA da espera estoura em 20 min')).toHaveClass('sla-ok');
    expect(screen.getByText(/SLA 20 min/)).toBeInTheDocument();
    expect(screen.getByTitle('SLA da espera estoura em menos de 1 min')).toHaveClass('sla-warning');
    expect(screen.getByTitle('SLA da espera estourou há 5 min')).toHaveClass('sla-breached');
    expect(screen.getByText(/SLA estourado/)).toBeInTheDocument();
    // A conversa estourada ganha o destaque na lista
    expect(screen.getByTitle('Atrasada — SLA da espera estourou há 5 min')).toHaveClass('sla-breached');
  });

  it('setor sem prazo: nenhum selo de SLA', () => {
    render(h(ConversationQueue, {
      activeId: null,
      conversations: [{ id: 'x', contact: 'Sem prazo', messages: [], status: 'WAITING', waitingSince: at(-60_000), waitSlaDueAt: null }],
      onSelect: jest.fn(),
    }));

    expect(screen.queryByText(/SLA/)).not.toBeInTheDocument();
  });

  it('em atendimento, mostra o SLA do atendimento — e o estouro avisado pela API', () => {
    const convs = [
      { id: 'm1', contact: 'Dentro do prazo', messages: [], status: 'OPEN', agentId: 'me', attendedAt: at(-5 * 60_000), serviceSlaDueAt: at(25 * 60_000) },
      { id: 'm2', contact: 'Passou do prazo', messages: [], status: 'OPEN', agentId: 'me', attendedAt: at(-40 * 60_000), serviceSlaDueAt: at(10 * 60_000), serviceSlaBreachedAt: at(-1000) },
    ];
    render(h(ConversationQueue, { activeId: null, conversations: convs, onSelect: jest.fn(), currentUserId: 'me' }));
    fireEvent.change(screen.getByLabelText('Etapa de atendimento'), { target: { value: 'mine' } });

    expect(screen.getByText(/Atendimento 25 min/)).toBeInTheDocument();
    expect(screen.getByText(/Atendimento estourado/)).toBeInTheDocument();
  });

  it('o selo acompanha o relógio: de ok para perto de estourar sem recarregar', () => {
    render(h(ConversationQueue, {
      activeId: null,
      conversations: [waiting('t', 'Andando', -60_000, 4 * 60_000)],
      onSelect: jest.fn(),
    }));
    expect(screen.getByText(/SLA 4 min/).closest('.queue-item-sla')).toHaveClass('sla-ok');

    act(() => jest.advanceTimersByTime(3 * 60_000 + 15_000));

    expect(screen.getByText(/SLA menos de 1 min/).closest('.queue-item-sla')).toHaveClass('sla-warning');
  });
});
