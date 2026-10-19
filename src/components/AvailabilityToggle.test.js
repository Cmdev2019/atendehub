import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { createElement as h } from 'react';

let mockUser;
const mockUpdateUser = jest.fn((patch) => {
  mockUser = { ...mockUser, ...patch };
});

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, updateUser: mockUpdateUser }),
}));

jest.mock('../services/api', () => ({
  apiClient: { updateMyAvailability: jest.fn() },
}));

// Barramento de eventos de verdade, sem socket: o teste emite como o servidor
jest.mock('../services/websocket', () => {
  const { EventBus } = jest.requireActual('../services/eventBus');
  const bus = new EventBus();
  return {
    wsClient: {
      on: (event, cb) => bus.on(event, cb),
      emit: (event, data) => bus.emit(event, data),
    },
  };
});

import { AvailabilityToggle } from './AvailabilityToggle';
import { apiClient } from '../services/api';
import { wsClient } from '../services/websocket';

describe('AvailabilityToggle (B-65)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1', name: 'Ana', availability: 'OFFLINE' };
  });

  it('sem o campo, mostra Offline — ninguém aparece disponível sem escolher', () => {
    mockUser = { id: 'user-1', name: 'Ana' };
    render(h(AvailabilityToggle));

    const toggle = screen.getByRole('switch', { name: 'Offline' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('fica Online pela API e atualiza o usuário em memória', async () => {
    apiClient.updateMyAvailability.mockResolvedValueOnce({ availability: 'ONLINE' });
    render(h(AvailabilityToggle));

    fireEvent.click(screen.getByRole('switch', { name: 'Offline' }));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ availability: 'ONLINE' }));
    expect(apiClient.updateMyAvailability).toHaveBeenCalledWith('ONLINE');
  });

  it('Online volta para Offline no clique', async () => {
    mockUser = { ...mockUser, availability: 'ONLINE' };
    apiClient.updateMyAvailability.mockResolvedValueOnce({ availability: 'OFFLINE' });
    render(h(AvailabilityToggle));

    const toggle = screen.getByRole('switch', { name: 'Online' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);

    await waitFor(() => expect(apiClient.updateMyAvailability).toHaveBeenCalledWith('OFFLINE'));
  });

  it('erro da API aparece e o estado não muda', async () => {
    apiClient.updateMyAvailability.mockRejectedValueOnce(new Error('Servidor fora do ar'));
    render(h(AvailabilityToggle));

    fireEvent.click(screen.getByRole('switch', { name: 'Offline' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor fora do ar');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('troca feita em outra aba chega pelo socket; a de outro usuário é ignorada', () => {
    render(h(AvailabilityToggle));

    act(() => wsClient.emit('user.availability', { userId: 'user-2', availability: 'ONLINE' }));
    expect(mockUpdateUser).not.toHaveBeenCalled();

    act(() => wsClient.emit('user.availability', { userId: 'user-1', availability: 'ONLINE' }));
    expect(mockUpdateUser).toHaveBeenCalledWith({ availability: 'ONLINE' });
  });
});
