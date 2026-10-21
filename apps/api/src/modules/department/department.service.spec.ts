import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DepartmentService, MAX_ACTIVE_DEPARTMENTS } from './department.service';

// B-113: mudar os membros de um setor reconecta o socket do usuário (as salas
// de tempo real dependem dos setores) — e nunca alcança usuário de outra
// empresa, nem para derrubar o socket dele.
describe('DepartmentService — membros do setor', () => {
  const mockPrisma = {
    department: { findFirst: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn() },
  };
  const mockEvents = { disconnectUser: jest.fn() };
  const service = new DepartmentService(mockPrisma as any, mockEvents as any);
  const companyA = 'company-a';
  const dept = { id: 'dep-1', name: 'Receitas', users: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.department.findFirst.mockResolvedValue(dept);
    mockPrisma.department.update.mockResolvedValue({ id: 'dep-1', name: 'Receitas', users: [] });
  });

  it.each([
    ['addUser', { connect: { id: 'user-1' } }],
    ['removeUser', { disconnect: { id: 'user-1' } }],
  ] as const)('%s muda o vínculo e reconecta o socket do usuário', async (method, users) => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1' });

    await service[method](companyA, 'dep-1', 'user-1');

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', companyId: companyA },
      select: { id: true },
    });
    expect(mockPrisma.department.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dep-1' }, data: { users } }),
    );
    expect(mockEvents.disconnectUser).toHaveBeenCalledWith('user-1');
  });

  it.each(['addUser', 'removeUser'] as const)(
    '%s com usuário de outra empresa: 404, sem mexer no setor nem no socket dele',
    async (method) => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(service[method](companyA, 'dep-1', 'user-de-outra')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.department.update).not.toHaveBeenCalled();
      expect(mockEvents.disconnectUser).not.toHaveBeenCalled();
    },
  );
});

// B-116 (decisão do responsável em 2026-10-21): até 20 setores ativos por
// empresa. Criar e reativar passam pela trava na linha da empresa — a
// concorrência real fica no e2e (department-limit).
describe('DepartmentService — limite de setores ativos', () => {
  const tx = {
    $queryRaw: jest.fn(),
    department: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const mockPrisma = {
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    department: { findFirst: jest.fn(), update: jest.fn() },
  };
  const service = new DepartmentService(mockPrisma as any, { disconnectUser: jest.fn() } as any);
  const companyA = 'company-a';

  // Tagged template: [partes do SQL, ...valores]
  const lockSql = () => {
    const [strings, ...values] = tx.$queryRaw.mock.calls[0];
    return { sql: (strings as string[]).join('?'), values };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.department.findFirst.mockResolvedValue(null);
    tx.department.create.mockResolvedValue({ id: 'dep-novo', name: 'Receitas' });
  });

  it('cria o setor dentro da trava da empresa, contando só os ativos', async () => {
    tx.department.count.mockResolvedValueOnce(MAX_ACTIVE_DEPARTMENTS - 1);

    await service.create(companyA, { name: 'Receitas' });

    const { sql, values } = lockSql();
    expect(sql).toContain('FOR UPDATE');
    expect(values).toEqual([companyA]);
    expect(tx.department.count).toHaveBeenCalledWith({ where: { companyId: companyA, isActive: true } });
    expect(tx.department.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { companyId: companyA, name: 'Receitas' } }),
    );
  });

  it(`com ${MAX_ACTIVE_DEPARTMENTS} setores ativos: 400 com o motivo, sem criar`, async () => {
    tx.department.count.mockResolvedValueOnce(MAX_ACTIVE_DEPARTMENTS);

    await expect(service.create(companyA, { name: 'Receitas' })).rejects.toThrow(
      new BadRequestException(
        `Limite de ${MAX_ACTIVE_DEPARTMENTS} setores ativos atingido. Desative ou exclua um setor para abrir outro`,
      ),
    );
    expect(tx.department.create).not.toHaveBeenCalled();
  });

  it('nome repetido na empresa: 409, sem criar', async () => {
    tx.department.count.mockResolvedValueOnce(3);
    tx.department.findFirst.mockResolvedValueOnce({ id: 'dep-1' });

    await expect(service.create(companyA, { name: 'Receitas' })).rejects.toThrow(ConflictException);
    expect(tx.department.create).not.toHaveBeenCalled();
  });

  describe('editar', () => {
    const existing = (isActive: boolean) => ({ id: 'dep-1', name: 'Receitas', isActive, users: [], queues: [] });

    it('reativar ocupa uma vaga: com o limite cheio, 400 sem reativar', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce(existing(false));
      tx.department.count.mockResolvedValueOnce(MAX_ACTIVE_DEPARTMENTS);

      await expect(service.update(companyA, 'dep-1', { isActive: true })).rejects.toThrow(BadRequestException);
      expect(tx.department.update).not.toHaveBeenCalled();
    });

    it('reativar com vaga: atualiza dentro da trava', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce(existing(false));
      tx.department.count.mockResolvedValueOnce(5);

      await service.update(companyA, 'dep-1', { isActive: true });

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.department.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: true } }));
    });

    it('mudar só o nome ou a cor de um setor ativo não passa pela trava', async () => {
      mockPrisma.department.findFirst.mockResolvedValueOnce(existing(true)).mockResolvedValueOnce(null);

      await service.update(companyA, 'dep-1', { name: 'Receitas médicas', color: '#2563eb' });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.department.update).toHaveBeenCalled();
    });
  });
});
