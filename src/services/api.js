// API Service - Cliente HTTP para backend com fallback para mock
import { mockApiClient } from './apiMock';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// Detectar se deve usar mock (dev)
const USE_MOCK = import.meta.env.MODE === 'development' &&
                 (import.meta.env.VITE_USE_MOCK === 'true' || window.USE_MOCK_API);

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = this.getToken();
    this.useMock = USE_MOCK;
    this.backendAvailable = true;
    this.testConnection();
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        timeout: 3000,
      });
      this.backendAvailable = response.ok;
    } catch {
      this.backendAvailable = false;
      console.warn('⚠️ Backend não disponível. Usando dados mock para demonstração.');
    }
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

  async request(endpoint, options = {}) {
    // Se backend não está disponível, usar mock
    if (!this.backendAvailable) {
      return this.requestMock(endpoint, options);
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
          throw new Error('Sessão expirada. Faça login novamente.');
        }
      }

      const data = await response.json();

      if (!response.ok) {
        throw {
          status: response.status,
          message: data.message || 'Erro na requisição',
          error: data,
        };
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      // Fallback para mock se erro de rede
      if (error.message.includes('fetch') || error.message.includes('Failed')) {
        this.backendAvailable = false;
        return this.requestMock(endpoint, options);
      }
      throw error;
    }
  }

  // Fallback para Mock API
  async requestMock(endpoint, options) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};

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
    if (endpoint.startsWith('/conversations')) {
      return mockApiClient.getConversations();
    }

    throw { status: 404, message: 'Endpoint não implementado no mock' };
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

  async sendMessage(conversationId, text) {
    return this.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
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
}

export const apiClient = new ApiClient();
