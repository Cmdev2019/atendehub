// Mock API - Para testes sem backend
// Simula as respostas do API real
import { initialConversations } from '../data/mockConversations';

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

// ── Estado em memória para a tela de Configurações (demo sem backend) ───────
let mockIdSeq = 100;
const nextId = (prefix) => `${prefix}-${mockIdSeq++}`;

const mockUsersList = Object.values(mockUsers).map((u) => ({ ...u, isActive: true }));

const mockDepartments = [
  { id: 'dept-1', name: 'Comercial', color: '#0f766e', users: [mockUsersList[1]] },
  { id: 'dept-2', name: 'Suporte', color: '#7c3aed', users: [] },
];

const mockConnections = [
  { id: 'conn-1', name: 'Comercial', status: 'DISCONNECTED', phone: null, statusPolls: 0, departmentId: null },
];

const mockQueues = [
  {
    id: 'queue-1', name: 'Comercial', strategy: 'ROUND_ROBIN', maxWaitSecs: 300,
    greetingMsg: 'Olá! Em instantes um atendente vai te responder.',
    departmentId: 'dept-1', isActive: true,
  },
];

// Store de conversas em memória — mesmas fixtures usadas como estado inicial
// do useConversations (F1-3), para que getConversations/getConversation/
// getMessages sejam consistentes entre si em modo demonstração.
const mockConversationsList = initialConversations.map((c) => ({ ...c, messages: [...c.messages] }));
let mockMessageSeq = 1000;

// QR de demonstração (SVG inline — não é um QR real)
const MOCK_QR_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<rect width="240" height="240" fill="#fff"/>' +
      '<rect x="20" y="20" width="60" height="60" fill="#000"/>' +
      '<rect x="160" y="20" width="60" height="60" fill="#000"/>' +
      '<rect x="20" y="160" width="60" height="60" fill="#000"/>' +
      '<rect x="100" y="100" width="40" height="40" fill="#000"/>' +
      '<text x="120" y="230" font-size="12" text-anchor="middle" fill="#666">QR de demonstração (mock)</text>' +
    '</svg>',
  );

const stripCount = (dept) => ({
  ...dept,
  _count: { users: dept.users.length },
});

