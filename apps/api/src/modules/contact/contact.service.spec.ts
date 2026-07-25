import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    it('recusa editar um contato já anonimizado (B-17/LGPD)', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        id: 'contact-1', anonymizedAt: new Date(), tags: [], conversations: [],
      });

      await expect(
        service.update(companyA, 'contact-1', { name: 'Nome Novo' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    });
  });

  // B-17/LGPD: exclusão do titular é anonimização, não hard delete — a
  // relação Conversation.contact não tem cascade (é histórico legítimo da
  // empresa), então o hard delete anterior quebrava com violação de FK pra
  // qualquer contato com conversa (bug real, achado pesquisando o mecanismo
  // de atendimento a solicitação de titular de dados, registrado como B-28).
  describe('remove (anonimização, B-17/LGPD)', () => {
    it('nunca chama contact.update para um contato de outra empresa', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null);

      await expect(service.remove(companyA, contactOfCompanyB, requesterId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('recusa anonimizar um contato que já foi anonimizado antes', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        name: 'Fulano', phone: '5511999999999', email: null, anonymizedAt: new Date(),
      });

      await expect(service.remove(companyA, 'contact-1', requesterId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
    });

    it('substitui PII (name/phone/email/avatarUrl/metadata) em vez de apagar o registro, e registra auditoria', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        name: 'Fulano', phone: '5511999999999', email: 'fulano@example.com', anonymizedAt: null,
      });
      mockPrisma.contact.update.mockResolvedValueOnce({ anonymizedAt: new Date('2026-07-25') });

      const result = await service.remove(companyA, 'contact-1', requesterId);

      expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
      expect(mockPrisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: expect.objectContaining({
          name: 'Contato removido',
          phone: 'anonimizado-contact-1',
          email: null,
          avatarUrl: null,
          metadata: Prisma.DbNull,
          anonymizedAt: expect.any(Date),
        }),
        select: { anonymizedAt: true },
      });
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: companyA,
          userId: requesterId,
          action: 'contact.anonymized',
          entity: 'Contact',
          entityId: 'contact-1',
          before: { name: 'Fulano', phone: '5511999999999', email: 'fulano@example.com' },
        }),
      );
      expect(result.anonymizedAt).toEqual(new Date('2026-07-25'));
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
