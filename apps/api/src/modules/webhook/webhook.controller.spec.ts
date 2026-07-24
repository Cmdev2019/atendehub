import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import { WebhookController } from './webhook.controller';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// B4-4: o webhook é a única rota pública (sem login) de toda a API — a
// Evolution chama de fora, então a validação da apikey é a última linha de
// defesa contra injeção de eventos falsos. Fail-closed por padrão.
describe('WebhookController', () => {
  let controller: WebhookController;

  const mockQueue = { add: jest.fn() };
  const mockConfig = { get: jest.fn() };

  const API_KEY = 'chave-secreta-evolution';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: getQueueToken(QUEUE_NAMES.WEBHOOK), useValue: mockQueue },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  describe('fail-closed', () => {
    it('lança 500 quando EVOLUTION_API_KEY não está configurada, mesmo com apikey no payload', async () => {
      mockConfig.get.mockReturnValue(undefined);

      await expect(
        controller.receiveEvolution({ apikey: 'qualquer-coisa', event: 'messages.upsert' }),
      ).rejects.toThrow(InternalServerErrorException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('validação da apikey', () => {
    beforeEach(() => mockConfig.get.mockReturnValue(API_KEY));

    it('rejeita com 403 quando não há apikey no payload nem no header', async () => {
      await expect(
        controller.receiveEvolution({ event: 'messages.upsert' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('rejeita com 403 quando a apikey do payload é inválida', async () => {
      await expect(
        controller.receiveEvolution({ apikey: 'chave-errada', event: 'messages.upsert' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('aceita quando a apikey do payload é válida', async () => {
      const result = await controller.receiveEvolution({
        apikey: API_KEY,
        event: 'messages.upsert',
        instance: 'session-1',
        data: { foo: 'bar' },
      });

      expect(result).toEqual({ received: true });
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('prioriza a apikey do header sobre a do corpo (header correto, corpo errado)', async () => {
      const result = await controller.receiveEvolution(
        { apikey: 'chave-errada-no-corpo', event: 'messages.upsert', instance: 'session-1' },
        API_KEY,
      );

      expect(result).toEqual({ received: true });
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('rejeita quando a apikey do header está incorreta, mesmo que o corpo esteja certo', async () => {
      await expect(
        controller.receiveEvolution(
          { apikey: API_KEY, event: 'messages.upsert', instance: 'session-1' },
          'header-errado',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('normalização do nome do evento', () => {
    beforeEach(() => mockConfig.get.mockReturnValue(API_KEY));

    it.each([
      ['messages.upsert', 'MESSAGES_UPSERT'],
      ['MESSAGES_UPSERT', 'MESSAGES_UPSERT'],
      ['connection.update', 'CONNECTION_UPDATE'],
      ['qrcode.updated', 'QRCODE_UPDATED'],
    ])('normaliza "%s" para "%s"', async (received, expected) => {
      await controller.receiveEvolution({
        apikey: API_KEY,
        event: received,
        instance: 'session-1',
        data: {},
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ event: expected }),
        expect.anything(),
      );
    });
  });

  describe('job enfileirado', () => {
    beforeEach(() => mockConfig.get.mockReturnValue(API_KEY));

    it('enfileira o job com instance/data repassados e opções de retry/backoff', async () => {
      await controller.receiveEvolution({
        apikey: API_KEY,
        event: 'messages.upsert',
        instance: 'session-42',
        data: { key: { id: 'msg-1' } },
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        { event: 'MESSAGES_UPSERT', instance: 'session-42', data: { key: { id: 'msg-1' } } },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
        },
      );
    });
  });
});
