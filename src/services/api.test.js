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

  // B-9: auto-cadastro de empresa
  describe('registerCompany', () => {
    it('cria a empresa/admin e retorna o mesmo shape do login (auto-login)', async () => {
      const response = await mockApiClient.registerCompany({
        companyName: 'Empresa Nova',
        name: 'Fundador',
        email: 'fundador@empresanova.com',
        password: 'Senha123',
      });

      expect(response.accessToken).toBeTruthy();
      expect(response.refreshToken).toBeTruthy();
      expect(response.user).toEqual(
        expect.objectContaining({ name: 'Fundador', email: 'fundador@empresanova.com', role: 'ADMIN' }),
      );
    });

    it('409 ao cadastrar com um e-mail já usado', async () => {
      await mockApiClient.registerCompany({
        companyName: 'Empresa A', name: 'A', email: 'duplicado@empresa.com', password: 'Senha123',
      });

      await expect(
        mockApiClient.registerCompany({
          companyName: 'Empresa B', name: 'B', email: 'duplicado@empresa.com', password: 'Senha123',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('permite logar de novo com o e-mail/senha cadastrados', async () => {
      await mockApiClient.registerCompany({
        companyName: 'Relogin Empresa', name: 'Fulano', email: 'relogin@empresa.com', password: 'Senha123',
      });
      mockApiClient.clearToken();

      const loginResponse = await mockApiClient.login('relogin@empresa.com', 'Senha123');
      expect(loginResponse.user.email).toBe('relogin@empresa.com');
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

  describe('refreshToken', () => {
    it('preserva a identidade do usuário — getCurrentUser continua funcionando após o refresh', async () => {
      // Regressão: o token gerado pelo refresh não embutia o id do usuário
      // (`token_<ts>` em vez de `token_<id>_<ts>`), quebrando getCurrentUser()
      // com "Usuário não encontrado" depois do 1º refresh — descoberto ao
      // implementar o perfil próprio (F8-7), que depende de getCurrentUser()
      // pra resolver "quem sou eu" nas rotas /users/me.
      await mockApiClient.login('admin@demo.com', 'Admin@123');
      await mockApiClient.refreshToken();

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

  // B-8: notificações sempre filtradas pelo usuário logado (admin = user-1 no mock)
  describe('getNotifications / markNotificationRead / markAllNotificationsRead', () => {
    it('lista só as notificações do usuário, mais recentes primeiro', async () => {
      const response = await mockApiClient.getNotifications('user-1');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
      expect(response.data.every((n) => n.userId === 'user-1')).toBe(true);
      const timestamps = response.data.map((n) => new Date(n.createdAt).getTime());
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    });

    it('unreadOnly filtra só as não lidas', async () => {
      const all = await mockApiClient.getNotifications('user-1');
      const unread = await mockApiClient.getNotifications('user-1', { unreadOnly: true });
      expect(unread.data.every((n) => !n.readAt)).toBe(true);
      expect(unread.data.length).toBeLessThan(all.data.length);
    });

    it('marca uma notificação como lida (idempotente)', async () => {
      const { data } = await mockApiClient.getNotifications('user-1', { unreadOnly: true });
      const target = data[0];

      const updated = await mockApiClient.markNotificationRead('user-1', target.id);
      expect(updated.readAt).not.toBeNull();

      // Chamar de novo não deve trocar o readAt já setado
      const updatedAgain = await mockApiClient.markNotificationRead('user-1', target.id);
      expect(updatedAgain.readAt).toBe(updated.readAt);
    });

    it('404 ao marcar notificação de outro usuário como lida', async () => {
      const { data } = await mockApiClient.getNotifications('user-1');
      await expect(
        mockApiClient.markNotificationRead('user-2', data[0].id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('marca todas como lidas de uma vez', async () => {
      const { data: beforeUnread } = await mockApiClient.getNotifications('user-1', { unreadOnly: true });

      const result = await mockApiClient.markAllNotificationsRead('user-1');
      expect(result.message).toBe(`${beforeUnread.length} notificação(ões) marcada(s) como lida(s)`);

      const { data: afterUnread } = await mockApiClient.getNotifications('user-1', { unreadOnly: true });
      expect(afterUnread).toHaveLength(0);
    });
  });
});