const withQueueRelations = (queue) => {
  const dept = mockDepartments.find((d) => d.id === queue.departmentId);
  return {
    ...queue,
    department: dept ? { id: dept.id, name: dept.name, color: dept.color } : null,
    _count: { conversations: 0 },
  };
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
      // Mesma mensagem genérica do backend real (evita enumeração de contas)
      throw {
        status: 401,
        message: 'Usuário ou senha incorreta.',
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
        message: 'Usuário ou senha incorreta.',
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
    // Preserva o id do usuário embutido no token (formato `token_<id>_<ts>`,
    // igual ao login) — sem isso, getCurrentUser() (usado por qualquer
    // rota "/me") quebra com "Usuário não encontrado" após o 1º refresh.
    // O socket em modo mock reconecta com token inválido e dispara vários
    // refreshes automáticos, então esse bug aparecia rápido na prática.
    const userId = this.token?.split('_')[1];
    const newToken = userId ? `token_${userId}_${Date.now()}` : `token_${Date.now()}`;
    this.setToken(newToken);
    return { accessToken: newToken };
  }

  async getConversations() {
    await this.simulateDelay();
    return {
      data: mockConversationsList,
      meta: { total: mockConversationsList.length, page: 1, limit: 20, totalPages: 1 },
    };
  }

  async getConversation(id) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === id);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    return conv;
  }

  async getMessages(conversationId) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === conversationId);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    return {
      data: conv.messages,
      meta: { count: conv.messages.length, hasMore: false, nextCursor: null },
    };
  }

  async sendMessage(conversationId, content) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === conversationId);
    const message = {
      id: `mock-msg-${mockMessageSeq++}`,
      senderType: 'AGENT',
      content: content ?? '',
      type: 'TEXT',
      status: 'SENT',
      sentAt: new Date().toISOString(),
      sender: { id: 'mock-agent', name: 'Você', avatarUrl: null, role: 'AGENT' },
    };
    if (conv) conv.messages.push(message);
    return message;
  }

  // ── USERS ──────────────────────────────────────────────────────────────────
  async getUsers() {
    await this.simulateDelay();
    return { data: mockUsersList };
  }

  async createUser(data) {
    await this.simulateDelay();
    if (mockUsersList.some((u) => u.email === data.email)) {
      throw { status: 409, message: 'E-mail já cadastrado' };
    }
    const user = {
      id: nextId('user'),
      name: data.name,
      email: data.email,
      role: data.role || 'AGENT',
      companyId: 'comp-1',
      avatarUrl: null,
      isActive: true,
    };
    mockUsersList.push(user);
    return user;
  }

  async updateUser(id, data) {
    await this.simulateDelay();
    const user = mockUsersList.find((u) => u.id === id);
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };
    Object.assign(user, data);
    return user;
  }

  async deleteUser(id) {
    await this.simulateDelay();
    const idx = mockUsersList.findIndex((u) => u.id === id);
    if (idx === -1) throw { status: 404, message: 'Usuário não encontrado' };
    mockUsersList.splice(idx, 1);
    mockDepartments.forEach((d) => {
      d.users = d.users.filter((u) => u.id !== id);
    });
    return { success: true };
  }

  // ── Perfil próprio (F8-7) ───────────────────────────────────────────────────
  // mockUsersList (editável por admin) e mockUsers (dict de login, chave por
  // e-mail) são estruturas separadas — atualiza as duas pra getCurrentUser()
  // continuar consistente depois de um refresh de página.
  async updateOwnProfile(id, data) {
    await this.simulateDelay();
    const user = mockUsersList.find((u) => u.id === id);
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };
    Object.assign(user, data);
    const loginEntry = Object.values(mockUsers).find((u) => u.id === id);
    if (loginEntry) Object.assign(loginEntry, data);
    return user;
  }

  async uploadAvatar(id, dataUrl) {
    return this.updateOwnProfile(id, { avatarUrl: dataUrl });
  }

  async changePassword(id, data) {
    await this.simulateDelay();
    const user = mockUsersList.find((u) => u.id === id);
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };
    if (!data?.currentPassword) {
      throw { status: 400, message: 'Senha atual incorreta' };
    }
    // Mock não guarda hash de senha real — simula sucesso sempre que a senha
    // atual foi informada (validação de força já ocorre no form do front)
    return { message: 'Senha atualizada com sucesso' };
  }

  // ── DEPARTMENTS ────────────────────────────────────────────────────────────
  async getDepartments() {
    await this.simulateDelay();
    return { data: mockDepartments.map(stripCount) };
  }

  async getDepartment(id) {
    await this.simulateDelay();
    const dept = mockDepartments.find((d) => d.id === id);
    if (!dept) throw { status: 404, message: 'Grupo não encontrado' };
    return stripCount(dept);
  }

  async createDepartment(data) {
    await this.simulateDelay();
    const dept = { id: nextId('dept'), name: data.name, color: data.color || '#0f766e', users: [] };
    mockDepartments.push(dept);
    return stripCount(dept);
  }

  async deleteDepartment(id) {
    await this.simulateDelay();
    const idx = mockDepartments.findIndex((d) => d.id === id);
    if (idx === -1) throw { status: 404, message: 'Grupo não encontrado' };
    mockDepartments.splice(idx, 1);
    return { success: true };
  }

  async addUserToDepartment(departmentId, userId) {
    await this.simulateDelay();
    const dept = mockDepartments.find((d) => d.id === departmentId);
    const user = mockUsersList.find((u) => u.id === userId);
    if (!dept || !user) throw { status: 404, message: 'Grupo ou usuário não encontrado' };
    if (!dept.users.some((u) => u.id === userId)) dept.users.push(user);
    return stripCount(dept);
  }

  async removeUserFromDepartment(departmentId, userId) {
    await this.simulateDelay();
    const dept = mockDepartments.find((d) => d.id === departmentId);
    if (!dept) throw { status: 404, message: 'Grupo não encontrado' };
    dept.users = dept.users.filter((u) => u.id !== userId);
    return stripCount(dept);
  }

  // ── WHATSAPP ───────────────────────────────────────────────────────────────
  async getWhatsappConnections() {
    await this.simulateDelay();
    return { data: mockConnections.map(({ statusPolls, ...c }) => c) };
  }

  async createWhatsappConnection(data) {
    await this.simulateDelay();
    const conn = {
      id: nextId('conn'), name: data.name, status: 'DISCONNECTED', phone: null,
      statusPolls: 0, departmentId: data.departmentId || null,
    };
    mockConnections.push(conn);
    const { statusPolls, ...rest } = conn;
    return rest;
  }

  async getWhatsappQrCode(id) {
    await this.simulateDelay();
    const conn = mockConnections.find((c) => c.id === id);
    if (!conn) throw { status: 404, message: 'Conexão não encontrada' };
    conn.status = 'QR_CODE';
    conn.statusPolls = 0;
    return { qrCode: MOCK_QR_IMAGE };
  }

  async getWhatsappStatus(id) {
    const conn = mockConnections.find((c) => c.id === id);
    if (!conn) throw { status: 404, message: 'Conexão não encontrada' };
    // Simula pareamento: após alguns polls com QR na tela, "conecta"
    if (conn.status === 'QR_CODE') {
      conn.statusPolls += 1;
      if (conn.statusPolls >= 3) {
        conn.status = 'CONNECTED';
        conn.phone = '+55 11 99999-0001';
      }
    }
    return { status: conn.status, phone: conn.phone };
  }

  async disconnectWhatsapp(id) {
    await this.simulateDelay();
    const conn = mockConnections.find((c) => c.id === id);
    if (!conn) throw { status: 404, message: 'Conexão não encontrada' };
    conn.status = 'DISCONNECTED';
    conn.phone = null;
    conn.statusPolls = 0;
    return { status: conn.status };
  }

  async deleteWhatsappConnection(id) {
    await this.simulateDelay();
    const idx = mockConnections.findIndex((c) => c.id === id);
    if (idx === -1) throw { status: 404, message: 'Conexão não encontrada' };
    mockConnections.splice(idx, 1);
    return { success: true };
  }

  // ── QUEUES (filas de distribuição, F8-8) ────────────────────────────────────
  async getQueues() {
    await this.simulateDelay();
    return { data: mockQueues.map(withQueueRelations) };
  }

  async createQueue(data) {
    await this.simulateDelay();
    if (mockQueues.some((q) => q.name === data.name)) {
      throw { status: 409, message: 'Já existe uma fila com este nome' };
    }
    const queue = {
      id: nextId('queue'),
      name: data.name,
      strategy: data.strategy || 'ROUND_ROBIN',
      maxWaitSecs: data.maxWaitSecs || 300,
      greetingMsg: data.greetingMsg || null,
      departmentId: data.departmentId || null,
      isActive: true,
    };
    mockQueues.push(queue);
    return withQueueRelations(queue);
  }

  async updateQueue(id, data) {
    await this.simulateDelay();
    const queue = mockQueues.find((q) => q.id === id);
    if (!queue) throw { status: 404, message: 'Fila não encontrada' };
    Object.assign(queue, data);
    return withQueueRelations(queue);
  }

  async deleteQueue(id) {
    await this.simulateDelay();
    const idx = mockQueues.findIndex((q) => q.id === id);
    if (idx === -1) throw { status: 404, message: 'Fila não encontrada' };
    mockQueues.splice(idx, 1);
    return { success: true };
  }
}

export const mockApiClient = new MockApiClient();
