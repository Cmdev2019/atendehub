import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContactService } from './contact.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

// Isolamento multi-tenant (B4-3): o risco real aqui não é "companyId errado
// devolve os dados certos" (óbvio) — é um dev remover/quebrar o filtro
// `{ id, companyId }` do findFirst/findOne num update/delete que só faz
// `where: { id }` depois. Por isso os testes abaixo checam explicitamente
// que a mutação NUNCA é chamada quando o registro não pertence à empresa,
// e não só que o retorno é o esperado.
const mockPrisma = {
  contact: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
};

const mockAuditLog = { record: jest.fn() };

describe('ContactService — isolamento multi-tenant', () => {
  let service: ContactService;
  const companyA = 'company-a';
  const contactOfCompanyB = 'contact-da-empresa-b';
  const requesterId = 'user-a';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<ContactService>(ContactService);
  });

  describe('findAll', () => {
    it('sempre filtra por companyId, mesmo sem outros filtros', async () => {
      mockPrisma.contact.findMany.mockResolvedValueOnce([]);
      mockPrisma.contact.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, {});

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
      expect(mockPrisma.contact.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: companyA }) }),
      );
    });
  });

  describe('findOne', () => {
    it('não encontra um contato que pertence a outra empresa', async () => {
      // findFirst com { id, companyId } simulado retornando null — é assim
      // que o Prisma se comporta de verdade quando o id existe mas não bate
      // com o companyId do filtro.
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(companyA, contactOfCompanyB)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: contactOfCompanyB, companyId: companyA } }),
      );
    });
  });

  describe('update', () => {
    it('nunca chama contact.update para um contato de outra empresa', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(
        service.update(companyA, contactOfCompanyB, { name: 'Nome Hostil' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('nunca chama contact.delete para um contato de outra empresa', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null);

      await expect(service.remove(companyA, contactOfCompanyB, requesterId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('registra auditoria ao remover um contato de verdade', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        name: 'Fulano',
        phone: '5511999999999',
      });
      mockPrisma.contact.delete.mockResolvedValueOnce({});

      await service.remove(companyA, 'contact-1', requesterId);

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: companyA,
          userId: requesterId,
          action: 'contact.deleted',
          entity: 'Contact',
          entityId: 'contact-1',
        }),
      );
    });
  });

  describe('toggleBlock', () => {
    it('nunca chama contact.update para um contato de outra empresa', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null); // findOne interno não acha

      await expect(service.toggleBlock(companyA, contactOfCompanyB)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    });
  });
});
