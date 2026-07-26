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

// Senhas de empresas auto-cadastradas em modo demo (B-9) — permite logar de
// novo com o mesmo e-mail/senha depois de um logout, sem persistir nada de
// verdade (mock reinicia a cada reload da página).
const mockRegisteredPasswords = {};

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

// Catálogo de tags da empresa (B-27) — mesmos ids/nomes/cores já embutidos
// nas conversas de `initialConversations`, pra o catálogo bater com o que
// já aparece atribuído nas fixtures de demonstração.
const mockTags = [
  { id: 'tag-1', name: 'Entrega', color: '#ef4444' },
  { id: 'tag-2', name: 'Prioridade', color: '#f59e0b' },
  { id: 'tag-3', name: 'Plano anual', color: '#0f766e' },
  { id: 'tag-4', name: 'Produto', color: '#3b82f6' },
  { id: 'tag-5', name: 'Nota fiscal', color: '#f59e0b' },
];

// Store de conversas em memória — mesmas fixtures usadas como estado inicial
// do useConversations (F1-3), para que getConversations/getConversation/
// getMessages sejam consistentes entre si em modo demonstração.
const mockConversationsList = initialConversations.map((c) => ({ ...c, messages: [...c.messages] }));
let mockMessageSeq = 1000;

// Notificações (B-8) — mesmos 2 tipos que o backend real cria (B1-3):
// SLA estourado (fan-out pra SUPERVISOR+) e conversa atribuída. Seedadas
// para o admin (user-1) pra o sino já nascer com algo pra mostrar em demo.
const mockNotifications = [
  {
    id: 'notif-1', companyId: 'comp-1', userId: 'user-1', type: 'sla_breach',
    title: 'SLA estourado',
    body: 'Uma conversa na fila ultrapassou o tempo máximo de espera.',
    data: { conversationId: mockConversationsList[0]?.id ?? null },
    readAt: null,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'notif-2', companyId: 'comp-1', userId: 'user-1', type: 'conversation_assigned',
    title: 'Conversa atribuída a você',
    body: 'Você assumiu uma nova conversa na fila.',
    data: { conversationId: mockConversationsList[1]?.id ?? null },
    readAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  },
];

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

