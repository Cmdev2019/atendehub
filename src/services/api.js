// API Service - Cliente HTTP para backend com fallback para mock (somente em dev)
import { mockApiClient } from './apiMock';

// Converte um File em data URL — usado só no fallback mock do upload de
// avatar (sem backend/MinIO real, a "URL" vira o próprio base64 da imagem)
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

    // FormData (upload de mídia): o navegador define o Content-Type com o
    // boundary — defini-lo manualmente quebraria o multipart
    const isFormData = options.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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

      // 204 No Content (logout, revoke) não tem corpo — response.json()
      // explode com "Unexpected end of JSON input" num body vazio.
      const data = response.status === 204 ? null : await response.json();

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
    const body =
      options.body && typeof options.body === 'string'
        ? JSON.parse(options.body)
        : {};
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
    if (endpoint === '/auth/register-company') {
      return mockApiClient.registerCompany(body);
    }

    if (resource === 'conversations') {
      if (id === 'stats') return mockApiClient.getConversationStats();
      if (sub === 'messages' && method === 'POST') {
        // subId === 'media' → envio de mídia; no mock vira texto ilustrativo
        if (subId === 'media') {
          return mockApiClient.sendMessage(id, '[Imagem enviada]');
        }
        return mockApiClient.sendMessage(id, body.content);
      }
      if (sub === 'messages' && method === 'GET') {
        return mockApiClient.getMessages(id);
      }
      if (sub === 'tags' && subId && method === 'POST') {
        return mockApiClient.addConversationTag(id, subId);
      }
      if (sub === 'tags' && subId && method === 'DELETE') {
        return mockApiClient.removeConversationTag(id, subId);
      }
      if (id) return mockApiClient.getConversation(id);
      return mockApiClient.getConversations();
    }

    if (resource === 'users') {
      if (!id && method === 'GET') return mockApiClient.getUsers();
      if (!id && method === 'POST') return mockApiClient.createUser(body);
      if (id === 'me' && sub === 'avatar' && method === 'POST') {
        const file = options.body instanceof FormData ? options.body.get('file') : null;
        if (!file) throw new ApiError(400, 'Arquivo de avatar ausente ou vazio');
        const dataUrl = await fileToDataUrl(file);
        const currentUser = await mockApiClient.getCurrentUser();
        return mockApiClient.uploadAvatar(currentUser.id, dataUrl);
      }
      if (id === 'me' && !sub && method === 'PATCH') {
        const currentUser = await mockApiClient.getCurrentUser();
        return mockApiClient.updateOwnProfile(currentUser.id, body);
      }
      if (id && sub === 'password' && method === 'PATCH') {
        return mockApiClient.changePassword(id, body);
      }
      if (id && sub === 'reset-password' && method === 'POST') {
        return mockApiClient.resetUserPassword(id);
      }
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

    if (resource === 'queues') {
      if (!id && method === 'GET') return mockApiClient.getQueues();
      if (!id && method === 'POST') return mockApiClient.createQueue(body);
      if (id && method === 'PATCH') return mockApiClient.updateQueue(id, body);
      if (id && method === 'DELETE') return mockApiClient.deleteQueue(id);
    }

    if (resource === 'tags') {
      if (!id && method === 'GET') return mockApiClient.getTags();
      if (!id && method === 'POST') return mockApiClient.createTag(body);
      if (id && method === 'PATCH') return mockApiClient.updateTag(id, body);
      if (id && method === 'DELETE') return mockApiClient.deleteTag(id);
    }

    if (resource === 'notifications') {
      const currentUser = await mockApiClient.getCurrentUser();
      if (!id && method === 'GET') {
        const params = new URLSearchParams(endpoint.split('?')[1] || '');
        return mockApiClient.getNotifications(currentUser.id, {
          unreadOnly: params.get('unreadOnly') === 'true',
          page: params.get('page') ? Number(params.get('page')) : undefined,
          limit: params.get('limit') ? Number(params.get('limit')) : undefined,
        });
      }
      if (id === 'read-all' && method === 'PATCH') {
        return mockApiClient.markAllNotificationsRead(currentUser.id);
      }
      if (id && sub === 'read' && method === 'PATCH') {
        return mockApiClient.markNotificationRead(currentUser.id, id);
      }
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

  // Auto-cadastro público de empresa (B-9) — mesmo shape de resposta do
  // login (auto-login: quem se cadastra já sai autenticado).
  async registerCompany({ companyName, name, email, password }) {
    const response = await this.request('/auth/register-company', {
      method: 'POST',
      body: JSON.stringify({ companyName, name, email, password }),
    });

    if (response.accessToken) {
      this.setToken(response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
    }

    return response;
  }

  async logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await this.request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
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

  // Métricas agregadas (B-2) — contagens reais da empresa, independentes
  // da paginação da fila
  async getConversationStats() {
    return this.request('/conversations/stats', { method: 'GET' });
  }

  async getMessages(conversationId, limit = 50, before) {
    // Retorna { data: [mensagens em ordem cronológica], meta: {count, hasMore, nextCursor} }
    // `before`: cursor (id da mensagem mais antiga já carregada) — busca as
    // anteriores a ela, usado no scroll infinito do histórico (B-4).
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    return this.request(`/conversations/${conversationId}/messages?${params}`, {
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

  async sendMediaMessage(conversationId, file, caption) {
    // Upload direto (print colado ou arquivo anexado) — multipart
    const form = new FormData();
    form.append('file', file, file.name || 'imagem.png');
    if (caption) form.append('caption', caption);

    return this.request(`/conversations/${conversationId}/messages/media`, {
      method: 'POST',
      body: form,
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

  // Auto-edição do próprio perfil (F8-7) — nunca aceita role/isActive
  async updateOwnProfile(data) {
    return this.request('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async uploadAvatar(file) {
    const form = new FormData();
    form.append('file', file, file.name || 'avatar.png');
    return this.request('/users/me/avatar', {
      method: 'POST',
      body: form,
    });
  }

  async changePassword(id, data) {
    return this.request(`/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Reset administrativo de senha (B-26) — ADMIN gera senha temporária pra
  // outro usuário travado; retorna { temporaryPassword } só nesta chamada
  async resetUserPassword(id) {
    return this.request(`/users/${id}/reset-password`, { method: 'POST' });
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

  // QUEUES (filas de distribuição)
  async getQueues() {
    return this.request('/queues', { method: 'GET' });
  }

  async createQueue(data) {
    return this.request('/queues', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateQueue(id, data) {
    return this.request(`/queues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteQueue(id) {
    return this.request(`/queues/${id}`, { method: 'DELETE' });
  }

  // TAGS (B-27) — CRUD requer SUPERVISOR+; atribuir/remover de uma conversa
  // é liberado pra qualquer usuário autenticado (ver tag.controller.ts vs.
  // conversation.controller.ts)
  async getTags() {
    return this.request('/tags', { method: 'GET' });
  }

  async createTag(data) {
    return this.request('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTag(id, data) {
    return this.request(`/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id) {
    return this.request(`/tags/${id}`, { method: 'DELETE' });
  }

  async addConversationTag(conversationId, tagId) {
    return this.request(`/conversations/${conversationId}/tags/${tagId}`, { method: 'POST' });
  }

  async removeConversationTag(conversationId, tagId) {
    return this.request(`/conversations/${conversationId}/tags/${tagId}`, { method: 'DELETE' });
  }

  // NOTIFICATIONS (B-8) — sempre as do próprio usuário logado
  async getNotifications({ unreadOnly, page, limit } = {}) {
    const params = new URLSearchParams();
    if (unreadOnly) params.set('unreadOnly', 'true');
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return this.request(`/notifications${qs ? `?${qs}` : ''}`, { method: 'GET' });
  }

  async markNotificationRead(id) {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', { method: 'PATCH' });
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
