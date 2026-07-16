// API Service - Cliente HTTP para backend com fallback para mock (somente em dev)
import { mockApiClient } from './apiMock';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// Mock nunca é permitido fora de desenvolvimento: em produção uma API fora
// do ar gera erro visível + retry, jamais dados fictícios.
const IS_DEV = import.meta.env.MODE === 'development';

// Mock explícito (opt-in): VITE_USE_MOCK=true ou window.USE_MOCK_API
const FORCE_MOCK = IS_DEV &&
                   (import.meta.env.VITE_USE_MOCK === 'true' || window.USE_MOCK_API);

const HEALTH_TIMEOUT_MS = 3000;
const RETRY_DELAY_MIN_MS = 5000;
const RETRY_DELAY_MAX_MS = 30000;

// Erro estruturado da API: sempre tem .status e .message (string), ao
// contrário do objeto literal anterior que explodia em error.message.includes
export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message || 'Erro na requisição');
    this.name = 'ApiError';
    this.status = status;
    this.error = data;
  }
}

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = this.getToken();
    // null = ainda não testado; as requests aguardam o 1º health check
    // (elimina a race de decidir com backendAvailable "chutado" como true)
    this.backendAvailable = null;
    this.mockActive = FORCE_MOCK;
    this.modeListeners = new Set();
    this.retryTimer = null;
    this.retryDelay = RETRY_DELAY_MIN_MS;
    this.ready = FORCE_MOCK ? Promise.resolve() : this.testConnection();
  }

  // ── Modo mock observável (banner de demonstração) ─────────────────────────
  isMockActive() {
    return this.mockActive;
  }

  onModeChange(callback) {
    this.modeListeners.add(callback);
    return () => this.modeListeners.delete(callback);
  }

  setMockActive(active) {
    if (this.mockActive === active) return;
    this.mockActive = active;
    this.modeListeners.forEach((cb) => {
      try {
        cb(active);
      } catch (err) {
        console.error('Erro em listener de modo da API:', err);
      }
    });
  }

  // ── Detecção de backend com revalidação (backoff 5s → 30s) ────────────────
  async testConnection() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      this.backendAvailable = response.ok;
    } catch {
      this.backendAvailable = false;
    }

    if (this.backendAvailable) {
      this.retryDelay = RETRY_DELAY_MIN_MS;
      if (!FORCE_MOCK) this.setMockActive(false);
    } else {
      console.warn(
        IS_DEV
          ? '⚠️ Backend não disponível. Usando dados mock para demonstração.'
          : '⚠️ Backend não disponível. Tentando reconectar...',
      );
      this.scheduleHealthRetry();
    }
    return this.backendAvailable;
  }

  scheduleHealthRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.testConnection();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_DELAY_MAX_MS);
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

  // Fallback controlado: mock só em desenvolvimento; em produção, erro
  // visível com retry agendado (nunca dados fictícios — F2-1)
  fallbackToMock(endpoint, options) {
    this.scheduleHealthRetry();
    if (IS_DEV) {
      this.setMockActive(true);
      return this.requestMock(endpoint, options);
    }
    throw new ApiError(
      503,
      'Servidor indisponível no momento. Reconectando automaticamente — tente novamente em instantes.',
    );
  }

  async request(endpoint, options = {}) {
    if (FORCE_MOCK) {
      return this.requestMock(endpoint, options);
    }

    // Aguarda o 1º health check antes de decidir real × mock (F2-3)
    if (this.backendAvailable === null) {
      await this.ready;
    }

    if (!this.backendAvailable) {
      return this.fallbackToMock(endpoint, options);
    }

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.request(endpoint, options);
        } else {
          this.clearToken();
          window.location.href = '/login';
          throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
        }
      }

      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(
          response.status,
          data.message || 'Erro na requisição',
          data,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error('API Error:', error);
      // fetch lança TypeError em falha de rede (backend caiu / sem conexão)
      if (error instanceof TypeError) {
        this.backendAvailable = false;
        return this.fallbackToMock(endpoint, options);
      }
      throw error;
    }
  }

  // Fallback para Mock API
  async requestMock(endpoint, options) {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    // Ignora query string e quebra o path em segmentos: /users/user-1 → ['users', 'user-1']
    const seg = endpoint.split('?')[0].split('/').filter(Boolean);
    const [resource, id, sub, subId] = seg;

    if (endpoint === '/auth/login') {
      return mockApiClient.login(body.email, body.password);
    }
    if (endpoint === '/auth/logout') {
      return mockApiClient.logout();
    }
    if (endpoint === '/auth/me') {
      return mockApiClient.getCurrentUser();
    }
    if (endpoint === '/auth/refresh') {
      return mockApiClient.refreshToken();
    }

    if (resource === 'conversations') {
      if (sub === 'messages' && method === 'POST') {
        return mockApiClient.sendMessage(id, body.content);
      }
      return mockApiClient.getConversations();
    }

    if (resource === 'users') {
      if (!id && method === 'GET') return mockApiClient.getUsers();
      if (!id && method === 'POST') return mockApiClient.createUser(body);
      if (id && method === 'PATCH') return mockApiClient.updateUser(id, body);
      if (id && method === 'DELETE') return mockApiClient.deleteUser(id);
    }

    if (resource === 'departments') {
      if (!id && method === 'GET') return mockApiClient.getDepartments();
      if (!id && method === 'POST') return mockApiClient.createDepartment(body);
      if (id && sub === 'users' && method === 'POST') {
        return mockApiClient.addUserToDepartment(id, body.userId);
      }
      if (id && sub === 'users' && subId && method === 'DELETE') {
        return mockApiClient.removeUserFromDepartment(id, subId);
      }
      if (id && method === 'GET') return mockApiClient.getDepartment(id);
      if (id && method === 'DELETE') return mockApiClient.deleteDepartment(id);
    }

    if (resource === 'whatsapp') {
      if (!id && method === 'GET') return mockApiClient.getWhatsappConnections();
      if (!id && method === 'POST') return mockApiClient.createWhatsappConnection(body);
      if (id && sub === 'qrcode') return mockApiClient.getWhatsappQrCode(id);
      if (id && sub === 'status') return mockApiClient.getWhatsappStatus(id);
      if (id && sub === 'disconnect') return mockApiClient.disconnectWhatsapp(id);
      if (id && method === 'DELETE') return mockApiClient.deleteWhatsappConnection(id);
    }

    throw new ApiError(404, 'Endpoint não implementado no mock');
  }

  // AUTH ENDPOINTS
  async login(email, password) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.accessToken) {
      this.setToken(response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
    }

    return response;
  }

  async register(data) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.clearToken();
    }
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
      const response = await this.request('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });

      if (response.accessToken) {
        this.setToken(response.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getCurrentUser() {
    return this.request('/auth/me', { method: 'GET' });
  }

  // CONVERSATIONS
  async getConversations(page = 1, limit = 20) {
    return this.request(`/conversations?page=${page}&limit=${limit}`, {
      method: 'GET',
    });
  }

  async getConversation(id) {
    return this.request(`/conversations/${id}`, { method: 'GET' });
  }

  async getMessages(conversationId, limit = 50) {
    // Retorna { data: [mensagens em ordem cronológica], meta }
    return this.request(`/conversations/${conversationId}/messages?limit=${limit}`, {
      method: 'GET',
    });
  }

  async sendMessage(conversationId, text) {
    // Contrato do SendMessageDto do backend: { type, content }.
    // O ValidationPipe usa forbidNonWhitelisted — campos extras são rejeitados.
    return this.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ type: 'TEXT', content: text }),
    });
  }

  // CONTACTS
  async getContacts() {
    return this.request('/contacts', { method: 'GET' });
  }

  // USERS
  async getUsers() {
    return this.request('/users', { method: 'GET' });
  }

  async createUser(data) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id, data) {
    return this.request(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id) {
    return this.request(`/users/${id}`, { method: 'DELETE' });
  }

  // DEPARTMENTS (grupos/setores)
  async getDepartments() {
    return this.request('/departments', { method: 'GET' });
  }

  async getDepartment(id) {
    return this.request(`/departments/${id}`, { method: 'GET' });
  }

  async createDepartment(data) {
    return this.request('/departments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDepartment(id, data) {
    return this.request(`/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteDepartment(id) {
    return this.request(`/departments/${id}`, { method: 'DELETE' });
  }

  async addUserToDepartment(departmentId, userId) {
    return this.request(`/departments/${departmentId}/users`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async removeUserFromDepartment(departmentId, userId) {
    return this.request(`/departments/${departmentId}/users/${userId}`, {
      method: 'DELETE',
    });
  }

  // WHATSAPP (conexões via QR Code)
  async getWhatsappConnections() {
    return this.request('/whatsapp', { method: 'GET' });
  }

  async createWhatsappConnection(data) {
    return this.request('/whatsapp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getWhatsappQrCode(id) {
    // Retorna { qrCode: <base64>, code }
    return this.request(`/whatsapp/${id}/qrcode`, { method: 'GET' });
  }

  async getWhatsappStatus(id) {
    // Sincroniza o status com a Evolution API
    return this.request(`/whatsapp/${id}/status`, { method: 'GET' });
  }

  async disconnectWhatsapp(id) {
    return this.request(`/whatsapp/${id}/disconnect`, { method: 'POST' });
  }

  async deleteWhatsappConnection(id) {
    return this.request(`/whatsapp/${id}`, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
