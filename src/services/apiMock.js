// Mock API - Para testes sem backend
// Simula as respostas do API real
import { initialConversations } from '../data/mockConversations';
import { MAX_ACTIVE_DEPARTMENTS } from '../utils/limits';

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
  // Agentes já referenciados como `conversation.agent`/`message.sender` nas
  // fixtures de `mockConversations.js` (Camila/Nando/Juliana) — sem entrada
  // aqui, ficavam "fantasmas": apareciam atribuídos numa conversa mas não
  // existiam em `mockUsersList` (usada por qualquer relatório/atribuição que
  // precise juntar id de agente com um usuário de verdade — achado testando
  // o relatório "por atendente", B-33, que dava sempre vazio por causa disso).
  'camila@demo.com': {
    id: 'agent-1',
    email: 'camila@demo.com',
    name: 'Camila',
    role: 'AGENT',
    companyId: 'comp-1',
    avatarUrl: null,
  },
  'nando@demo.com': {
    id: 'agent-2',
    email: 'nando@demo.com',
    name: 'Nando',
    role: 'AGENT',
    companyId: 'comp-1',
    avatarUrl: null,
  },
  'juliana@demo.com': {
    id: 'agent-3',
    email: 'juliana@demo.com',
    name: 'Juliana',
    role: 'AGENT',
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

const mockUsersList = Object.values(mockUsers).map((u) => ({ ...u, isActive: true, availability: 'OFFLINE' }));

const mockDepartments = [
  { id: 'dept-1', name: 'Comercial', color: '#0f766e', users: [mockUsersList[1]] },
  { id: 'dept-2', name: 'Suporte', color: '#7c3aed', users: [] },
];

const mockConnections = [
  { id: 'conn-1', name: 'Comercial', status: 'DISCONNECTED', phone: null, statusPolls: 0, departmentId: null },
];

const mockQueues = [
  {
    id: 'queue-1', name: 'Comercial', strategy: 'MANUAL', maxWaitSecs: 300, maxServiceSecs: null,
    greetingMsg: 'Olá! Em instantes um atendente vai te responder.',
    departmentId: 'dept-1', isActive: true,
  },
];

// Auto-atendimento (B-35) — nasce desativado e sem opção nenhuma, igual ao
// comportamento real do backend pra uma empresa que nunca configurou nada
// (AutoAttendanceService#getFlow devolve um registro "vazio", não 404).
let mockAutoAttendanceFlow = {
  id: null,
  isActive: false,
  greetingMessage: null,
  businessHours: null,
  outOfHoursMessage: null,
  inactivityTimeoutSecs: null,
  inactivityMessage: null,
  closingMessage: null,
};
const mockAutoAttendanceOptions = [];

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

// Contatos (B-34) — derivados dos mesmos contatos já referenciados nas
// conversas fixture (nome/telefone/canal batem com o que aparece na fila),
// enriquecidos com os campos que só a listagem de contatos usa (email,
// isBlocked, createdAt, contagem de conversas).
// `tags` (B-34) é um catálogo PRÓPRIO do contato — mesmas tags de
// `mockTags`, mas a atribuição é independente da conversa (Tag→Contact é uma
// relação separada de Tag→Conversation no schema real). Marina começa com
// 2 tags pra demo não nascer sem nenhum exemplo de filtro.
const mockContactsList = mockConversationsList.map((conv) => ({
  id: conv.contact.id,
  name: conv.contact.name,
  phone: conv.contact.phone,
  email: null,
  avatarUrl: conv.contact.avatarUrl,
  channel: conv.channel,
  isBlocked: false,
  createdAt: conv.createdAt,
  tags: conv.contact.id === 'contact-1' ? [mockTags[0], mockTags[1]] : [],
}));

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

const withAutoAttendanceOptionRelations = (option) => {
  const dept = mockDepartments.find((d) => d.id === option.departmentId);
  const queue = mockQueues.find((q) => q.id === option.queueId);
  return {
    ...option,
    department: dept ? { id: dept.id, name: dept.name } : null,
    queue: queue ? { id: queue.id, name: queue.name } : null,
  };
};

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

// _count real conta via relação Prisma no findAll de contatos; no mock,
// conta quantas conversas em memória apontam pro contato.
const withContactCount = (contact) => ({
  ...contact,
  _count: {
    conversations: mockConversationsList.filter((c) => c.contact.id === contact.id).length,
  },
});

// Relatórios (B-33) — mesmo cálculo/formatação do backend real
// (report.service.ts), sobre o store do mock em vez do Postgres.
const RESOLUTION_LABELS = { RESOLVED: 'Resolvido', UNRESOLVED: 'Não resolvido' };

function avgResolutionHours(convs) {
  const closed = convs.filter((c) => c.closedAt);
  if (closed.length === 0) return null;
  const totalMs = closed.reduce((sum, c) => sum + (new Date(c.closedAt) - new Date(c.createdAt)), 0);
  return totalMs / closed.length / 3_600_000;
}

function formatDateTimeBR(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatHoursBR(hours) {
  if (hours === null || hours === undefined) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}min`;
}

function escapeCsvValue(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// BOM no início: sem ele, o Excel no Windows abre acentuação em PT-BR como
// lixo (interpreta o arquivo como Latin-1 em vez de UTF-8) — mesmo motivo
// do backend real (report-export.util.ts).
const CSV_BOM = '﻿';

function rowsToCsvBlob(rows) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines = [headers.join(','), ...rows.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(','))];
  return new Blob([CSV_BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}

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
    // B-65: quem sai fica Offline, igual ao backend
    const userId = this.token?.split('_')[1];
    if (userId) this.setAvailability(userId, 'OFFLINE');
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

  // Atender (B-66): igual ao ConversationService#attend — precisa estar Online,
  // e quem chegar primeiro fica com a conversa
  async attendConversation(id) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === id);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    const me = await this.getCurrentUser();
    if (me.availability !== 'ONLINE') throw { status: 409, message: 'Fique Online para atender' };
    if (conv.status !== 'WAITING' || conv.agent) {
      throw { status: 409, message: conv.agent ? `${conv.agent.name} já está atendendo` : 'Esta conversa não está na fila' };
    }
    conv.agent = { id: me.id, name: me.name, avatarUrl: me.avatarUrl ?? null };
    conv.status = 'OPEN';
    return { id: conv.id, status: conv.status, agent: conv.agent, department: conv.department ?? null };
  }

  // Visão do supervisor (B-68): como o GET /conversations/overview, a partir
  // das conversas, setores e usuários do modo demonstração
  async getConversationsOverview() {
    await this.simulateDelay();
    const now = Date.now();
    const active = mockConversationsList.filter((c) => c.status === 'WAITING' || c.status === 'OPEN');
    const deptOf = (c) => c.department?.id ?? c.departmentId ?? null;
    const waitBreached = (c) => !!c.slaBreachedAt || (c.waitSlaDueAt && Date.parse(c.waitSlaDueAt) < now);
    const serviceBreached = (c) => !!c.serviceSlaBreachedAt || (c.serviceSlaDueAt && Date.parse(c.serviceSlaDueAt) < now);
    const lastFromClient = (c) => c.messages?.at(-1)?.senderType === 'CLIENT' || c.messages?.at(-1)?.type === 'customer';
    const users = mockUsersList.filter((u) => u.isActive !== false);
    const online = (list) => list.filter((u) => u.availability === 'ONLINE').length;

    const sector = (list, members) => {
      const waiting = list.filter((c) => c.status === 'WAITING');
      const inService = list.filter((c) => c.status === 'OPEN');
      const oldest = waiting.map((c) => c.waitingSince || c.createdAt).filter(Boolean).sort()[0] ?? null;
      return {
        waiting: waiting.length,
        oldestWaitingSince: oldest,
        waitSlaBreached: waiting.filter(waitBreached).length,
        inService: inService.length,
        serviceSlaBreached: inService.filter(serviceBreached).length,
        agentsOnline: online(members),
        agentsTotal: members.length,
      };
    };

    const departments = mockDepartments.map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      isActive: d.isActive !== false,
      ...sector(active.filter((c) => deptOf(c) === d.id), d.users ?? []),
    }));
    const noSector = sector(active.filter((c) => !deptOf(c)), []);
    if (noSector.waiting + noSector.inService > 0) {
      departments.push({ id: null, name: 'Sem setor', color: null, isActive: true, ...noSector });
    }

    const agents = users.map((u) => {
      const mine = active.filter((c) => c.status === 'OPEN' && c.agent?.id === u.id);
      return {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl ?? null,
        role: u.role,
        availability: u.availability ?? 'OFFLINE',
        availabilityChangedAt: null,
        departmentIds: mockDepartments.filter((d) => (d.users ?? []).some((m) => m.id === u.id)).map((d) => d.id),
        inService: mine.length,
        serviceSlaBreached: mine.filter(serviceBreached).length,
        awaitingReply: mine.filter(lastFromClient).length,
      };
    });

    const totals = sector(active, users);
    return { generatedAt: new Date(now).toISOString(), totals, departments, agents };
  }

  // Pegar próxima (B-68): como o POST /conversations/next — a que espera há
  // mais tempo; null (o 204 da API) quando não há nenhuma
  async attendNextConversation() {
    await this.simulateDelay();
    const me = await this.getCurrentUser();
    if (me.availability !== 'ONLINE') throw { status: 409, message: 'Fique Online para atender' };
    const waitedFrom = (c) => new Date(c.waitingSince || c.createdAt || 0).getTime();
    const [next] = mockConversationsList
      .filter((c) => c.status === 'WAITING' && !c.agent)
      .sort((a, b) => waitedFrom(a) - waitedFrom(b));
    if (!next) return null;
    next.agent = { id: me.id, name: me.name, avatarUrl: me.avatarUrl ?? null };
    next.status = 'OPEN';
    next.attendedAt = new Date().toISOString();
    return {
      id: next.id,
      status: next.status,
      waitingSince: next.waitingSince ?? null,
      attendedAt: next.attendedAt,
      serviceSlaDueAt: null,
      agent: next.agent,
      department: next.department ?? null,
    };
  }

  // Transferir (B-66): atribui e move pra OPEN (antes era também o Atender, B-31).
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
  async updateConversationStatus(id, status, resolution, resolutionNote) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === id);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    conv.status = status;
    if (status === 'RESOLVED') conv.resolvedAt = new Date().toISOString();
    if (status === 'CLOSED') {
      conv.closedAt = new Date().toISOString();
      conv.resolution = resolution ?? null;
      conv.resolutionNote = resolution === 'CANCELLED' ? resolutionNote ?? null : null;
    }
    return {
      id: conv.id,
      status: conv.status,
      resolution: conv.resolution ?? null,
      resolutionNote: conv.resolutionNote ?? null,
    };
  }

  async getConversation(id) {
    await this.simulateDelay();
    const conv = mockConversationsList.find((c) => c.id === id);
    if (!conv) throw { status: 404, message: 'Conversa não encontrada' };
    return conv;
  }

  // Métricas agregadas (B-2, ampliado no B-32) — mesmo shape do endpoint
  // real, calculado sobre o store de conversas do mock (não paginado, como
  // o real também não é). "Minhas"/"minhas sem resposta" usam o id embutido
  // no token (mesmo truque de getCurrentUser/refreshToken) — nunca um
  // parâmetro, igual ao backend real (sempre o requisitante autenticado).
  async getConversationStats() {
    await this.simulateDelay();
    const active = mockConversationsList.filter((c) => c.status !== 'CLOSED');
    const open = active.filter((c) => c.status === 'OPEN');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const userId = this.token?.split('_')[1];

    const awaitingReplyConvs = open.filter((c) => {
      const last = c.messages?.[c.messages.length - 1];
      return last?.senderType === 'CLIENT';
    });

    return {
      totalActive: active.length,
      waiting: active.filter((c) => c.status === 'WAITING').length,
      open: open.length,
      resolvedToday: mockConversationsList.filter(
        (c) => c.resolvedAt && new Date(c.resolvedAt) >= startOfToday,
      ).length,
      unreadCount: active.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
      unreadConversations: active.filter((c) => (c.unreadCount || 0) > 0).length,
      myOpen: open.filter((c) => c.agent?.id === userId).length,
      slaBreached: active.filter((c) => c.slaBreached || c.slaBreachedAt).length,
      awaitingReply: awaitingReplyConvs.length,
      myAwaitingReply: awaitingReplyConvs.filter((c) => c.agent?.id === userId).length,
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

  // Relatórios (B-33) — mesmo shape/regra do backend real (report.service.ts):
  // 'attendance' (base de atendimento), 'by-tag', 'by-agent'.
  async getReport(type, { from, to } = {}) {
    await this.simulateDelay();
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const period = { from: fromDate, to: toDate };
    const inPeriod = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= fromDate && d <= toDate;
    };

    if (type === 'attendance') {
      const rows = mockConversationsList
        .filter((c) => inPeriod(c.createdAt))
        .map((c) => ({
          contato: c.contact?.name || c.contact?.phone || '—',
          canal: c.channel,
          atendente: c.agent?.name ?? '—',
          departamento: c.department?.name ?? '—',
          status: c.status,
          resolucao: c.resolution ? RESOLUTION_LABELS[c.resolution] : '—',
          tags: (c.tags || []).map((t) => t.name).join(', ') || '—',
          criadaEm: c.createdAt,
          encerradaEm: c.closedAt || null,
        }));
      return { period, rows };
    }

    if (type === 'by-tag') {
      const rows = mockTags
        .map((tag) => {
          const convs = mockConversationsList.filter(
            (c) => inPeriod(c.createdAt) && (c.tags || []).some((t) => t.id === tag.id),
          );
          const closedConvs = convs.filter((c) => c.status === 'CLOSED');
          return {
            tag: tag.name,
            total: convs.length,
            resolvidas: closedConvs.filter((c) => c.resolution === 'RESOLVED').length,
            naoResolvidas: closedConvs.filter((c) => c.resolution === 'UNRESOLVED').length,
            tempoMedioResolucaoHoras: avgResolutionHours(closedConvs),
          };
        })
        .filter((r) => r.total > 0);
      return { period, rows };
    }

    if (type === 'by-agent') {
      const rows = mockUsersList
        .filter((u) => u.isActive)
        .map((agent) => {
          const convs = mockConversationsList.filter((c) => inPeriod(c.createdAt) && c.agent?.id === agent.id);
          const closedConvs = convs.filter((c) => c.status === 'CLOSED');
          const emAberto = mockConversationsList.filter(
            (c) => c.agent?.id === agent.id && c.status === 'OPEN',
          ).length;
          return {
            atendente: agent.name,
            atendidas: convs.length,
            resolvidas: closedConvs.filter((c) => c.resolution === 'RESOLVED').length,
            naoResolvidas: closedConvs.filter((c) => c.resolution === 'UNRESOLVED').length,
            emAberto,
            tempoMedioResolucaoHoras: avgResolutionHours(closedConvs),
          };
        })
        .filter((r) => r.atendidas > 0 || r.emAberto > 0);
      return { period, rows };
    }

    throw { status: 404, message: 'Relatório não encontrado' };
  }

  // Exportação (B-33) — CSV gerado no cliente (mesmas colunas/rótulos do
  // backend real). PDF não é suportado em modo demonstração: geração real
  // usa PDFKit no backend, não dá pra reproduzir sem duplicar a lib no front
  // só pra essa simulação — erro amigável em vez de fingir que funciona.
  async downloadReport(type, { from, to, format }) {
    await this.simulateDelay();
    if (format === 'pdf') {
      throw { status: 501, message: 'Exportação em PDF não está disponível em modo demonstração.' };
    }

    const { rows } = await this.getReport(type, { from, to });
    const filename = `relatorio-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

    if (type === 'attendance') {
      return {
        filename,
        blob: rowsToCsvBlob(
          rows.map((r) => ({
            'Contato': r.contato,
            'Canal': r.canal,
            'Atendente': r.atendente,
            'Departamento': r.departamento,
            'Status': r.status,
            'Resolução': r.resolucao,
            'Tags': r.tags,
            'Criada em': formatDateTimeBR(r.criadaEm),
            'Encerrada em': formatDateTimeBR(r.encerradaEm),
          })),
        ),
      };
    }

    if (type === 'by-tag') {
      return {
        filename,
        blob: rowsToCsvBlob(
          rows.map((r) => ({
            'Tag': r.tag,
            'Total': String(r.total),
            'Resolvidas': String(r.resolvidas),
            'Não resolvidas': String(r.naoResolvidas),
            'Tempo médio de resolução': formatHoursBR(r.tempoMedioResolucaoHoras),
          })),
        ),
      };
    }

    return {
      filename,
      blob: rowsToCsvBlob(
        rows.map((r) => ({
          'Atendente': r.atendente,
          'Atendidas': String(r.atendidas),
          'Resolvidas': String(r.resolvidas),
          'Não resolvidas': String(r.naoResolvidas),
          'Em aberto': String(r.emAberto),
          'Tempo médio de resolução': formatHoursBR(r.tempoMedioResolucaoHoras),
        })),
      ),
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

  // ── CONTACTS (B-34) ──────────────────────────────────────────────────────
  // Busca/paginação e regra de conflito de telefone iguais ao backend real
  // (contact.service.ts#findAll/create).
  async getContacts({ search, channel, isBlocked, tagId, page = 1, limit = 20 } = {}) {
    await this.simulateDelay();
    let list = mockContactsList;
    if (search) {
      const term = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.phone.toLowerCase().includes(term) ||
          (c.email || '').toLowerCase().includes(term),
      );
    }
    if (channel) list = list.filter((c) => c.channel === channel);
    if (isBlocked !== undefined) list = list.filter((c) => c.isBlocked === isBlocked);
    if (tagId) list = list.filter((c) => c.tags?.some((t) => t.id === tagId));
    list = [...list].sort((a, b) => a.name.localeCompare(b.name));

    const total = list.length;
    const start = (page - 1) * limit;
    const data = list.slice(start, start + limit).map(withContactCount);
    return { data, meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getContact(id) {
    await this.simulateDelay();
    const contact = mockContactsList.find((c) => c.id === id);
    if (!contact) throw { status: 404, message: 'Contato não encontrado' };
    return { ...withContactCount(contact), conversations: [] };
  }

  // Organização por tag (B-34) — mesmo par de endpoints já usado em
  // conversas (B-27), 404 se a tag ou o contato não existirem.
  async addContactTag(contactId, tagId) {
    await this.simulateDelay();
    const contact = mockContactsList.find((c) => c.id === contactId);
    const tag = mockTags.find((t) => t.id === tagId);
    if (!contact || !tag) throw { status: 404, message: 'Contato ou tag não encontrado' };
    if (!contact.tags.some((t) => t.id === tagId)) {
      contact.tags.push({ id: tag.id, name: tag.name, color: tag.color });
    }
    return { id: contact.id, tags: contact.tags };
  }

  async removeContactTag(contactId, tagId) {
    await this.simulateDelay();
    const contact = mockContactsList.find((c) => c.id === contactId);
    if (!contact) throw { status: 404, message: 'Contato não encontrado' };
    contact.tags = contact.tags.filter((t) => t.id !== tagId);
    return { id: contact.id, tags: contact.tags };
  }

  async createContact(data) {
    await this.simulateDelay();
    if (mockContactsList.some((c) => c.phone === data.phone)) {
      throw { status: 409, message: 'Já existe um contato com este número de telefone' };
    }
    const contact = {
      id: nextId('contact'),
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      avatarUrl: data.avatarUrl || null,
      channel: data.channel || 'WHATSAPP',
      isBlocked: false,
      createdAt: new Date().toISOString(),
      tags: [],
    };
    mockContactsList.push(contact);
    return withContactCount(contact);
  }

  // `phone`/`channel` não são aceitos aqui — mesma regra do backend real
  // (UpdateContactDto omite os dois de propósito, não dá pra mudar depois
  // de criado).
  async updateContact(id, data) {
    await this.simulateDelay();
    const contact = mockContactsList.find((c) => c.id === id);
    if (!contact) throw { status: 404, message: 'Contato não encontrado' };
    if (data.name !== undefined) contact.name = data.name;
    if (data.email !== undefined) contact.email = data.email || null;
    if (data.avatarUrl !== undefined) contact.avatarUrl = data.avatarUrl;
    if (data.isBlocked !== undefined) contact.isBlocked = data.isBlocked;
    return withContactCount(contact);
  }

  // ── USERS ──────────────────────────────────────────────────────────────────
  async getUsers() {
    await this.simulateDelay();
    return { data: mockUsersList.map((u) => ({ ...u, departments: this.departmentsOf(u.id) })) };
  }

  // B-113: os setores de cada usuário são os grupos de que ele é membro —
  // o mesmo vínculo da tela Grupos → Membros, como no backend
  departmentsOf(userId) {
    return mockDepartments
      .filter((d) => d.users.some((u) => u.id === userId))
      .map(({ id, name, color }) => ({ id, name, color }));
  }

  assertMockDepartments(departmentIds) {
    if (departmentIds.some((id) => !mockDepartments.some((d) => d.id === id))) {
      throw { status: 400, message: 'Setor não encontrado nesta empresa' };
    }
  }

  setUserDepartments(userId, departmentIds) {
    this.assertMockDepartments(departmentIds);
    const user = mockUsersList.find((u) => u.id === userId);
    mockDepartments.forEach((d) => {
      const member = d.users.some((u) => u.id === userId);
      if (departmentIds.includes(d.id) && !member && user) d.users.push(user);
      if (!departmentIds.includes(d.id) && member) d.users = d.users.filter((u) => u.id !== userId);
    });
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
      availability: 'OFFLINE',
    };
    // B-113: setor inválido recusa antes de criar, como no backend
    if (data.departmentIds?.length) this.assertMockDepartments(data.departmentIds);
    mockUsersList.push(user);
    if (data.departmentIds?.length) this.setUserDepartments(user.id, data.departmentIds);
    return { ...user, departments: this.departmentsOf(user.id) };
  }

  async updateUser(id, data) {
    await this.simulateDelay();
    const user = mockUsersList.find((u) => u.id === id);
    if (!user) throw { status: 404, message: 'Usuário não encontrado' };
    // B-113: a lista substitui os setores; não fica gravada no próprio usuário
    const { departmentIds, ...fields } = data;
    if (departmentIds) this.setUserDepartments(id, departmentIds);
    Object.assign(user, fields);
    // B-65: desativado não continua Online
    if (data.isActive === false) this.setAvailability(id, 'OFFLINE');
    return { ...user, departments: this.departmentsOf(id) };
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

  // ── Estado Online/Offline (B-65) ────────────────────────────────────────────
  // Mesmas duas estruturas do perfil próprio: a lista editável e a de login
  setAvailability(id, availability) {
    const availabilityChangedAt = new Date().toISOString();
    [mockUsersList.find((u) => u.id === id), Object.values(mockUsers).find((u) => u.id === id)]
      .filter(Boolean)
      .forEach((u) => Object.assign(u, { availability, availabilityChangedAt }));
    return { availability, availabilityChangedAt };
  }

  async updateOwnAvailability(id, availability) {
    await this.simulateDelay();
    if (!['ONLINE', 'OFFLINE'].includes(availability)) {
      throw { status: 400, message: 'availability deve ser ONLINE ou OFFLINE' };
    }
    return this.setAvailability(id, availability);
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

  // B-116: o mesmo limite da API — até 20 setores ativos por empresa
  assertDepartmentSlot() {
    if (mockDepartments.filter((d) => d.isActive !== false).length >= MAX_ACTIVE_DEPARTMENTS) {
      throw {
        status: 400,
        message: `Limite de ${MAX_ACTIVE_DEPARTMENTS} setores ativos atingido. Desative ou exclua um setor para abrir outro`,
      };
    }
  }

  async createDepartment(data) {
    await this.simulateDelay();
    this.assertDepartmentSlot();
    const dept = { id: nextId('dept'), name: data.name, color: data.color || '#0f766e', isActive: true, users: [] };
    mockDepartments.push(dept);
    return stripCount(dept);
  }

  async updateDepartment(id, data) {
    await this.simulateDelay();
    const dept = mockDepartments.find((d) => d.id === id);
    if (!dept) throw { status: 404, message: 'Grupo não encontrado' };
    if (data.isActive === true && dept.isActive === false) this.assertDepartmentSlot();
    Object.assign(dept, data);
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
    return { data: mockConnections.map(({ statusPolls: _polls, ...c }) => c) };
  }

  async createWhatsappConnection(data) {
    await this.simulateDelay();
    const conn = {
      id: nextId('conn'), name: data.name, status: 'DISCONNECTED', phone: null,
      statusPolls: 0, departmentId: data.departmentId || null,
    };
    mockConnections.push(conn);
    const { statusPolls: _polls, ...rest } = conn;
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
      strategy: 'MANUAL', // B-66: a fila é compartilhada — só MANUAL existe
      maxWaitSecs: data.maxWaitSecs || 300,
      maxServiceSecs: data.maxServiceSecs ?? null, // B-114: null = sem prazo de atendimento
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

  // ── AUTO-ATENDIMENTO (B-35) ──────────────────────────────────────────────
  async getAutoAttendanceFlow() {
    await this.simulateDelay();
    return {
      ...mockAutoAttendanceFlow,
      menuOptions: [...mockAutoAttendanceOptions]
        .sort((a, b) => a.order - b.order)
        .map(withAutoAttendanceOptionRelations),
    };
  }

  async updateAutoAttendanceFlow(data) {
    await this.simulateDelay();
    mockAutoAttendanceFlow = {
      ...mockAutoAttendanceFlow,
      ...data,
      id: mockAutoAttendanceFlow.id || nextId('flow'),
    };
    return { ...mockAutoAttendanceFlow };
  }

  async getAutoAttendanceMenuOptions() {
    await this.simulateDelay();
    return [...mockAutoAttendanceOptions].sort((a, b) => a.order - b.order).map(withAutoAttendanceOptionRelations);
  }

  async createAutoAttendanceMenuOption(data) {
    await this.simulateDelay();
    if (data.action === 'ROUTE_TO_DEPARTMENT' && !mockDepartments.some((d) => d.id === data.departmentId)) {
      throw { status: 400, message: 'Departamento não encontrado' };
    }
    if (data.action === 'ROUTE_TO_QUEUE' && !mockQueues.some((q) => q.id === data.queueId)) {
      throw { status: 400, message: 'Fila não encontrada' };
    }
    const option = {
      id: nextId('auto-option'),
      order: data.order ?? mockAutoAttendanceOptions.length + 1,
      label: data.label,
      action: data.action,
      departmentId: data.departmentId || null,
      queueId: data.queueId || null,
    };
    mockAutoAttendanceOptions.push(option);
    return withAutoAttendanceOptionRelations(option);
  }

  async updateAutoAttendanceMenuOption(id, data) {
    await this.simulateDelay();
    const option = mockAutoAttendanceOptions.find((o) => o.id === id);
    if (!option) throw { status: 404, message: 'Opção de menu não encontrada' };
    Object.assign(option, data);
    return withAutoAttendanceOptionRelations(option);
  }

  async removeAutoAttendanceMenuOption(id) {
    await this.simulateDelay();
    const idx = mockAutoAttendanceOptions.findIndex((o) => o.id === id);
    if (idx === -1) throw { status: 404, message: 'Opção de menu não encontrada' };
    mockAutoAttendanceOptions.splice(idx, 1);
    return { success: true };
  }

  async reorderAutoAttendanceMenuOptions(orderedIds) {
    await this.simulateDelay();
    orderedIds.forEach((id, index) => {
      const option = mockAutoAttendanceOptions.find((o) => o.id === id);
      if (option) option.order = index + 1;
    });
    return [...mockAutoAttendanceOptions].sort((a, b) => a.order - b.order).map(withAutoAttendanceOptionRelations);
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
