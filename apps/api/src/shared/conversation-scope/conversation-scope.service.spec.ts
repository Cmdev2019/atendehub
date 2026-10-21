import { NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { ConversationScopeService } from './conversation-scope.service';
import { ConversationScopeGuard } from './conversation-scope.guard';

const mockPrisma = {
  user: { findUnique: jest.fn() },
  conversation: { findFirst: jest.fn() },
};

const agent = { id: 'agent-1', companyId: 'company-1', role: Role.AGENT };

describe('ConversationScopeService (C-10/B-40)', () => {
  let service: ConversationScopeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationScopeService(mockPrisma as any);
  });

  it.each([Role.ADMIN, Role.SUPERVISOR, Role.SUPER_ADMIN])('%s vê a empresa toda (filtro vazio, sem consultar departamentos)', async (role) => {
    await expect(service.conversationWhere({ id: 'u', role })).resolves.toEqual({});
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('AGENT vê as atribuídas a ele, as sem departamento e as dos seus departamentos', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ departments: [{ id: 'dep-juridico' }, { id: 'dep-rh' }] });

    await expect(service.conversationWhere(agent)).resolves.toEqual({
      OR: [
        { agentId: 'agent-1' },
        { departmentId: null },
        { departmentId: { in: ['dep-juridico', 'dep-rh'] } },
      ],
    });
  });

  it('AGENT sem departamento vê só as atribuídas a ele e as sem departamento', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ departments: [] });

    await expect(service.conversationWhere(agent)).resolves.toEqual({
      OR: [{ agentId: 'agent-1' }, { departmentId: null }],
    });
  });

  it('assertAccess combina empresa e escopo na mesma consulta', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ departments: [{ id: 'dep-1' }] });
    mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1' });

    await service.assertAccess(agent, 'conv-1');

    expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: 'conv-1', companyId: 'company-1' },
          { OR: [{ agentId: 'agent-1' }, { departmentId: null }, { departmentId: { in: ['dep-1'] } }] },
        ],
      },
      select: { id: true },
    });
  });

  it('conversa fora do escopo responde 404 (não confirma que existe)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ departments: [] });
    mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

    await expect(service.assertAccess(agent, 'conv-de-outro-departamento')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ConversationScopeGuard (C-10/B-40)', () => {
  const scope = { assertAccess: jest.fn() };
  const guard = new ConversationScopeGuard(scope as any);
  const ctx = (params: Record<string, string>, user: unknown = agent) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ params, user }) }) }) as any;

  beforeEach(() => jest.clearAllMocks());

  it('confere a conversa de :conversationId (mensagens, notas)', async () => {
    await expect(guard.canActivate(ctx({ conversationId: 'conv-1', id: 'msg-1' }))).resolves.toBe(true);
    expect(scope.assertAccess).toHaveBeenCalledWith(agent, 'conv-1');
  });

  it('confere a conversa de :id (rotas de conversa)', async () => {
    await guard.canActivate(ctx({ id: 'conv-2' }));
    expect(scope.assertAccess).toHaveBeenCalledWith(agent, 'conv-2');
  });

  it('rota sem conversa na URL (listagem, stats) passa — o filtro fica na consulta', async () => {
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
    expect(scope.assertAccess).not.toHaveBeenCalled();
  });

  it('propaga o 404 do escopo', async () => {
    scope.assertAccess.mockRejectedValueOnce(new NotFoundException());
    await expect(guard.canActivate(ctx({ id: 'conv-x' }))).rejects.toBeInstanceOf(NotFoundException);
  });
});