// _count real conta uso da tag no banco (via relação Prisma); no mock, conta
// quantas conversas em memória têm a tag atribuída (não há contato separado
// da conversa no store de demonstração, por isso `contacts` fica sempre 0).
const withTagCount = (tag) => ({
  ...tag,
  _count: {
    conversations: mockConversationsList.filter((c) => c.tags?.some((t) => t.id === tag.id)).length,
    contacts: 0,
  },
});

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

    // Senhas padrão para demo + as de empresas auto-cadastradas nesta sessão
    const validPasswords = {
      'admin@demo.com': 'Admin@123',
      'agente1@demo.com': 'Agente@123',
      'supervisor@demo.com': 'Supervisor@123',
      ...mockRegisteredPasswords,
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

  // ── Auto-cadastro de empresa (B-9) ──────────────────────────────────────────
  // Mesmo shape de resposta do login (auto-login). Sem `slug`/companies store
  // de verdade no mock — nível de fidelidade suficiente pra demonstração,
  // igual ao resto do apiMock (ex.: filas/departamentos não são
  // multi-tenant aqui, é sempre a mesma "empresa" demo).
  async registerCompany({ companyName: _companyName, name, email, password }) {
    await this.simulateDelay();
    const normalizedEmail = (email || '').toLowerCase().trim();

    if (mockUsers[normalizedEmail]) {
      throw { status: 409, message: 'Já existe uma conta com este e-mail' };
    }

    const user = {
      id: nextId('user'),
      email: normalizedEmail,
      name,
      role: 'ADMIN',
      companyId: nextId('comp'),
      avatarUrl: null,
    };

    mockUsers[normalizedEmail] = user;
    mockUsersList.push({ ...user, isActive: true });
    mockRegisteredPasswords[normalizedEmail] = password;

    const accessToken = `token_${user.id}_${Date.now()}`;
    const refreshToken = `refresh_${user.id}_${Date.now()}`;
    this.setToken(accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    return { accessToken, refreshToken, expiresIn: 900, user };
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

  // { status, agentId, page, limit } — mesmos filtros do backend real
  // (B-31: abas "Fila de atendimento"/"Meus"/"Em atendimento"/"Encerrados").
  // Sem `status`, exclui CLOSED por padrão — mesma regra do backend.
  async getConversations({ status, agentId, page = 1, limit = 20 } = {}) {
    await this.simulateDelay();
    let list = mockConversationsList.filter((c) =>
      status ? c.status === status : c.status !== 'CLOSED',
    );
    if (agentId) list = list.filter((c) => c.agent?.id === agentId);

    const total = list.length;
    const start = (page - 1) * limit;
    const data = list.slice(start, start + limit);
    return { data, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  // Atender (B-31): atribui e move pra OPEN, igual ao ConversationService#assign real.
  async assignConversation(id, agentId) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === id);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    const agent = mockUsersList.find((u) => u.id === agentId) ?? null;
    conv.agent = agent ? { id: agent.id, name: agent.name, avatarUrl: agent.avatarUrl } : null;
    if (agentId) conv.status = 'OPEN';
    return { id: conv.id, status: conv.status, agent: conv.agent };
  }

  // Encerrar (B-31): igual ao ConversationService#updateStatus real.
  // `resolution` (B-32): motivo do encerramento (RESOLVED/UNRESOLVED),
  // persistido só quando status='CLOSED' — mesma regra do backend real.
  async updateConversationStatus(id, status, resolution) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === id);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    conv.status = status;
    if (status === 'RESOLVED') conv.resolvedAt = new Date().toISOString();
    if (status === 'CLOSED') {
      conv.closedAt = new Date().toISOString();
      conv.resolution = resolution ?? null;
    }
    return { id: conv.id, status: conv.status, resolution: conv.resolution ?? null };
  }

  async getConversation(id) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === id);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    return conv;
  }

  // Métricas agregadas (B-2) — mesmo shape do endpoint real, calculado sobre
  // o store de conversas do mock (não paginado, como o real também não é).
  async getConversationStats() {
    await this.simulateDelay();
    const active = mockConversationsList.filter((c) => c.status !== 'CLOSED');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return {
      totalActive: active.length,
      waiting: active.filter((c) => c.status === 'WAITING').length,
      open: active.filter((c) => c.status === 'OPEN').length,
      resolvedToday: mockConversationsList.filter(
        (c) => c.resolvedAt && new Date(c.resolvedAt) >= startOfToday,
      ).length,
      unreadCount: active.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
      unreadConversations: active.filter((c) => (c.unreadCount || 0) > 0).length,
    };
  }

  // Resumo do dashboard (B-32) — mesmo cálculo do backend real, sobre o
  // store de conversas do mock: attended/notAttended por createdAt no
  // período, resolved/unresolved/unlabeled por closedAt no período.
  async getDashboardSummary({ from, to } = {}) {
    await this.simulateDelay();
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const inPeriod = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= fromDate && d <= toDate;
    };

    const createdInPeriod = mockConversationsList.filter((c) => inPeriod(c.createdAt));
    const closedInPeriod = mockConversationsList.filter(
      (c) => c.status === 'CLOSED' && inPeriod(c.closedAt),
    );

    return {
      period: { from: fromDate, to: toDate },
      totalConversations: createdInPeriod.length,
      attended: createdInPeriod.filter((c) => c.agent?.id).length,
      notAttended: createdInPeriod.filter((c) => !c.agent?.id).length,
      totalClosed: closedInPeriod.length,
      resolved: closedInPeriod.filter((c) => c.resolution === 'RESOLVED').length,
      unresolved: closedInPeriod.filter((c) => c.resolution === 'UNRESOLVED').length,
      unlabeled: closedInPeriod.filter((c) => !c.resolution).length,
    };
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

  // Reset administrativo de senha (B-26) — mock não guarda hash nenhum;
  // só devolve uma senha temporária plausível pra exercitar a UI de exibição
  async resetUserPassword(id) {
    await this.simulateDelay();
    const user = mockUsersList.find((u) => u.id === id);
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };
    const temporaryPassword = `Trocar${Math.floor(1000 + Math.random() * 9000)}`;
    return { temporaryPassword };
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

  // ── NOTIFICATIONS (B-8) — sempre filtradas pelo próprio usuário ────────────
  async getNotifications(userId, { unreadOnly, page = 1, limit = 20 } = {}) {
    await this.simulateDelay();
    let list = mockNotifications.filter((n) => n.userId === userId);
    if (unreadOnly) list = list.filter((n) => !n.readAt);
    list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = list.length;
    const start = (page - 1) * limit;
    const data = list.slice(start, start + limit);
    return { data, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async markNotificationRead(userId, id) {
    await this.simulateDelay();
    const notification = mockNotifications.find((n) => n.id === id && n.userId === userId);
    if (!notification) throw { status: 404, message: 'Notificação não encontrada' };
    notification.readAt = notification.readAt ?? new Date().toISOString();
    return notification;
  }

  async markAllNotificationsRead(userId) {
    await this.simulateDelay();
    let count = 0;
    mockNotifications.forEach((n) => {
      if (n.userId === userId && !n.readAt) {
        n.readAt = new Date().toISOString();
        count += 1;
      }
    });
    return { message: `${count} notificação(ões) marcada(s) como lida(s)` };
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

  // ── TAGS (B-27) ──────────────────────────────────────────────────────────
  async getTags() {
    await this.simulateDelay();
    return mockTags.map(withTagCount);
  }

  async createTag(data) {
    await this.simulateDelay();
    if (mockTags.some((t) => t.name === data.name)) {
      throw { status: 409, message: 'Já existe uma tag com este nome' };
    }
    const tag = { id: nextId('tag'), name: data.name, color: data.color || '#6366f1' };
    mockTags.push(tag);
    return withTagCount(tag);
  }

  async updateTag(id, data) {
    await this.simulateDelay();
    const tag = mockTags.find((t) => t.id === id);
    if (!tag) throw { status: 404, message: 'Tag não encontrada' };
    if (data.name && mockTags.some((t) => t.id !== id && t.name === data.name)) {
      throw { status: 409, message: 'Já existe uma tag com este nome' };
    }
    Object.assign(tag, data);
    // Reflete o nome/cor atualizados nas conversas que já têm a tag atribuída
    // (o backend faz o mesmo, por trás de uma FK real em vez de objeto solto).
    mockConversationsList.forEach((c) => {
      c.tags = (c.tags || []).map((t) => (t.id === id ? { id: tag.id, name: tag.name, color: tag.color } : t));
    });
    return withTagCount(tag);
  }

  async deleteTag(id) {
    await this.simulateDelay();
    const idx = mockTags.findIndex((t) => t.id === id);
    if (idx === -1) throw { status: 404, message: 'Tag não encontrada' };
    mockTags.splice(idx, 1);
    mockConversationsList.forEach((c) => {
      c.tags = (c.tags || []).filter((t) => t.id !== id);
    });
    return { message: 'Tag removida com sucesso' };
  }

  async addConversationTag(conversationId, tagId) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === conversationId);
    const tag = mockTags.find((t) => t.id === tagId);
    if (!conv || !tag) throw { status: 404, message: 'Conversa ou tag não encontrada' };
    if (!conv.tags?.some((t) => t.id === tagId)) {
      conv.tags = [...(conv.tags || []), tag];
    }
    return { message: 'Tag atribuída à conversa' };
  }

  async removeConversationTag(conversationId, tagId) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === conversationId);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    conv.tags = (conv.tags || []).filter((t) => t.id !== tagId);
    return { message: 'Tag removida da conversa' };
  }
}

export const mockApiClient = new MockApiClient();
