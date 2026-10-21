import { Role } from '../../generated/prisma/client';
import { roomsForConversation, scopeRoomsForUser } from './scope-rooms';
import { EventsService } from './events.service';

// C-10/B-40: um socket recebe o evento da conversa se tiver ao menos uma sala
// em comum com ela — a mesma regra do ConversationScopeService.
const receives = (userRooms: string[], conversationRooms: string[]) =>
  userRooms.some((r) => conversationRooms.includes(r));

const company = 'c1';
const admin = { id: 'admin', companyId: company, role: Role.ADMIN };
const supervisor = { id: 'sup', companyId: company, role: Role.SUPERVISOR };
const juridico = { id: 'ag-jur', companyId: company, role: Role.AGENT };
const financeiro = { id: 'ag-fin', companyId: company, role: Role.AGENT };

const roomsOf = (user: { id: string; companyId: string; role: Role }, departments: string[]) => [
  `agent:${user.id}`,
  ...scopeRoomsForUser(user, departments),
];

describe('salas de escopo do Socket.IO (C-10/B-40)', () => {
  const convJuridico = roomsForConversation(company, { departmentId: 'dep-jur', agentId: null });
  const convSemDepto = roomsForConversation(company, { departmentId: null, agentId: null });
  const convFinanceiroDoAgenteJur = roomsForConversation(company, { departmentId: 'dep-fin', agentId: 'ag-jur' });

  it('ADMIN e SUPERVISOR recebem tudo', () => {
    for (const user of [admin, supervisor]) {
      const rooms = roomsOf(user, []);
      expect(receives(rooms, convJuridico)).toBe(true);
      expect(receives(rooms, convSemDepto)).toBe(true);
      expect(receives(rooms, convFinanceiroDoAgenteJur)).toBe(true);
    }
  });

  it('AGENT recebe as do seu departamento e as sem departamento', () => {
    const rooms = roomsOf(juridico, ['dep-jur']);
    expect(receives(rooms, convJuridico)).toBe(true);
    expect(receives(rooms, convSemDepto)).toBe(true);
  });

  it('AGENT NÃO recebe as de outro departamento', () => {
    expect(receives(roomsOf(financeiro, ['dep-fin']), convJuridico)).toBe(false);
  });

  it('AGENT recebe a conversa atribuída a ele mesmo em outro departamento', () => {
    expect(receives(roomsOf(juridico, ['dep-jur']), convFinanceiroDoAgenteJur)).toBe(true);
  });

  it('conversa não encontrada vai só para quem vê a empresa toda', () => {
    const rooms = roomsForConversation(company, null);
    expect(receives(roomsOf(admin, []), rooms)).toBe(true);
    expect(receives(roomsOf(juridico, ['dep-jur']), rooms)).toBe(false);
  });
});

describe('EventsService — eventos de conversa só para quem pode ver (C-10/B-40)', () => {
  const emit = jest.fn();
  const to = jest.fn((_rooms: string | string[]) => ({ emit }));
  const gateway = { server: { to } };
  const storage = { presignDeep: jest.fn(async (p: unknown) => p) };
  const prisma = { conversation: { findFirst: jest.fn() } };
  const service = new EventsService(gateway as any, storage as any, prisma as any);
  const flush = () => new Promise((r) => setImmediate(r));

  beforeEach(() => jest.clearAllMocks());

  it('message.new vai para a conversa e para as salas de escopo — não para a empresa inteira', async () => {
    prisma.conversation.findFirst.mockResolvedValueOnce({ departmentId: 'dep-jur', agentId: 'ag-1' });

    service.emitNewMessage({ companyId: company, conversationId: 'conv-1', message: {} as any });
    await flush();

    expect(to).toHaveBeenCalledWith([
      'conversation:conv-1',
      `company:${company}:all`,
      `company:${company}:dept:dep-jur`,
      'agent:ag-1',
    ]);
    expect(to.mock.calls[0][0]).not.toContain(`company:${company}`);
    expect(emit).toHaveBeenCalledWith('message.new', expect.anything());
  });

  it('conversation.created também respeita o escopo', async () => {
    prisma.conversation.findFirst.mockResolvedValueOnce({ departmentId: null, agentId: null });

    await service.emitConversationCreated({ companyId: company, conversation: { id: 'conv-2' } } as any);

    expect(to).toHaveBeenCalledWith(['conversation:conv-2', `company:${company}:all`, `company:${company}:dept:none`]);
  });

  it('status da conexão do WhatsApp (não é de conversa) segue para a empresa', () => {
    service.emitConnectionStatus({ companyId: company, sessionName: 's', status: 'CONNECTED' } as any);
    expect(to).toHaveBeenCalledWith(`company:${company}`);
  });
});
