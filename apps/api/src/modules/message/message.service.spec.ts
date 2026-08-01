import { MessageService } from './message.service';
import { MessageType, MessageStatus, SenderType, Prisma } from '@prisma/client';

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`externalId`)', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

// B-48: `createFromWebhook`/`createUnique` não fazem mais findFirst()+create()
// (TOCTOU — dois workers concorrentes passavam pelo findFirst antes de
// qualquer create existir e duas linhas eram gravadas). Agora é create()
// direto contra o `@@unique([externalId])` do schema, com P2002 tratado como
// "outro processo venceu a corrida" em vez de erro. `isNew` no retorno segue
// sendo o sinal que webhook.service.ts usa pra pular efeitos colaterais
// (mídia/preview/auto-atendimento/eventos) num retry idempotente do Bull —
// sem cobertura direta aqui, uma regressão nesse campo quebraria a
// idempotência sem nenhum teste acusando.
describe('MessageService#createFromWebhook — idempotência (B-48/B-39)', () => {
  const mockPrisma = {
    message: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
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

  it('cria a mensagem direto (sem checagem prévia) e retorna isNew=true quando o externalId ainda não existe', async () => {
    mockPrisma.message.create.mockResolvedValueOnce({
      id: 'msg-1',
      status: MessageStatus.DELIVERED,
      sentAt: new Date('2026-07-29T10:00:00Z'),
    });

    const result = await service.createFromWebhook(baseInput);

    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: 'msg-1',
      status: MessageStatus.DELIVERED,
      sentAt: new Date('2026-07-29T10:00:00Z'),
      isNew: true,
    });
  });

  it('sob corrida (P2002 no create), busca a linha que já existe e retorna isNew=false — sem gerar duplicata nem propagar o erro', async () => {
    mockPrisma.message.create.mockRejectedValueOnce(p2002());
    mockPrisma.message.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'msg-1',
      status: MessageStatus.DELIVERED,
      sentAt: new Date('2026-07-29T10:00:00Z'),
    });

    const result = await service.createFromWebhook(baseInput);

    expect(mockPrisma.message.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { externalId: 'wa-1' },
      select: { id: true, status: true, sentAt: true },
    });
    expect(result).toEqual({
      id: 'msg-1',
      status: MessageStatus.DELIVERED,
      sentAt: new Date('2026-07-29T10:00:00Z'),
      isNew: false,
    });
  });

  it('propaga qualquer outro erro do create (não é P2002) sem tentar buscar nada', async () => {
    mockPrisma.message.create.mockRejectedValueOnce(new Error('conexão com o banco caiu'));

    await expect(service.createFromWebhook(baseInput)).rejects.toThrow('conexão com o banco caiu');
    expect(mockPrisma.message.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
