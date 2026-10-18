import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AuditLogService } from '../src/modules/audit-log/audit-log.service';
import { ContactService } from '../src/modules/contact/contact.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { StorageService } from '../src/shared/storage/storage.service';

/**
 * M-12/B-62 — Teste E2E da anonimização de contato (Postgres real).
 *
 * A anonimização trocava nome/telefone do contato, mas a PII sobrevivia em
 * três lugares: `messages.metadata.remoteJid` (telefone), o texto das
 * notificações ("Fulano está esperando...") e o próprio registro de
 * auditoria da anonimização (gravava nome, telefone e e-mail). Este teste
 * anonimiza um contato de verdade e procura a PII no banco inteiro dessas
 * tabelas. O SQL das limpezas (operador jsonb, ANY em array) só é provado
 * aqui — o teste unitário mocka o Prisma.
 *
 * Pré-requisito: Postgres em localhost:5432 com as migrations aplicadas.
 */
describe('Anonimização de contato — sem rastro de PII (E2E, Postgres real)', () => {
  jest.setTimeout(30000);

  let module: TestingModule;
  let prisma: PrismaService;
  let contacts: ContactService;

  const run = randomUUID().slice(0, 8);
  const phone = `5511${Date.now().toString().slice(-9)}`;
  const name = `Titular E2E ${run}`;
  const email = `titular-${run}@e2e.test`;
  let companyId: string;
  let contactId: string;
  let conversationId: string;
  let otherConversationId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })],
      providers: [
        PrismaService,
        AuditLogService,
        ContactService,
        { provide: StorageService, useValue: { deleteByUrl: jest.fn() } },
      ],
    }).compile();
    await module.init();
    prisma = module.get(PrismaService);
    contacts = module.get(ContactService);

    companyId = (await prisma.company.create({ data: { name: 'E2E B-62', slug: `e2e-b62-${run}` } })).id;
    const user = await prisma.user.create({
      data: { companyId, name: 'Atendente', email: `ag-${run}@e2e.test`, passwordHash: 'x' },
    });
    contactId = (await prisma.contact.create({ data: { companyId, phone, name, email } })).id;
    const other = await prisma.contact.create({ data: { companyId, phone: `5521${run.replace(/\D/g, '1')}`, name: 'Outro cliente' } });

    conversationId = (await prisma.conversation.create({ data: { companyId, contactId } })).id;
    otherConversationId = (await prisma.conversation.create({ data: { companyId, contactId: other.id } })).id;

    await prisma.message.createMany({
      data: [
        { conversationId, senderType: 'CLIENT', content: 'Oi', metadata: { remoteJid: `${phone}@s.whatsapp.net`, timestamp: 1 } },
        { conversationId, senderType: 'CLIENT', content: 'Tudo bem?', metadata: { remoteJid: `${phone}@s.whatsapp.net`, timestamp: 2 } },
        { conversationId: otherConversationId, senderType: 'CLIENT', content: 'Sou outro', metadata: { remoteJid: '5521000000000@s.whatsapp.net' } },
      ],
    });
    await prisma.notification.createMany({
      data: [
        { companyId, userId: user.id, type: 'sla_breach', title: 'Conversa aguardando além do prazo', body: `${name} está esperando há 300s`, data: { conversationId } },
        { companyId, userId: user.id, type: 'new_conversation', title: 'Nova conversa', body: 'Outro cliente', data: { conversationId: otherConversationId } },
      ],
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { companyId } });
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.message.deleteMany({ where: { conversation: { companyId } } });
    await prisma.conversation.deleteMany({ where: { companyId } });
    await prisma.contact.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await module.close();
  });

  it('anonimiza e não deixa telefone, nome ou e-mail em mensagens, notificações nem auditoria', async () => {
    const result = await contacts.remove(companyId, contactId, null as unknown as string);
    expect(result.traces).toEqual({ messages: 2, notifications: 1 });

    const dump = JSON.stringify({
      contact: await prisma.contact.findUnique({ where: { id: contactId } }),
      messages: await prisma.message.findMany({ where: { conversationId }, select: { metadata: true } }),
      notifications: await prisma.notification.findMany({ where: { companyId }, select: { title: true, body: true } }),
      audit: await prisma.auditLog.findMany({ where: { companyId }, select: { before: true, after: true } }),
    });

    expect(dump).not.toContain(phone);
    expect(dump).not.toContain(name);
    expect(dump).not.toContain(email);
  });

  it('preserva o histórico: conteúdo das mensagens e o resto do metadata ficam', async () => {
    const msgs = await prisma.message.findMany({ where: { conversationId }, orderBy: { content: 'asc' } });
    expect(msgs.map((m) => m.content)).toEqual(['Oi', 'Tudo bem?']);
    expect(msgs.map((m) => (m.metadata as { timestamp?: number }).timestamp).sort()).toEqual([1, 2]);
  });

  it('não toca nas mensagens e notificações de outros contatos', async () => {
    const other = await prisma.message.findFirstOrThrow({ where: { conversationId: otherConversationId } });
    expect((other.metadata as { remoteJid?: string }).remoteJid).toBe('5521000000000@s.whatsapp.net');
    const otherNotification = await prisma.notification.findFirstOrThrow({ where: { companyId, body: 'Outro cliente' } });
    expect(otherNotification).toBeTruthy();
  });
});
