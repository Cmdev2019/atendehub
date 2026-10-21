import { ConnectionStatus } from '../../generated/prisma/client';
import { EvolutionService } from './evolution.service';
import { WhatsappService } from './whatsapp.service';

// B-82 (M-26): um único mecanismo de webhook — o global da Evolution. A
// instância deixa de nascer com webhook próprio "por evento" (que mandava
// para …/evolution/<evento>, rota inexistente: 404 repetido a cada evento), e
// o de instâncias antigas é desligado ao reconectar.
const mockHttp = {
  post: jest.fn(),
  get: jest.fn(),
  interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
};
jest.mock('axios', () => ({ __esModule: true, default: { create: jest.fn(() => mockHttp) } }));

describe('Webhook da Evolution (B-82)', () => {
  const config = {
    get: jest.fn((key: string, fallback?: string) =>
      ({ EVOLUTION_API_KEY: 'chave-global', EVOLUTION_WEBHOOK_URL: 'http://api:3001/api/v1/webhooks/evolution' })[key] ??
      fallback,
    ),
  };

  beforeEach(() => jest.clearAllMocks());

  describe('EvolutionService', () => {
    const evolution = new EvolutionService(config as any);

    it('cria a instância sem webhook próprio (eventos vêm do webhook global)', async () => {
      mockHttp.post.mockResolvedValueOnce({ data: { instance: { instanceName: 's1' } } });

      await evolution.createInstance('s1');

      const [url, body] = mockHttp.post.mock.calls[0];
      expect(url).toBe('/instance/create');
      expect(body).not.toHaveProperty('webhook');
      expect(body).toEqual(expect.objectContaining({ instanceName: 's1', token: 'chave-global' }));
    });

    it('desliga o webhook próprio de uma instância (formato conferido na Evolution v2.3.4)', async () => {
      mockHttp.post.mockResolvedValueOnce({ data: {} });

      await evolution.disableInstanceWebhook('s1');

      expect(mockHttp.post).toHaveBeenCalledWith('/webhook/set/s1', {
        webhook: expect.objectContaining({ enabled: false, byEvents: false, events: [] }),
      });
    });
  });

  // B-100 (L-12): departamento da conexão precisa ser da própria empresa
  describe('WhatsappService — departamento da conexão', () => {
    const prisma = { department: { findFirst: jest.fn() }, whatsAppConnection: { findFirst: jest.fn(), update: jest.fn() } };
    const service = new WhatsappService(prisma as any, {} as any, {} as any);

    it('update recusa departmentId de outra empresa sem gravar', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'c1' } as any);
      prisma.department.findFirst.mockResolvedValueOnce(null);

      await expect(service.update('company-1', 'c1', { departmentId: 'dept-alheio' } as any)).rejects.toThrow(
        'Departamento não encontrado',
      );
      expect(prisma.department.findFirst).toHaveBeenCalledWith({
        where: { id: 'dept-alheio', companyId: 'company-1' },
        select: { id: true },
      });
      expect(prisma.whatsAppConnection.update).not.toHaveBeenCalled();
    });

    it('create recusa departmentId de outra empresa antes de falar com a Evolution', async () => {
      prisma.department.findFirst.mockResolvedValueOnce(null);
      await expect(service.create('company-1', { name: 'Conn', departmentId: 'dept-alheio' } as any)).rejects.toThrow(
        'Departamento não encontrado',
      );
    });
  });

  describe('WhatsappService.getQrCode', () => {
    const prisma = {
      whatsAppConnection: { findFirst: jest.fn(), update: jest.fn() },
    };
    const evolution = { disableInstanceWebhook: jest.fn(), getQrCode: jest.fn() };
    const service = new WhatsappService(prisma as any, evolution as any, {} as any);
    const conn = { id: 'c1', sessionName: 's1', status: ConnectionStatus.DISCONNECTED };

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue(conn as any);
      evolution.getQrCode.mockResolvedValue({ base64: 'qr', code: '123' });
    });

    it('desliga o webhook próprio antigo antes de gerar o QR', async () => {
      evolution.disableInstanceWebhook.mockResolvedValueOnce(undefined);

      await service.getQrCode('company-1', 'c1');

      expect(evolution.disableInstanceWebhook).toHaveBeenCalledWith('s1');
      expect(evolution.disableInstanceWebhook.mock.invocationCallOrder[0]).toBeLessThan(
        evolution.getQrCode.mock.invocationCallOrder[0],
      );
    });

    it('falha ao desligar não impede o QR code', async () => {
      evolution.disableInstanceWebhook.mockRejectedValueOnce(new Error('Evolution fora'));

      await expect(service.getQrCode('company-1', 'c1')).resolves.toEqual({ qrCode: 'qr', code: '123' });
    });
  });
});
