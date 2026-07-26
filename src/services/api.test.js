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

  // B-34: contatos — listagem paginada/busca, cadastro e edição.
  describe('getContacts / getContact / createContact / updateContact', () => {
    it('lista contatos paginados, ordenados por nome', async () => {
      const result = await mockApiClient.getContacts({ page: 1, limit: 2 });

      expect(result.meta).toEqual(expect.objectContaining({ page: 1, limit: 2 }));
      expect(result.data).toHaveLength(2);
      const names = result.data.map((c) => c.name);
      expect([...names].sort()).toEqual(names);
    });

    it('busca por nome/telefone/e-mail (case-insensitive)', async () => {
      const result = await mockApiClient.getContacts({ search: 'marina' });
      expect(result.data.some((c) => c.name === 'Marina Alves')).toBe(true);
      expect(result.data.every((c) => c.name.toLowerCase().includes('marina'))).toBe(true);
    });

    it('getContact retorna o contato pelo id, com tags/conversations no shape', async () => {
      const list = await mockApiClient.getContacts();
      const first = list.data[0];

      const contact = await mockApiClient.getContact(first.id);

      expect(contact.id).toBe(first.id);
      expect(contact).toHaveProperty('tags');
      expect(contact).toHaveProperty('conversations');
    });

    it('getContact lança 404 pra id inexistente', async () => {
      await expect(mockApiClient.getContact('nao-existe')).rejects.toMatchObject({ status: 404 });
    });

    it('createContact cria e devolve o contato com _count.conversations', async () => {
      const created = await mockApiClient.createContact({
        name: 'Novo Contato',
        phone: '5511900000000',
        channel: 'WHATSAPP',
      });

      expect(created.name).toBe('Novo Contato');
      expect(created._count.conversations).toBe(0);

      const list = await mockApiClient.getContacts({ search: 'Novo Contato' });
      expect(list.data.some((c) => c.id === created.id)).toBe(true);
    });

    it('createContact rejeita telefone já usado por outro contato (409)', async () => {
      const list = await mockApiClient.getContacts();
      const existingPhone = list.data[0].phone;

      await expect(
        mockApiClient.createContact({ name: 'Duplicado', phone: existingPhone, channel: 'WHATSAPP' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('updateContact muda nome/e-mail mas ignora phone/channel enviados por engano', async () => {
      const list = await mockApiClient.getContacts();
      const target = list.data[0];
      const originalPhone = target.phone;

      const updated = await mockApiClient.updateContact(target.id, {
        name: 'Nome Atualizado',
        email: 'novo@email.com',
        phone: '0000000000',
        channel: 'EMAIL',
      });

      expect(updated.name).toBe('Nome Atualizado');
      expect(updated.email).toBe('novo@email.com');
      expect(updated.phone).toBe(originalPhone);
    });
  });

  // B-34 (ampliação): organização de contatos por tag/grupo — mesmo
  // catálogo de tags já usado em conversas (B-27).
  describe('addContactTag / removeContactTag / filtro por tagId', () => {
    it('addContactTag atribui e getContact reflete a tag', async () => {
      const list = await mockApiClient.getContacts({ search: 'Lucas' });
      const target = list.data[0];

      await mockApiClient.addContactTag(target.id, 'tag-4');
      const refreshed = await mockApiClient.getContact(target.id);

      expect(refreshed.tags.some((t) => t.id === 'tag-4')).toBe(true);
    });

    it('addContactTag é idempotente — atribuir a mesma tag 2x não duplica', async () => {
      const list = await mockApiClient.getContacts({ search: 'Bia' });
      const target = list.data[0];

      await mockApiClient.addContactTag(target.id, 'tag-2');
      await mockApiClient.addContactTag(target.id, 'tag-2');
      const refreshed = await mockApiClient.getContact(target.id);

      expect(refreshed.tags.filter((t) => t.id === 'tag-2')).toHaveLength(1);
    });

    it('addContactTag lança 404 pra contato ou tag inexistente', async () => {
      const list = await mockApiClient.getContacts();
      await expect(mockApiClient.addContactTag('nao-existe', 'tag-1')).rejects.toMatchObject({ status: 404 });
      await expect(mockApiClient.addContactTag(list.data[0].id, 'tag-inexistente')).rejects.toMatchObject({ status: 404 });
    });

    it('removeContactTag remove e getContact deixa de mostrar a tag', async () => {
      // Marina (contact-1) já nasce com tag-1/tag-2 no mock — remove só a
      // tag-2 aqui (tag-1 continua intacta pro teste de filtro logo abaixo,
      // que depende dela pra achar a Marina).
      const list = await mockApiClient.getContacts({ search: 'Marina' });
      const target = list.data[0];
      expect(target.tags.some((t) => t.id === 'tag-2')).toBe(true);

      await mockApiClient.removeContactTag(target.id, 'tag-2');
      const refreshed = await mockApiClient.getContact(target.id);

      expect(refreshed.tags.some((t) => t.id === 'tag-2')).toBe(false);
    });

    it('getContacts filtra por tagId', async () => {
      const result = await mockApiClient.getContacts({ tagId: 'tag-1' });
      expect(result.data.every((c) => c.tags.some((t) => t.id === 'tag-1'))).toBe(true);
      expect(result.data.some((c) => c.name === 'Marina Alves')).toBe(true);
    });
  });

  // B-33: relatórios (base de atendimento, por tipo/tag, por atendente) e
  // exportação (CSV no mock — PDF exige o backend real com PDFKit).
  describe('getReport / downloadReport', () => {
    const wideRange = { from: '2020-01-01', to: '2030-01-01' };

    it('attendance retorna uma linha por conversa do período, com contato/status/resolução', async () => {
      const result = await mockApiClient.getReport('attendance', wideRange);

      expect(result).toHaveProperty('period');
      expect(result.rows.length).toBeGreaterThan(0);
      // contato precisa ser string (nome/telefone) — regressão real pega aqui:
      // vinha como o objeto bruto {id,name,phone,...} do contrato da API,
      // virava "[object Object]" na tela e no CSV/PDF exportado.
      expect(result.rows[0]).toEqual(
        expect.objectContaining({ contato: expect.any(String), canal: expect.any(String), status: expect.any(String) }),
      );
    });

    it('by-tag esconde tag sem nenhuma conversa no período', async () => {
      const result = await mockApiClient.getReport('by-tag', { from: '2020-01-01', to: '2020-01-02' });
      expect(result.rows).toHaveLength(0);
    });

    it('by-tag agrega total/resolvidas/não resolvidas por tag usada no período', async () => {
      const result = await mockApiClient.getReport('by-tag', wideRange);
      expect(result.rows.length).toBeGreaterThan(0);
      result.rows.forEach((row) => {
        expect(row.total).toBeGreaterThan(0);
      });
    });

    it('by-agent esconde atendente sem nenhuma atividade', async () => {
      const result = await mockApiClient.getReport('by-agent', { from: '2020-01-01', to: '2020-01-02' });
      expect(result.rows.every((r) => r.atendidas > 0 || r.emAberto > 0)).toBe(true);
    });

    it('lança 404 pra um tipo de relatório desconhecido', async () => {
      await expect(mockApiClient.getReport('inexistente', wideRange)).rejects.toMatchObject({ status: 404 });
    });

    it('downloadReport gera um Blob CSV com BOM (bytes EF BB BF) e cabeçalho em PT-BR', async () => {
      const { blob, filename } = await mockApiClient.downloadReport('attendance', { ...wideRange, format: 'csv' });

      expect(filename).toMatch(/\.csv$/);

      // BOM é sinalizador de encoding, não caractere de conteúdo — o
      // TextDecoder do FileReader.readAsText() o consome ao decodificar
      // (comportamento padrão, igual num navegador real), então só dá pra
      // confirmar que ele está no arquivo lendo os BYTES crus (ArrayBuffer).
      const bytes = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });
      expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob);
      });
      expect(text).toContain('Contato,Canal,Atendente');
    });

    it('downloadReport rejeita PDF em modo demonstração com mensagem clara', async () => {
      await expect(
        mockApiClient.downloadReport('attendance', { ...wideRange, format: 'pdf' }),
      ).rejects.toMatchObject({ status: 501 });
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
