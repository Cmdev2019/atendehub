import { render, screen, fireEvent, act } from '@testing-library/react';
import { createElement as h } from 'react';

// Registro dos ouvintes do socket, para disparar o evento no teste
const mockHandlers = {};
jest.mock('../services/websocket', () => ({
  wsClient: {
    on: jest.fn((event, callback) => {
      mockHandlers[event] = callback;
      return () => delete mockHandlers[event];
    }),
  },
}));

import { ARRIVAL_TOAST_MS, QueueArrivalToast } from './QueueArrivalToast';

const arrive = (conversation) =>
  act(() => mockHandlers['conversation.created']?.({ companyId: 'c1', conversation }));

const waiting = { id: 'conv-9', status: 'WAITING', contact: { id: 'k1', name: 'Paciente Novo', phone: '5511' } };

// B-68 (ADR-0019, regra 10): aviso de conversa nova só para quem está Online
describe('QueueArrivalToast (B-68)', () => {
  beforeEach(() => {
    Object.keys(mockHandlers).forEach((key) => delete mockHandlers[key]);
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('Online: avisa a conversa nova na fila, com o nome do paciente', () => {
    render(h(QueueArrivalToast, { online: true, onAttend: jest.fn() }));

    arrive(waiting);

    expect(screen.getByRole('status')).toHaveTextContent('Nova conversa na fila');
    expect(screen.getByText('Paciente Novo')).toBeInTheDocument();
  });

  it('"Atender" no aviso atende aquela conversa e fecha o aviso', () => {
    const onAttend = jest.fn();
    render(h(QueueArrivalToast, { online: true, onAttend }));
    arrive(waiting);

    fireEvent.click(screen.getByRole('button', { name: 'Atender' }));

    expect(onAttend).toHaveBeenCalledWith('conv-9');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('some sozinho depois de alguns segundos', () => {
    render(h(QueueArrivalToast, { online: true, onAttend: jest.fn() }));
    arrive(waiting);

    act(() => jest.advanceTimersByTime(ARRIVAL_TOAST_MS));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('Offline: não ouve nem avisa', () => {
    render(h(QueueArrivalToast, { online: false, onAttend: jest.fn() }));

    expect(mockHandlers['conversation.created']).toBeUndefined();
    arrive(waiting);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('conversa que não nasceu na fila não gera aviso', () => {
    render(h(QueueArrivalToast, { online: true, onAttend: jest.fn() }));

    arrive({ ...waiting, status: 'OPEN' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ficou Offline com um aviso na tela: o aviso some e para de ouvir', () => {
    const { rerender } = render(h(QueueArrivalToast, { online: true, onAttend: jest.fn() }));
    arrive(waiting);

    rerender(h(QueueArrivalToast, { online: false, onAttend: jest.fn() }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockHandlers['conversation.created']).toBeUndefined();
  });
});
