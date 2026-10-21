import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Availability, ConversationStatus, Role } from '../src/generated/prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * B-66 (ADR-0019) — Fila compartilhada pela API HTTP de verdade (AppModule
 * inteiro e Postgres real): quem atender primeiro fica com a conversa, Offline
 * não pega da fila, o atendente comum só transfere as conversas dele e a fila
 * só aceita a estratégia MANUAL.
 *
 * O "quem atender primeiro" só se prova com concorrência real: cinco pedidos
 * ao mesmo tempo contra o mesmo banco — a atualização condicional deixa passar
 * um só (ADR-0004).
 *
 * Sessões saem do AuthService (não de POST /auth/login) pelo limite de 5
 * logins por minuto por IP.
 */
const agent = new http.Agent({ keepAlive: false });

describe('Fila compartilhada — atender, transferir e estratégia (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const run = randomUUID().slice(0, 8);
  let companyId: string;
  let departmentId: string;
  const users: Record<string, { id: string; name: string; token: string }> = {};

  const call = (method: string, path: string, who: string, data?: unknown) =>
    axios.request({
      method,
      url: `${base}/api/v1${path}`,
      data,
      headers: { authorization: `Bearer ${users[who].token}` },
      httpAgent: agent,
      validateStatus: () => true,
    });

  const mkUser = async (key: string, role: Role, availability: Availability) => {
    const u = await prisma.user.create({
      data: {
        companyId,
        name: key,
        email: `${key}-${run}@e2e.test`,
        passwordHash: 'x',
        role,
        availability,
        departments: { connect: { id: departmentId } },
      },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
    users[key] = { id: u.id, name: u.name, token: (await app.get(AuthService).login(u)).accessToken };
  };

  const mkConversation = async (status: ConversationStatus, agentId: string | null = null) => {
    const contact = await prisma.contact.create({
      data: { companyId, phone: `55${Math.floor(Math.random() * 1e11)}`, name: 'Paciente' },
    });
    const conv = await prisma.conversation.create({
      data: { companyId, contactId: contact.id, departmentId, status, agentId, waitingSince: new Date() },
    });
    return conv.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);

    companyId = (await prisma.company.create({ data: { name: 'E2E B-66', slug: `e2e-b66-${run}` } })).id;
    departmentId = (await prisma.department.create({ data: { companyId, name: 'Receitas' } })).id;
    await prisma.queue.create({ data: { companyId, departmentId, name: 'Fila Receitas', maxWaitSecs: 300 } });

    for (const key of ['ana', 'bruno', 'carla', 'davi', 'elisa']) {
      await mkUser(key, Role.AGENT, Availability.ONLINE);
    }
    await mkUser('otavio', Role.AGENT, Availability.OFFLINE);
    await mkUser('sueli', Role.SUPERVISOR, Availability.ONLINE);
    await mkUser('admin', Role.ADMIN, Availability.ONLINE);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.notification.deleteMany({ where: { companyId } });
    await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });
    await prisma.conversation.deleteMany({ where: { companyId } });
    await prisma.contact.deleteMany({ where: { companyId } });
    await prisma.queue.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.department.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await app.close();
  });

  it('cinco atendentes atendendo a mesma conversa ao mesmo tempo: um fica com ela, os outros recebem 409 com o nome', async () => {
    const id = await mkConversation(ConversationStatus.WAITING);
    const disputing = ['ana', 'bruno', 'carla', 'davi', 'elisa'];

    const responses = await Promise.all(disputing.map((who) => call('POST', `/conversations/${id}/attend`, who)));

    const winners = responses.filter((r) => r.status === 200);
    const losers = responses.filter((r) => r.status === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(4);

    const winnerName = winners[0].data.agent.name;
    losers.forEach((r) => expect(r.data.message).toBe(`${winnerName} já está atendendo`));

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    expect(conv.status).toBe(ConversationStatus.OPEN);
    expect(conv.agentId).toBe(users[winnerName].id);
    // Um ciclo só na auditoria — os perdedores não deixam rastro
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'conversation.attended' } })).toBe(1);
  });

  it('Offline não pega da fila: 409 "Fique Online para atender"', async () => {
    const id = await mkConversation(ConversationStatus.WAITING);

    const res = await call('POST', `/conversations/${id}/attend`, 'otavio');

    expect(res.status).toBe(409);
    expect(res.data.message).toBe('Fique Online para atender');
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id } })).status).toBe(ConversationStatus.WAITING);
  });

  it('atendente comum não puxa nem transfere conversa de colega, nem por troca de status (403)', async () => {
    const id = await mkConversation(ConversationStatus.OPEN, users.ana.id);

    expect((await call('PATCH', `/conversations/${id}/assign`, 'bruno', { agentId: users.bruno.id })).status).toBe(403);
    expect((await call('PATCH', `/conversations/${id}/assign`, 'bruno', { agentId: users.carla.id })).status).toBe(403);
    // Atalho fechado: devolver a conversa da Ana para a fila e atendê-la
    expect((await call('PATCH', `/conversations/${id}/status`, 'bruno', { status: 'WAITING' })).status).toBe(403);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id } })).agentId).toBe(users.ana.id);
  });

  it('o atendente transfere a conversa dele para um colega Online; para um colega Offline, 409', async () => {
    const id = await mkConversation(ConversationStatus.OPEN, users.ana.id);

    const offline = await call('PATCH', `/conversations/${id}/assign`, 'ana', { agentId: users.otavio.id });
    expect(offline.status).toBe(409);
    expect(offline.data.message).toBe('otavio está Offline');

    const ok = await call('PATCH', `/conversations/${id}/assign`, 'ana', { agentId: users.bruno.id });
    expect(ok.status).toBe(200);
    expect(ok.data.agent.id).toBe(users.bruno.id);
  });

  it('supervisor puxa para si a conversa de um atendente', async () => {
    const id = await mkConversation(ConversationStatus.OPEN, users.carla.id);

    const res = await call('PATCH', `/conversations/${id}/assign`, 'sueli', { agentId: users.sueli.id });

    expect(res.status).toBe(200);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id } })).agentId).toBe(users.sueli.id);
  });

  it('devolver à fila: volta WAITING, sem atendente, com espera e prazo de SLA novos', async () => {
    const id = await mkConversation(ConversationStatus.OPEN, users.davi.id);
    const before = Date.now();

    const res = await call('PATCH', `/conversations/${id}/assign`, 'davi', {});

    expect(res.status).toBe(200);
    expect(res.data.status).toBe('WAITING');
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    expect(conv.agentId).toBeNull();
    expect(conv.waitingSince!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    // A fila do setor tem 300 s de prazo
    expect(conv.waitSlaDueAt!.getTime() - conv.waitingSince!.getTime()).toBe(300_000);
  });

  it('fila só com a estratégia MANUAL: ROUND_ROBIN e LEAST_BUSY respondem 400', async () => {
    const mk = (strategy?: string) =>
      call('POST', '/queues', 'admin', { name: `Fila ${strategy ?? 'padrão'} ${run}`, ...(strategy && { strategy }) });

    expect((await mk('ROUND_ROBIN')).status).toBe(400);
    expect((await mk('LEAST_BUSY')).status).toBe(400);
    const created = await mk();
    expect(created.status).toBe(201);
    expect(created.data.strategy).toBe('MANUAL');
  });
});
