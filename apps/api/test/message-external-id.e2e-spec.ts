import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MessageStatus, MessageType, SenderType } from '../src/generated/prisma/client';
import { randomUUID } from 'crypto';
import { MessageService } from '../src/modules/message/message.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * C-09/B-58 — Teste E2E da unicidade do externalId por conexão (Postgres real).
 *
 * Cenário que o B-48 quebrava: duas conexões de WhatsApp cadastradas no
 * AtendeHub conversando entre si. O WhatsApp entrega a MESMA mensagem (mesmo
 * id) às duas pontas — cada uma com sua conexão, sua conversa e,
 * possivelmente, sua empresa. Com o índice único global do B-48, a 2ª
 * gravação colidia e devolvia a mensagem da outra conversa como "já
 * existente"; a mensagem sumia para um dos lados.
 *
 * O teste usa o MessageService de verdade contra o banco de dev (índice
 * composto aplicado pela migration do B-58) — o que importa aqui é o
 * comportamento do Postgres, que o teste unitário (Prisma mockado) não vê.
 *
 * Pré-requisito: Postgres em localhost:5432 com as migrations aplicadas
 * (`docker compose up -d postgres` + `npm run db:migrate`). Cria duas
 * empresas descartáveis e apaga tudo no final.
 */
describe('Mensagens — externalId único por conexão (E2E, Postgres real)', () => {
  jest.setTimeout(30000);

  let module: TestingModule;
  let prisma: PrismaService;
  let messages: MessageService;

  const run = randomUUID().slice(0, 8);
  const companyIds: string[] = [];
  let connA: { id: string; conversationId: string };
  let connB: { id: string; conversationId: string };

  async function seedSide(label: string, phoneOfOtherSide: string) {
    const company = await prisma.company.create({
      data: { name: `E2E B-58 ${label}`, slug: `e2e-b58-${label}-${run}` },
    });
    companyIds.push(company.id);
    const connection = await prisma.whatsAppConnection.create({
      data: { companyId: company.id, name: `Conexão ${label}`, sessionName: `e2e-b58-${label}-${run}` },
    });
    const contact = await prisma.contact.create({
      data: { companyId: company.id, phone: phoneOfOtherSide, name: `Outro lado de ${label}` },
    });
    const conversation = await prisma.conversation.create({
      data: { companyId: company.id, contactId: contact.id, whatsappConnectionId: connection.id },
    });
    return { id: connection.id, conversationId: conversation.id };
  }

  const incoming = (side: { id: string; conversationId: string }, externalId: string, senderType: SenderType) => ({
    conversationId: side.conversationId,
    whatsappConnectionId: side.id,
    content: 'Olá do outro número',
    type: MessageType.TEXT,
    senderType,
    externalId,
  });

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })],
      providers: [PrismaService, MessageService],
    }).compile();
    await module.init();

    prisma = module.get(PrismaService);
    messages = module.get(MessageService);

    // Empresa A e empresa B, cada uma com seu número; uma é contato da outra.
    connA = await seedSide('a', `55119${run.replace(/\D/g, '').padEnd(8, '1').slice(0, 8)}`);
    connB = await seedSide('b', `55219${run.replace(/\D/g, '').padEnd(8, '2').slice(0, 8)}`);
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversation: { companyId: { in: companyIds } } } });
    await prisma.conversation.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.contact.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.whatsAppConnection.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await module.close();
  });

  it('a mesma mensagem chega às duas pontas e é gravada nas DUAS conversas', async () => {
    const externalId = `WA-${run}-1`;

    // Ponta A enviou (eco fromMe → AGENT); ponta B recebeu (CLIENT).
    const sent = await messages.createFromWebhook(incoming(connA, externalId, SenderType.AGENT));
    const received = await messages.createFromWebhook(incoming(connB, externalId, SenderType.CLIENT));

    expect(sent.isNew).toBe(true);
    expect(received.isNew).toBe(true); // com o índice global do B-48: false, e a mensagem sumia
    expect(received.id).not.toBe(sent.id);

    const rows = await prisma.message.findMany({
      where: { externalId },
      select: { conversationId: true, whatsappConnectionId: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.conversationId).sort()).toEqual(
      [connA.conversationId, connB.conversationId].sort(),
    );
  });

  it('na MESMA conexão a idempotência do B-48 continua: 5 gravações simultâneas viram 1 linha', async () => {
    const externalId = `WA-${run}-2`;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => messages.createFromWebhook(incoming(connA, externalId, SenderType.CLIENT))),
    );

    expect(results.filter((r) => r.isNew)).toHaveLength(1);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await prisma.message.count({ where: { whatsappConnectionId: connA.id, externalId } })).toBe(1);
  });

  it('status de leitura de uma ponta não altera a mensagem da outra empresa', async () => {
    const externalId = `WA-${run}-3`;
    await messages.createFromWebhook(incoming(connA, externalId, SenderType.AGENT));
    await messages.createFromWebhook(incoming(connB, externalId, SenderType.CLIENT));

    await messages.updateStatus(connA.id, externalId, MessageStatus.READ);

    const a = await prisma.message.findUniqueOrThrow({
      where: { whatsappConnectionId_externalId: { whatsappConnectionId: connA.id, externalId } },
    });
    const b = await prisma.message.findUniqueOrThrow({
      where: { whatsappConnectionId_externalId: { whatsappConnectionId: connB.id, externalId } },
    });
    expect(a.status).toBe(MessageStatus.READ);
    expect(b.status).toBe(MessageStatus.DELIVERED);
  });

  // B-76 (M-01): o retry do webhook lê as etapas que faltam da própria
  // mensagem; cada etapa concluída sai da lista no Postgres (array_remove).
  it('etapas pendentes do webhook: o retry recebe o que falta e cada conclusão tira só a sua', async () => {
    const externalId = `WA-${run}-4`;
    const first = await messages.createFromWebhook({
      ...incoming(connA, externalId, SenderType.CLIENT),
      pendingWebhookSteps: ['preview', 'auto_reply', 'event_message_new'],
    });
    await messages.completeWebhookStep(first.id, 'preview');

    // Retry: a mensagem já existe e devolve só o que ficou pendente
    const retry = await messages.createFromWebhook({
      ...incoming(connA, externalId, SenderType.CLIENT),
      pendingWebhookSteps: ['preview', 'auto_reply', 'event_message_new'],
    });
    expect(retry.isNew).toBe(false);
    expect(retry.pendingWebhookSteps).toEqual(['auto_reply', 'event_message_new']);

    await messages.completeWebhookStep(first.id, 'auto_reply');
    await messages.completeWebhookStep(first.id, 'auto_reply'); // repetida: sem efeito
    await messages.completeWebhookStep(first.id, 'event_message_new');
    const done = await prisma.message.findUniqueOrThrow({ where: { id: first.id } });
    expect(done.pendingWebhookSteps).toEqual([]);
  });
});
