import { NotFoundException } from '@nestjs/common';
import { DepartmentService } from './department.service';

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
