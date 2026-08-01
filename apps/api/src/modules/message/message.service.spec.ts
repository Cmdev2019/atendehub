import { MessageService } from './message.service';
import { MessageType, MessageStatus, SenderType } from '@prisma/client';

// B-39: `isNew` no retorno de createFromWebhook é o sinal que webhook.service.ts
// usa pra pular efeitos colaterais (mídia/preview/auto-atendimento/eventos)
// num retry idempotente do Bull — sem cobertura direta aqui, uma regressão
// nesse campo quebraria a idempotência sem nenhum teste acusando.
describe('MessageService#createFromWebhook — idempotência (B-39)', () => {
  const mockPrisma = {
    message: { findFirst: jest.fn(), create: jest.fn() },
  };

  let service: MessageService;

  const baseInput = {
    conversationId: 'conv-1',
    content: 'Oi',
    type: MessageType.TEXT,
    senderType: SenderType.CLIENT,
    externalId: 'wa-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MessageService(mockPrisma as any);
  });

  it('cria a mensagem e retorna isNew=true quando o externalId ainda não existe', async () => {
    mockPrisma.message.findFirst.mockResolvedValueOnce(null);
    mockPrisma.message.create.mockResolvedValueOnce({
      id: 'msg-1',
      status: MessageStatus.DELIVERED,
      sentAt: new Date('2026-07-29T10:00:00Z'),
    });

    const result = await service.createFromWebhook(baseInput);

    expect(result).toEqual({
      id: 'msg-1',
      status: MessageStatus.DELIVERED,
      sentAt: new Date('2026-07-29T10:00:00Z'),
      isNew: true,
    });
  });

  it('retorna a mensagem existente com isNew=false quando o externalId já foi processado (dedup/retry)', async () => {
    mockPrisma.message.findFirst.mockResolvedValueOnce({
      id: 'msg-1',
      status: MessageStatus.DELIVERED,
      sentAt: new Date('2026-07-29T10:00:00Z'),
    });

    const result = await service.createFromWebhook(baseInput);

    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'msg-1',
      status: MessageStatus.DELIVERED,
      sentAt: new Date('2026-07-29T10:00:00Z'),
      isNew: false,
    });
  });
});
