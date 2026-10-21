import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Availability, ConversationStatus, Role } from '../src/generated/prisma/client';
import axios from 'axios';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { QUEUE_NAMES } from '../src/shared/queues/queue-names';

/**
 * B-114 (ADR-0019, regras 18 a 21) — SLA do atendimento pela API HTTP de
 * verdade (AppModule inteiro, Postgres e Bull reais, com o processor do SLA
 * consumindo a fila): o relógio abre no Atender e fecha no Encerrar, com o
 * prazo do setor.
 *
 * Setores do teste:
 * - Receitas: prazo de 2 s, para o Bull disparar de verdade durante o teste;
 * - Ultrassom (15 min) e Endoscopia (20 min): longe de estourar, para
 *   conferir o prazo gravado nas transferências.
 *
 * Os jobs agendados são removidos no fim, para não caírem na fila de uma API
 * de dev que esteja no ar.
 */
const agent = new http.Agent({ keepAlive: false });

describe('SLA do atendimento (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let slaQueue: Queue;
  let base: string;
  const run = randomUUID().slice(0, 8);
  let companyId: string;
  const dept: Record<string, string> = {};
  const queueOf: Record<string, string> = {};
  const users: Record<string, { id: string; token: string }> = {};
  const conversations: string[] = [];

  const call = (method: string, path: string, who: string, data?: unknown) =>
    axios.request({
      method,
      url: `${base}/api/v1${path}`,
      data,
      headers: { authorization: `Bearer ${users[who].token}` },
      httpAgent: agent,
      validateStatus: () => true,
    });

  const conversation = (id: string) => prisma.conversation.findUniqueOrThrow({ where: { id } });

  // Espera o Bull disparar e o processor gravar (sem sleep fixo)
  const eventually = async <T>(read: () => Promise<T | null | undefined | false>, timeoutMs = 15000) => {
    const started = Date.now();
    for (;;) {
      const value = await read();
      if (value) return value;
      if (Date.now() - started > timeoutMs) throw new Error('o que o teste esperava não aconteceu a tempo');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const mkUser = async (key: string, role: Role, departments: string[]) => {
    const u = await prisma.user.create({
      data: {
        companyId,
        name: key,
        email: `${key}-${run}@e2e.test`,
        passwordHash: 'x',
        role,
        availability: Availability.ONLINE,
        departments: { connect: departments.map((d) => ({ id: dept[d] })) },
      },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
    users[key] = { id: u.id, token: (await app.get(AuthService).login(u)).accessToken };
  };

  // Conversa na fila do setor, pronta para alguém atender
  const mkWaiting = async (department: string) => {
    const contact = await prisma.contact.create({
      data: { companyId, phone: `55${Math.floor(Math.random() * 1e11)}`, name: 'Paciente' },
    });
    const conv = await prisma.conversation.create({
      data: {
        companyId,
        contactId: contact.id,
        departmentId: dept[department],
        queueId: queueOf[department],
        status: ConversationStatus.WAITING,
        waitingSince: new Date(),
      },
    });
    conversations.push(conv.id);
    return conv.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);
    slaQueue = app.get(getQueueToken(QUEUE_NAMES.SLA_CHECK));

    companyId = (await prisma.company.create({ data: { name: 'E2E B-114', slug: `e2e-b114-${run}` } })).id;
    for (const [name, maxServiceSecs] of [
      ['receitas', 2],
      ['ultrassom', 900],
      ['endoscopia', 1200],
    ] as const) {
      dept[name] = (await prisma.department.create({ data: { companyId, name } })).id;
      queueOf[name] = (
        await prisma.queue.create({
          data: { companyId, departmentId: dept[name], name: `Fila ${name}`, maxWaitSecs: 300, maxServiceSecs },
        })
      ).id;
    }

    await mkUser('ana', Role.AGENT, ['receitas']);
    await mkUser('carla', Role.AGENT, ['ultrassom']);
    await mkUser('davi', Role.AGENT, ['ultrassom']);
    await mkUser('erica', Role.AGENT, ['endoscopia']);
    await mkUser('sueli', Role.SUPERVISOR, []);
  });

  afterAll(async () => {
    for (const id of conversations) {
      for (const jobId of [`service-sla:${id}`, `sla-check:${id}`]) {
        await (await slaQueue.getJob(jobId))?.remove().catch(() => undefined);
      }
    }
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

  it('atendida e não encerrada: estoura no prazo do setor e avisa quem atende e o supervisor', async () => {
    const id = await mkWaiting('receitas');

    const res = await call('POST', `/conversations/${id}/attend`, 'ana');
    expect(res.status).toBe(200);
    const attended = await conversation(id);
    expect(attended.serviceSlaDueAt!.getTime() - attended.attendedAt!.getTime()).toBe(2000);

    // O Bull dispara o job no prazo e o processor marca o estouro
    const breached = await eventually(async () => (await conversation(id)).serviceSlaBreachedAt);
    expect(breached.getTime()).toBeGreaterThanOrEqual(attended.serviceSlaDueAt!.getTime() - 1000);

    const notified = await eventually(async () => {
      const rows = await prisma.notification.findMany({ where: { companyId, type: 'service_sla_breach' } });
      return rows.length === 2 && rows;
    });
    expect(notified.map((n) => n.userId).sort()).toEqual([users.ana.id, users.sueli.id].sort());
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'sla.service_breached' } })).toBe(1);
  });

  it('Pegar próxima: abre o ciclo com o prazo do setor da conversa escolhida', async () => {
    const id = await mkWaiting('ultrassom');

    const res = await call('POST', '/conversations/next', 'carla');

    expect(res.status).toBe(200);
    expect(res.data.id).toBe(id);
    // O prazo é gravado depois da troca, conferindo o início devolvido pelo SQL
    const picked = await conversation(id);
    expect(picked.serviceSlaDueAt!.getTime() - picked.attendedAt!.getTime()).toBe(900_000);
    const job = await slaQueue.getJob(`service-sla:${id}`);
    expect(Math.abs(job!.timestamp + Number(job!.opts.delay) - picked.serviceSlaDueAt!.getTime())).toBeLessThan(2000);
  });

  it('transferida para outra pessoa do mesmo setor: o prazo continua o mesmo', async () => {
    const id = await mkWaiting('ultrassom');
    await call('POST', `/conversations/${id}/attend`, 'carla');
    const before = await conversation(id);

    const res = await call('PATCH', `/conversations/${id}/assign`, 'carla', { agentId: users.davi.id });

    expect(res.status).toBe(200);
    const after = await conversation(id);
    expect(after.agentId).toBe(users.davi.id);
    expect(after.attendedAt).toEqual(before.attendedAt);
    expect(after.serviceSlaDueAt).toEqual(before.serviceSlaDueAt);
    // O job do ciclo segue agendado para o mesmo prazo
    const job = await slaQueue.getJob(`service-sla:${id}`);
    expect(Math.abs(job!.timestamp + Number(job!.opts.delay) - after.serviceSlaDueAt!.getTime())).toBeLessThan(2000);
  });

  it('mudou de setor: recomeça com o prazo do setor novo', async () => {
    const id = await mkWaiting('ultrassom');
    await call('POST', `/conversations/${id}/attend`, 'carla');
    const before = await conversation(id);

    const res = await call('PATCH', `/conversations/${id}/assign`, 'sueli', {
      agentId: users.erica.id,
      departmentId: dept.endoscopia,
    });

    expect(res.status).toBe(200);
    const after = await conversation(id);
    expect(after).toMatchObject({ agentId: users.erica.id, departmentId: dept.endoscopia, queueId: queueOf.endoscopia });
    expect(after.attendedAt!.getTime()).toBeGreaterThanOrEqual(before.attendedAt!.getTime());
    expect(after.serviceSlaDueAt!.getTime() - after.attendedAt!.getTime()).toBe(1200_000);
    const job = await slaQueue.getJob(`service-sla:${id}`);
    expect(Math.abs(job!.timestamp + Number(job!.opts.delay) - after.serviceSlaDueAt!.getTime())).toBeLessThan(2000);
  });

  it('encerrada antes do prazo: não estoura, e a auditoria registra o atendimento no prazo', async () => {
    const id = await mkWaiting('receitas');
    await call('POST', `/conversations/${id}/attend`, 'ana');

    const res = await call('PATCH', `/conversations/${id}/status`, 'ana', { status: 'CLOSED', resolution: 'RESOLVED' });

    expect(res.status).toBe(200);
    // Passa do prazo de 2 s com folga: nada pode estourar
    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect((await conversation(id)).serviceSlaBreachedAt).toBeNull();
    expect(await slaQueue.getJob(`service-sla:${id}`)).toBeNull();
    const closed = await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'conversation.service_closed' } });
    expect(closed.after).toMatchObject({ agentId: users.ana.id, maxServiceSecs: 2, breached: false });
  });
});
