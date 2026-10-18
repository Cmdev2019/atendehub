import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';

let mockState;
const mockUseNotifications = jest.fn(() => mockState);

jest.mock('../hooks/useNotifications', () => ({
  useNotifications: (...args) => mockUseNotifications(...args),
}));
// AuthContext real importa services/api (import.meta.env) — contexto simples aqui
jest.mock('../context/AuthContext', () => ({
  AuthContext: require('react').createContext(null),
}));

import { NotificationBell } from './NotificationBell';
import { AuthContext } from '../context/AuthContext';

function baseState(overrides = {}) {
  return {
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    fetchNotifications: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    ...overrides,
  };
}

describe('NotificationBell (B-8)', () => {
  beforeEach(() => {
    mockState = baseState();
  });

  // B-84 (M-10): o id do usuário logado vai para o hook, que só recarrega
  // em atribuições para ele
  it('passa o id do usuário logado para useNotifications', () => {
    render(h(AuthContext.Provider, { value: { user: { id: 'user-1' } } }, h(NotificationBell)));
    expect(mockUseNotifications).toHaveBeenLastCalledWith('user-1');
  });

  it('não mostra o badge quando não há notificação não lida', () => {
    render(h(NotificationBell));
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('mostra o badge com a contagem de não lidas', () => {
    mockState = baseState({ unreadCount: 3 });
    render(h(NotificationBell));
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('painel fica fechado até o sino ser clicado', () => {
    mockState = baseState({
      notifications: [{ id: '1', title: 'SLA estourado', body: 'x', readAt: null, createdAt: new Date().toISOString() }],
    });
    render(h(NotificationBell));
    expect(screen.queryByText('SLA estourado')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Notificações'));
    expect(screen.getByText('SLA estourado')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há notificações', () => {
    render(h(NotificationBell));
    fireEvent.click(screen.getByTitle('Notificações'));
    expect(screen.getByText('Nenhuma notificação por aqui.')).toBeInTheDocument();
  });

  it('clicar numa notificação não lida chama markAsRead', () => {
    mockState = baseState({
      notifications: [{ id: '1', title: 'SLA estourado', body: 'x', readAt: null, createdAt: new Date().toISOString() }],
    });
    render(h(NotificationBell));
    fireEvent.click(screen.getByTitle('Notificações'));
    fireEvent.click(screen.getByText('SLA estourado'));
    expect(mockState.markAsRead).toHaveBeenCalledWith('1');
  });

  it('clicar numa notificação já lida não chama markAsRead de novo', () => {
    mockState = baseState({
      notifications: [{ id: '1', title: 'Já lida', body: 'x', readAt: new Date().toISOString(), createdAt: new Date().toISOString() }],
    });
    render(h(NotificationBell));
    fireEvent.click(screen.getByTitle('Notificações'));
    fireEvent.click(screen.getByText('Já lida'));
    expect(mockState.markAsRead).not.toHaveBeenCalled();
  });

  it('botão "Marcar todas como lidas" só aparece com não lidas, e chama markAllAsRead', () => {
    mockState = baseState({
      unreadCount: 1,
      notifications: [{ id: '1', title: 'SLA estourado', body: 'x', readAt: null, createdAt: new Date().toISOString() }],
    });
    render(h(NotificationBell));
    fireEvent.click(screen.getByTitle('Notificações'));

    const markAllBtn = screen.getByText('Marcar todas como lidas');
    fireEvent.click(markAllBtn);
    expect(mockState.markAllAsRead).toHaveBeenCalled();
  });

  it('fecha o painel ao clicar fora', async () => {
    mockState = baseState();
    render(h('div', null, h(NotificationBell), h('button', { title: 'fora' }, 'fora')));

    fireEvent.click(screen.getByTitle('Notificações'));
    expect(screen.getByText('Nenhuma notificação por aqui.')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTitle('fora'));

    await waitFor(() => {
      expect(screen.queryByText('Nenhuma notificação por aqui.')).not.toBeInTheDocument();
    });
  });
});
