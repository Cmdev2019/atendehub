import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';
import { AuthProvider, AuthContext } from './AuthContext';

jest.mock('../services/api', () => ({
  apiClient: {
    getCurrentUser: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  },
}));

jest.mock('../services/websocket', () => ({
  wsClient: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  },
}));

const { apiClient } = require('../services/api');

// Regressão: logout() ficava com a UI autenticada para sempre quando a
// revogação no backend falhava (ex.: 400 por refreshToken ausente no
// corpo) — o catch não limpava o usuário em memória. A sessão local
// (tokens) já é encerrada de qualquer forma por apiClient.logout(), então
// a UI precisa acompanhar mesmo se o backend rejeitar a chamada.
describe('AuthContext — logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  function renderAuth() {
    return renderHook(() => require('react').useContext(AuthContext), {
      wrapper: ({ children }) => h(AuthProvider, null, children),
    });
  }

  it('limpa o usuário mesmo quando apiClient.logout() rejeita', async () => {
    apiClient.getCurrentUser.mockResolvedValue(null);
    apiClient.login.mockResolvedValue({
      user: { id: '1', name: 'Admin' },
      accessToken: 'token-123',
    });
    apiClient.logout.mockRejectedValue(new Error('refreshToken should not be empty'));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('admin@demo.com', 'Admin@123');
    });
    expect(result.current.user).toEqual({ id: '1', name: 'Admin' });

    await act(async () => {
      await result.current.logout();
    });

    expect(apiClient.logout).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });
});
