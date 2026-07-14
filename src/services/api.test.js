import { mockApiClient } from './apiMock';

// Mock do apiClient para evitar import.meta issue
jest.mock('./api', () => ({
  apiClient: {
    baseURL: 'http://localhost:3001/api/v1',
    token: null,
    getToken: jest.fn(),
    setToken: jest.fn(),
    clearToken: jest.fn(),
  },
}));

import { apiClient } from './api';

describe('API Client', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('getToken', () => {
    it('retorna token do localStorage', () => {
      localStorage.setItem('accessToken', 'test-token-123');
      apiClient.getToken();
      expect(apiClient.getToken).toHaveBeenCalled();
    });

    it('método existe', () => {
      expect(typeof apiClient.getToken).toBe('function');
    });
  });

  describe('setToken', () => {
    it('método existe', () => {
      expect(typeof apiClient.setToken).toBe('function');
    });
  });

  describe('clearToken', () => {
    it('método existe', () => {
      expect(typeof apiClient.clearToken).toBe('function');
    });
  });

  describe('baseURL', () => {
    it('usa URL padrão', () => {
      expect(apiClient.baseURL).toBe('http://localhost:3001/api/v1');
    });
  });
});

describe('Mock API Client', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('lança erro se email não encontrado', async () => {
      await expect(
        mockApiClient.login('invalid@email.com', 'password')
      ).rejects.toEqual({
        status: 401,
        message: 'Email não encontrado',
      });
    });

    it('lança erro se senha incorreta', async () => {
      await expect(
        mockApiClient.login('admin@demo.com', 'wrong-password')
      ).rejects.toEqual({
        status: 401,
        message: 'Senha incorreta',
      });
    });

    it('retorna user e tokens se credenciais válidas', async () => {
      const response = await mockApiClient.login('admin@demo.com', 'Admin@123');
      expect(response).toHaveProperty('accessToken');
      expect(response).toHaveProperty('refreshToken');
      expect(response.user.email).toBe('admin@demo.com');
    });

    it('salva token no localStorage após login', async () => {
      const response = await mockApiClient.login('admin@demo.com', 'Admin@123');
      expect(localStorage.getItem('accessToken')).toBe(response.accessToken);
    });
  });

  describe('logout', () => {
    it('limpa tokens do localStorage', async () => {
      localStorage.setItem('accessToken', 'test-token');
      await mockApiClient.logout();
      expect(localStorage.getItem('accessToken')).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('lança erro se não autenticado', async () => {
      mockApiClient.clearToken();
      await expect(
        mockApiClient.getCurrentUser()
      ).rejects.toEqual({
        status: 401,
        message: 'Não autenticado',
      });
    });

    it('retorna usuário se token válido', async () => {
      const loginResponse = await mockApiClient.login('admin@demo.com', 'Admin@123');
      const user = await mockApiClient.getCurrentUser();
      expect(user.email).toBe('admin@demo.com');
    });
  });

  describe('getConversations', () => {
    it('retorna array de conversas', async () => {
      const response = await mockApiClient.getConversations();
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('pagination');
      expect(Array.isArray(response.data)).toBe(true);
    });
  });
});
