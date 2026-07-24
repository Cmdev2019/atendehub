import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const mockHealthService = {
  checkReadiness: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('retorna status ok sem consultar dependências', () => {
      const result = controller.check();

      expect(result.status).toBe('ok');
      expect(mockHealthService.checkReadiness).not.toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('retorna 200 com status ok quando tudo está pronto', async () => {
      mockHealthService.checkReadiness.mockResolvedValueOnce({
        ready: true,
        checks: { database: 'up', redis: 'up' },
      });

      const result = await controller.ready();

      expect(result.status).toBe('ok');
      expect(result.checks).toEqual({ database: 'up', redis: 'up' });
    });

    it('lança 503 quando alguma dependência está fora', async () => {
      mockHealthService.checkReadiness.mockResolvedValueOnce({
        ready: false,
        checks: { database: 'down', redis: 'up' },
      });

      await expect(controller.ready()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
