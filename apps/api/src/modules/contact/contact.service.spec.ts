import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactService } from './contact.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { StorageService } from '../../shared/storage/storage.service';

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
  conversation: {
    findMany: jest.fn(),
  },
  attachment: {
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

const mockAuditLog = { record: jest.fn() };
const mockStorage = { deleteByUrl: jest.fn() };

describe('ContactService — isolamento multi-tenant', () => {
  let service: ContactService;
  const companyA = 'company-a';
  const contactOfCompanyB = 'contact-da-empresa-b';
  const requesterId = 'user-a';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.attachment.findMany.mockResolvedValue([]); // sem mídia por padrão

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: StorageService, useValue: mockStorage },
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

    // B-34: organização por tag/grupo — filtrar a lista de contatos por tag.
    it('filtra por tagId quando informado (tags.some)', async () => {
      mockPrisma.contact.findMany.mockResolvedValueOnce([]);
      mockPrisma.contact.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, { tagId: 'tag-1' } as any);

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { some: { id: 'tag-1' } } }),
        }),
      );
    });

    it('não filtra por tag quando tagId não é informado', async () => {
      mockPrisma.contact.findMany.mockResolvedValueOnce([]);
      mockPrisma.contact.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, {});

      const call = mockPrisma.contact.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('tags');
    });

    it('inclui as tags de cada contato no select da listagem', async () => {
      mockPrisma.contact.findMany.mockResolvedValueOnce([]);
      mockPrisma.contact.count.mockResolvedValueOnce(0);

      await service.findAll(companyA, {});

      const call = mockPrisma.contact.findMany.mock.calls[0][0];
      expect(call.select.tags).toEqual({ select: { id: true, name: true, color: true } });
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
          after: { mediaPurged: 0, mediaFailed: 0 },
        }),
      );
      expect(result.anonymizedAt).toEqual(new Date('2026-07-25'));
      expect(result.media).toEqual({ purged: 0, failed: 0 });
    });

    // B-29/LGPD: a PII sozinha no Postgres não basta — a mídia (foto, áudio,
    // documento) das conversas do contato precisa sumir do MinIO também.
    it('purga do MinIO e apaga a linha de Attachment de cada anexo das conversas do contato', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        name: 'Fulano', phone: '5511999999999', email: null, anonymizedAt: null,
      });
      mockPrisma.contact.update.mockResolvedValueOnce({ anonymizedAt: new Date() });
      mockPrisma.attachment.findMany.mockReset().mockResolvedValueOnce([
        { id: 'att-1', url: 'http://minio/bucket/company-a/images/a.jpg' },
        { id: 'att-2', url: 'http://minio/bucket/company-a/audios/b.ogg' },
      ]);
      mockStorage.deleteByUrl.mockResolvedValue(undefined);

      const result = await service.remove(companyA, 'contact-1', requesterId);

      expect(mockPrisma.attachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { message: { conversation: { contactId: 'contact-1', companyId: companyA } } },
        }),
      );
      expect(mockStorage.deleteByUrl).toHaveBeenCalledTimes(2);
      expect(mockPrisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(mockPrisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-2' } });
      expect(result.media).toEqual({ purged: 2, failed: 0 });
    });

    it('não deixa uma falha isolada no MinIO travar a anonimização nem as demais purgas', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        name: 'Fulano', phone: '5511999999999', email: null, anonymizedAt: null,
      });
      mockPrisma.contact.update.mockResolvedValueOnce({ anonymizedAt: new Date() });
      mockPrisma.attachment.findMany.mockReset().mockResolvedValueOnce([
        { id: 'att-1', url: 'http://minio/bucket/company-a/images/a.jpg' },
        { id: 'att-2', url: 'http://minio/bucket/company-a/audios/b.ogg' },
      ]);
      mockStorage.deleteByUrl
        .mockRejectedValueOnce(new Error('MinIO fora do ar'))
        .mockResolvedValueOnce(undefined);

      const result = await service.remove(companyA, 'contact-1', requesterId);

      // a anonimização (já feita antes da purga) não é desfeita por uma falha aqui
      expect(mockPrisma.contact.update).toHaveBeenCalled();
      expect(mockPrisma.attachment.delete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'att-2' } });
      expect(result.media).toEqual({ purged: 1, failed: 1 });
    });
  });

  // B-30/LGPD: portabilidade — contato + conversas + mensagens num único JSON
  describe('exportData', () => {
    it('não encontra um contato que pertence a outra empresa', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null);

      await expect(service.exportData(companyA, contactOfCompanyB, requesterId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
    });

    it('recusa exportar um contato já anonimizado — não há PII pra devolver', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        id: 'contact-1', anonymizedAt: new Date(), tags: [],
      });

      await expect(service.exportData(companyA, 'contact-1', requesterId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
    });

    it('busca conversas filtrando por companyId + contactId, e registra auditoria', async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        id: 'contact-1', name: 'Fulano', phone: '5511999999999', anonymizedAt: null, tags: [],
      });
      mockPrisma.conversation.findMany.mockResolvedValueOnce([
        { id: 'conv-1', messages: [] },
      ]);

      const result = await service.exportData(companyA, 'contact-1', requesterId);

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contactId: 'contact-1', companyId: companyA } }),
      );
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: companyA,
          userId: requesterId,
          action: 'contact.exported',
          entity: 'Contact',
          entityId: 'contact-1',
        }),
      );
      expect(result.conversations).toHaveLength(1);
      expect(result.exportedAt).toBeInstanceOf(Date);
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
