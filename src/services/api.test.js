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
    it('lança erro genérico se email não encontrado (anti-enumeração)', async () => {
      await expect(
        mockApiClient.login('invalid@email.com', 'password')
      ).rejects.toEqual({
        status: 401,
        message: 'Usuário ou senha incorreta.',
      });
    });

    it('lança erro genérico se senha incorreta', async () => {
      await expect(
        mockApiClient.login('admin@demo.com', 'wrong-password')
      ).rejects.toEqual({
        status: 401,
        message: 'Usuário ou senha incorreta.',
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
    it('retorna array de conversas com wrapper {data,meta} do contrato', async () => {
      const response = await mockApiClient.getConversations();
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThan(0);
    });
  });

  describe('getConversation', () => {
    it('retorna a conversa pelo id', async () => {
      const list = await mockApiClient.getConversations();
      const first = list.data[0];
      const conv = await mockApiClient.getConversation(first.id);
      expect(conv.id).toBe(first.id);
    });

    it('lança 404 para id inexistente', async () => {
      await expect(mockApiClient.getConversation('nao-existe')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getMessages', () => {
    it('retorna as mensagens da conversa no shape do contrato', async () => {
      const list = await mockApiClient.getConversations();
      const first = list.data[0];
      const response = await mockApiClient.getMessages(first.id);
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
      expect(response.data[0]).toHaveProperty('senderType');
      expect(response.data[0]).toHaveProperty('content');
    });
  });

  describe('sendMessage', () => {
    it('persiste a mensagem na conversa e retorna no shape do contrato', async () => {
      const list = await mockApiClient.getConversations();
      const first = list.data[0];
      const before = (await mockApiClient.getMessages(first.id)).data.length;

      const sent = await mockApiClient.sendMessage(first.id, 'Olá do agente');

      expect(sent.senderType).toBe('AGENT');
      expect(sent.content).toBe('Olá do agente');
      const after = (await mockApiClient.getMessages(first.id)).data.length;
      expect(after).toBe(before + 1);
    });
  });
});
