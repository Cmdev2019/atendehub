// Mock API - Para testes sem backend
// Simula as respostas do API real

export const mockUsers = {
  'admin@demo.com': {
    id: 'user-1',
    email: 'admin@demo.com',
    name: 'Administrador',
    role: 'ADMIN',
    companyId: 'comp-1',
    avatarUrl: null,
  },
  'agente1@demo.com': {
    id: 'user-2',
    email: 'agente1@demo.com',
    name: 'Agente 1',
    role: 'AGENT',
    companyId: 'comp-1',
    avatarUrl: null,
  },
  'supervisor@demo.com': {
    id: 'user-3',
    email: 'supervisor@demo.com',
    name: 'Supervisor',
    role: 'SUPERVISOR',
    companyId: 'comp-1',
    avatarUrl: null,
  },
};

export class MockApiClient {
  constructor() {
    this.token = this.getToken();
    this.delayMs = 800; // Simula latência de rede
  }

  getToken() {
    return localStorage.getItem('accessToken');
  }

  setToken(token) {
    localStorage.setItem('accessToken', token);
    this.token = token;
  }

  clearToken() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    this.token = null;
  }

  async simulateDelay() {
    return new Promise(resolve => setTimeout(resolve, this.delayMs));
  }

  async login(email, password) {
    await this.simulateDelay();

    const user = mockUsers[email];
    
    if (!user) {
      throw {
        status: 401,
        message: 'Email não encontrado',
      };
    }

    // Senhas padrão para demo
    const validPasswords = {
      'admin@demo.com': 'Admin@123',
      'agente1@demo.com': 'Agente@123',
      'supervisor@demo.com': 'Supervisor@123',
    };

    if (password !== validPasswords[email]) {
      throw {
        status: 401,
        message: 'Senha incorreta',
      };
    }

    const accessToken = `token_${user.id}_${Date.now()}`;
    const refreshToken = `refresh_${user.id}_${Date.now()}`;

    this.setToken(accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  async logout() {
    await this.simulateDelay();
    this.clearToken();
  }

  async getCurrentUser() {
    await this.simulateDelay();

    if (!this.token) {
      throw { status: 401, message: 'Não autenticado' };
    }

    // Simular busca do usuário baseado no token
    const userId = this.token.split('_')[1];
    const user = Object.values(mockUsers).find(u => u.id === userId);

    if (!user) {
      throw { status: 401, message: 'Usuário não encontrado' };
    }

    return user;
  }

  async refreshToken() {
    await this.simulateDelay();
    const newToken = `token_${Date.now()}`;
    this.setToken(newToken);
    return { accessToken: newToken };
  }

  async getConversations() {
    await this.simulateDelay();
    return {
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    };
  }

  async sendMessage() {
    await this.simulateDelay();
    return { success: true };
  }
}

export const mockApiClient = new MockApiClient();
