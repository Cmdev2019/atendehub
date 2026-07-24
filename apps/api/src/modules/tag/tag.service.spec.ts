import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TagService } from './tag.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

// Isolamento multi-tenant (B4-3): assignToConversation/assignToContact fazem
// dois checks de posse (tag E conversa/contato) antes de qualquer `connect` —
// os testes garantem que os dois são checados, não só o primeiro que falhar.
const mockPrisma = {
  tag: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  conversation: { findFirst: jest.fn(), update: jest.fn() },
  contact: { findFirst: jest.fn(), update: jest.fn() },
};

describe('TagService', () => {
  let service: TagService;
  const companyA = 'company-a';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TagService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<TagService>(TagService);
  });

  describe('create', () => {
    it('rejeita nome duplicado na mesma empresa', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 'tag-existente' });

      await expect(service.create(companyA, { name: 'Urgente' })).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.tag.create).not.toHaveBeenCalled();
    });
  });

  describe('assignToConversation', () => {
    it('rejeita quando a tag pertence a outra empresa (nem chega a checar a conversa)', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.assignToConversation(companyA, 'conv-1', 'tag-de-outra-empresa'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });

    it('rejeita quando a conversa pertence a outra empresa, mesmo com a tag válida', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 'tag-1' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.assignToConversation(companyA, 'conv-de-outra-empresa', 'tag-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });

    it('conecta a tag à conversa quando ambas pertencem à empresa', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 'tag-1' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1' });
      mockPrisma.conversation.update.mockResolvedValueOnce({});

      await service.assignToConversation(companyA, 'conv-1', 'tag-1');

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { tags: { connect: { id: 'tag-1' } } },
      });
    });
  });

  describe('assignToContact', () => {
    it('rejeita quando o contato pertence a outra empresa, mesmo com a tag válida', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 'tag-1' });
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.assignToContact(companyA, 'contact-de-outra-empresa', 'tag-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    });

    it('conecta a tag ao contato quando ambos pertencem à empresa', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 'tag-1' });
      mockPrisma.contact.findFirst.mockResolvedValueOnce({ id: 'contact-1' });
      mockPrisma.contact.update.mockResolvedValueOnce({});

      await service.assignToContact(companyA, 'contact-1', 'tag-1');

      expect(mockPrisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { tags: { connect: { id: 'tag-1' } } },
      });
    });
  });

  describe('removeFromConversation', () => {
    it('desconecta a tag da conversa quando ambas pertencem à empresa', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 'tag-1' });
      mockPrisma.conversation.findFirst.mockResolvedValueOnce({ id: 'conv-1' });
      mockPrisma.conversation.update.mockResolvedValueOnce({});

      await service.removeFromConversation(companyA, 'conv-1', 'tag-1');

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { tags: { disconnect: { id: 'tag-1' } } },
      });
    });
  });

  describe('removeFromContact', () => {
    it('desconecta a tag do contato quando ambos pertencem à empresa', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 'tag-1' });
      mockPrisma.contact.findFirst.mockResolvedValueOnce({ id: 'contact-1' });
      mockPrisma.contact.update.mockResolvedValueOnce({});

      await service.removeFromContact(companyA, 'contact-1', 'tag-1');

      expect(mockPrisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { tags: { disconnect: { id: 'tag-1' } } },
      });
    });
  });

  describe('update', () => {
    it('rejeita quando a tag não pertence à empresa', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce(null); // assertBelongsToCompany

      await expect(
        service.update(companyA, 'tag-de-outra-empresa', { name: 'Novo nome' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.tag.update).not.toHaveBeenCalled();
    });

    it('rejeita renomear para um nome já usado por outra tag da mesma empresa', async () => {
      mockPrisma.tag.findFirst
        .mockResolvedValueOnce({ id: 'tag-1' }) // assertBelongsToCompany
        .mockResolvedValueOnce({ id: 'tag-2' }); // conflito de nome

      await expect(
        service.update(companyA, 'tag-1', { name: 'Urgente' }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.tag.update).not.toHaveBeenCalled();
    });

    it('atualiza a tag quando o nome não conflita', async () => {
      mockPrisma.tag.findFirst
        .mockResolvedValueOnce({ id: 'tag-1' }) // assertBelongsToCompany
        .mockResolvedValueOnce(null); // sem conflito
      mockPrisma.tag.update.mockResolvedValueOnce({ id: 'tag-1', name: 'Renomeada', color: '#fff' });

      const result = await service.update(companyA, 'tag-1', { name: 'Renomeada' });

      expect(mockPrisma.tag.update).toHaveBeenCalledWith({
        where: { id: 'tag-1' },
        data: { name: 'Renomeada' },
        select: { id: true, name: true, color: true },
      });
      expect(result.name).toBe('Renomeada');
    });
  });

  describe('remove', () => {
    it('rejeita quando a tag não pertence à empresa', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce(null);

      await expect(service.remove(companyA, 'tag-de-outra-empresa')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.tag.delete).not.toHaveBeenCalled();
    });

    it('remove a tag quando ela pertence à empresa', async () => {
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 'tag-1' });
      mockPrisma.tag.delete.mockResolvedValueOnce({});

      const result = await service.remove(companyA, 'tag-1');

      expect(mockPrisma.tag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
      expect(result).toEqual({ message: 'Tag removida com sucesso' });
    });
  });

  describe('findAll', () => {
    it('lista as tags filtrando por companyId', async () => {
      mockPrisma.tag.findMany.mockResolvedValueOnce([{ id: 'tag-1', name: 'Urgente', color: '#f00' }]);

      const result = await service.findAll(companyA);

      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: companyA } }),
      );
      expect(result).toHaveLength(1);
    });
  });
});
