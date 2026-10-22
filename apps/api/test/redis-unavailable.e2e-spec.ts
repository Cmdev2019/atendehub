import { INestApplication, Logger } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import Bull from 'bull';
import { randomUUID } from 'crypto';
import * as http from 'http';
import * as net from 'net';
import { Availability, ConversationStatus, Role } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { ConversationService } from '../src/modules/conversation/conversation.service';
import { SlaReconciliationService } from '../src/modules/conversation/sla-reconciliation.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * B-107 — a API inteira (AppModule, Postgres e Redis reais) falando com o
 * Redis por um proxy TCP deste teste, que simula as duas falhas:
 * - travado: aceita a conexão e segura os bytes, como um Redis pausado;
 * - fora do ar: recusa a conexão.
 * Antes do B-107, com o Redis travado, a rota autenticada e o readiness não
 * respondiam, e o Atender ficava pendurado depois de gravar a troca.
 *
 * As filas desta instância são pausadas localmente: ela só produz jobs, para
 * não pegar (e prender no proxy travado) jobs de outros e2e que rodam junto.
 * Os jobs são conferidos direto no Redis, sem o proxy. Como os outros e2e
 * também têm a reconciliação ligada (a cada 60 s), a falha da sincronização é
 * conferida pelo log desta instância, e a volta, pelo job no Redis.
 */
class RedisProxy {
  port = 0;
  private server?: net.Server;
  private frozen = false;
  private readonly links = new Set<{ client: net.Socket; upstream: net.Socket; held: [net.Socket, Buffer][] }>();

  constructor(private readonly target: { host: string; port: number }) {}

  async listen() {
    this.server = net.createServer((client) => this.accept(client));
    await new Promise<void>((resolve) => this.server!.listen(this.port, '127.0.0.1', resolve));
    this.port = (this.server!.address() as net.AddressInfo).port;
  }

  freeze() {
    this.frozen = true;
  }

  thaw() {
    this.frozen = false;
    for (const link of this.links) {
      for (const [socket, chunk] of link.held.splice(0)) socket.write(chunk);
    }
  }

  // Fora do ar: fecha a porta e derruba as conexões abertas
  async refuse() {
    for (const link of this.links) {
      link.client.destroy();
      link.upstream.destroy();
    }
    await new Promise((resolve) => this.server!.close(resolve));
  }

  async close() {
    await this.refuse().catch(() => undefined);
  }

  private accept(client: net.Socket) {
    const upstream = net.connect(this.target.port, this.target.host);
    const link = { client, upstream, held: [] as [net.Socket, Buffer][] };
    this.links.add(link);
    const relay = (to: net.Socket) => (chunk: Buffer) => (this.frozen ? link.held.push([to, chunk]) : to.write(chunk));
    client.on('data', relay(upstream));
    upstream.on('data', relay(client));
    for (const socket of [client, upstream]) {
      socket.on('error', () => undefined);
      socket.on('close', () => {
        client.destroy();
        upstream.destroy();
        this.links.delete(link);
      });
    }
  }
}

const agent = new http.Agent({ keepAlive: false });

describe('B-107 — Redis travado ou fora do ar (E2E)', () => {
  jest.setTimeout(120000);

  const realRedis = { host: process.env.REDIS_HOST ?? '127.0.0.1', port: Number(process.env.REDIS_PORT ?? 6379) };
  const savedEnv = { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT };
  const proxy = new RedisProxy(realRedis);
  const run = randomUUID().slice(0, 8);

  let app: INestApplication;
  let prisma: PrismaService;
  let inspector: Bull.Queue; // a fila do SLA direto no Redis, sem o proxy
  let base: string;
  let companyId: string;
  let departmentId: string;
  const users: Record<string, { id: string; token: string }> = {};
  const conv: Record<string, string> = {};

  const call = async (method: string, path: string, who?: string, data?: unknown) => {
    const started = Date.now();
    const res = await axios.request({
      method,
      url: `${base}/api/v1${path}`,
      data,
      headers: who ? { authorization: `Bearer ${users[who].token}` } : {},
      httpAgent: agent,
      timeout: 15000, // antes do B-107, o travado chegava aqui
      validateStatus: () => true,
    });
    return { status: res.status, data: res.data, ms: Date.now() - started };
  };

  const eventually = async <T>(read: () => Promise<T | null | undefined | false>, timeoutMs = 45000) => {
    const started = Date.now();
    for (;;) {
      const value = await read().catch(() => null);
      if (value) return value;
      if (Date.now() - started > timeoutMs) throw new Error('o que o teste esperava não aconteceu a tempo');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const conversation = (id: string) => prisma.conversation.findUniqueOrThrow({ where: { id } });
  // O aviso de que o job daquela conversa não chegou ao Redis (B-107)
  let warnSpy: jest.SpyInstance;
  const syncFailed = (id: string) =>
    warnSpy.mock.calls.some(([message]) => String(message).includes(`SLA da conversa ${id} não sincronizado`));
  const firesAt = (job: Bull.Job) => job.timestamp + Number(job.opts.delay ?? 0);

  // Na fila do setor, com o início da espera e o prazo dela gravados
  const mkWaiting = async (key: string, waitingSince: Date) => {
    const contact = await prisma.contact.create({
      data: { companyId, phone: `55${Math.floor(Math.random() * 1e11)}`, name: 'Paciente' },
    });
    const queue = await prisma.queue.findFirstOrThrow({ where: { companyId, departmentId } });
    conv[key] = (
      await prisma.conversation.create({
        data: {
          companyId,
          contactId: contact.id,
          departmentId,
          queueId: queue.id,
          status: ConversationStatus.WAITING,
          waitingSince,
          waitSlaDueAt: new Date(waitingSince.getTime() + 600_000),
        },
      })
    ).id;
  };

  beforeAll(async () => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn');
    await proxy.listen();
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = String(proxy.port);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);

    // Só produtora: nenhuma fila desta instância processa jobs
    const queues = new Set<Bull.Queue>();
    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.providers.values()) {
        if (wrapper.instance instanceof Bull) queues.add(wrapper.instance);
      }
    }
    await Promise.all([...queues].map((queue) => queue.pause(true)));

    inspector = new Bull('sla-check', { redis: { ...realRedis, keyPrefix: 'bull:' } });

    companyId = (await prisma.company.create({ data: { name: 'E2E B-107', slug: `e2e-b107-${run}` } })).id;
    departmentId = (await prisma.department.create({ data: { companyId, name: 'Receitas' } })).id;
    await prisma.queue.create({
      data: { companyId, departmentId, name: 'Fila Receitas', maxWaitSecs: 600, maxServiceSecs: 1200 },
    });
    for (const [key, role] of [
      ['ana', Role.AGENT],
      ['sueli', Role.SUPERVISOR],
    ] as const) {
      const u = await prisma.user.create({
        data: {
          companyId,
          name: key,
          email: `${key}-${run}@e2e.test`,
          passwordHash: 'x',
          role,
          availability: Availability.ONLINE,
          departments: { connect: { id: departmentId } },
        },
        select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
      });
      users[key] = { id: u.id, token: (await app.get(AuthService).login(u)).accessToken };
    }

    // "proxima" é a mais antiga: é ela que o Pegar próxima escolhe
    const now = Date.now();
    await mkWaiting('proxima', new Date(now - 300_000));
    for (const [i, key] of ['atendida', 'encerrada', 'devolvida', 'recusada'].entries()) {
      await mkWaiting(key, new Date(now - 60_000 + i * 1000));
    }
  });

  afterAll(async () => {
    proxy.thaw();
    await app.get(ConversationService).whenSlaSynced();
    for (const id of Object.values(conv)) {
      for (const jobId of [`service-sla:${id}`, `sla-check:${id}`]) {
        await (await inspector.getJob(jobId))?.remove().catch(() => undefined);
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
    await inspector.close();
    await proxy.close();
    process.env.REDIS_HOST = savedEnv.host;
    process.env.REDIS_PORT = savedEnv.port;
    warnSpy.mockRestore();
  });

  it('Redis saudável: a rota autenticada e o readiness respondem', async () => {
    expect((await call('GET', '/conversations', 'ana')).status).toBe(200);
    expect((await call('GET', '/health/ready')).status).toBe(200);
  });

  describe('Redis travado (aceita a conexão e não responde)', () => {
    beforeAll(() => proxy.freeze());

    it('rota autenticada responde em menos de 3 s (blacklist em fail-open)', async () => {
      const res = await call('GET', '/conversations', 'ana');

      expect(res.status).toBe(200);
      expect(res.ms).toBeLessThan(3000);
    });

    it('readiness responde 503 com o Redis fora, em menos de 4 s', async () => {
      const res = await call('GET', '/health/ready');

      expect(res.status).toBe(503);
      expect(res.data.checks).toEqual({ database: 'up', redis: 'down' });
      expect(res.ms).toBeLessThan(4000);
    });

    it('Pegar próxima responde, com o prazo do setor e a auditoria gravados', async () => {
      const res = await call('POST', '/conversations/next', 'ana');

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(conv.proxima);
      expect(res.ms).toBeLessThan(3000);
      const picked = await conversation(conv.proxima);
      expect(picked).toMatchObject({ status: ConversationStatus.OPEN, agentId: users.ana.id });
      expect(picked.serviceSlaDueAt!.getTime() - picked.attendedAt!.getTime()).toBe(1_200_000);
      expect(await prisma.auditLog.count({ where: { entityId: conv.proxima, action: 'conversation.attended' } })).toBe(1);
    });

    it('Atender responde, com a troca, o prazo e a auditoria gravados', async () => {
      const res = await call('POST', `/conversations/${conv.atendida}/attend`, 'ana');

      expect(res.status).toBe(200);
      expect(res.ms).toBeLessThan(3000);
      const attended = await conversation(conv.atendida);
      expect(attended).toMatchObject({ status: ConversationStatus.OPEN, agentId: users.ana.id });
      expect(attended.serviceSlaDueAt!.getTime() - attended.attendedAt!.getTime()).toBe(1_200_000);
      expect(await prisma.auditLog.count({ where: { entityId: conv.atendida, action: 'conversation.attended' } })).toBe(1);
    });

    it('Encerrar responde, com o status e a auditoria do atendimento gravados', async () => {
      expect((await call('POST', `/conversations/${conv.encerrada}/attend`, 'ana')).status).toBe(200);

      const res = await call('PATCH', `/conversations/${conv.encerrada}/status`, 'ana', {
        status: 'CLOSED',
        resolution: 'RESOLVED',
      });

      expect(res.status).toBe(200);
      expect(res.ms).toBeLessThan(3000);
      expect((await conversation(conv.encerrada)).status).toBe(ConversationStatus.CLOSED);
      expect(
        await prisma.auditLog.count({ where: { entityId: conv.encerrada, action: 'conversation.service_closed' } }),
      ).toBe(1);
    });

    it('Transferir de volta para a fila responde, com o ciclo novo gravado', async () => {
      expect((await call('POST', `/conversations/${conv.devolvida}/attend`, 'ana')).status).toBe(200);

      const res = await call('PATCH', `/conversations/${conv.devolvida}/assign`, 'sueli', {});

      expect(res.status).toBe(200);
      expect(res.ms).toBeLessThan(3000);
      const back = await conversation(conv.devolvida);
      expect(back).toMatchObject({ status: ConversationStatus.WAITING, agentId: null, attendedAt: null });
      expect(back.waitSlaDueAt!.getTime() - back.waitingSince!.getTime()).toBe(600_000);
    });

    it('os jobs desses pedidos não chegaram ao Redis: cada falha ficou no log', async () => {
      await app.get(ConversationService).whenSlaSynced(); // cada uma estoura os 2 s

      for (const key of ['proxima', 'atendida', 'encerrada', 'devolvida']) {
        expect(syncFailed(conv[key])).toBe(true);
      }
    });
  });

  describe('Redis de volta: a reconciliação refaz o que faltou', () => {
    beforeAll(async () => {
      proxy.thaw();
      await eventually(async () => (await call('GET', '/health/ready')).status === 200);
      await app.get(ConversationService).whenSlaSynced();
    });

    it('refaz os jobs pelo banco, cada um para o prazo gravado', async () => {
      // Uma rodada inteira sem erro (ela confere as conversas de todas as empresas)
      const summary = await eventually(async () => {
        const result = await app.get(SlaReconciliationService).reconcile();
        return result.failed === 0 && result;
      });
      expect(summary.evaluated).toBeGreaterThanOrEqual(3);

      for (const key of ['proxima', 'atendida']) {
        const job = await inspector.getJob(`service-sla:${conv[key]}`);
        const { serviceSlaDueAt } = await conversation(conv[key]);
        expect(job).toBeTruthy();
        expect(Math.abs(firesAt(job!) - serviceSlaDueAt!.getTime())).toBeLessThan(2000);
      }
      const waitJob = await inspector.getJob(`sla-check:${conv.devolvida}`);
      const { waitSlaDueAt } = await conversation(conv.devolvida);
      expect(Math.abs(firesAt(waitJob!) - waitSlaDueAt!.getTime())).toBeLessThan(2000);
    });

    it('rodar de novo não duplica nem mexe nos jobs válidos', async () => {
      const before = await inspector.getJob(`service-sla:${conv.atendida}`);

      for (const key of ['proxima', 'atendida', 'devolvida']) {
        await expect(app.get(ConversationService).reconcileSla(conv[key])).resolves.toBe('ok');
      }
      const after = await inspector.getJob(`service-sla:${conv.atendida}`);
      expect(after!.timestamp).toBe(before!.timestamp);
    });

    it('a conversa encerrada durante a falha não ganha job: o ciclo antigo não volta', async () => {
      await expect(app.get(ConversationService).reconcileSla(conv.encerrada)).resolves.toBe('skipped');

      expect(await inspector.getJob(`service-sla:${conv.encerrada}`)).toBeNull();
      expect(await inspector.getJob(`sla-check:${conv.encerrada}`)).toBeNull();
    });
  });

  describe('Redis fora do ar (conexão recusada)', () => {
    beforeAll(async () => {
      await proxy.refuse();
    });

    it('rota autenticada responde em menos de 3 s', async () => {
      const res = await call('GET', '/conversations', 'ana');

      expect(res.status).toBe(200);
      expect(res.ms).toBeLessThan(3000);
    });

    it('readiness responde 503 em menos de 4 s', async () => {
      const res = await call('GET', '/health/ready');

      expect(res.status).toBe(503);
      expect(res.ms).toBeLessThan(4000);
    });

    it('Atender responde, com o banco consistente; de volta, a reconciliação refaz o job', async () => {
      const res = await call('POST', `/conversations/${conv.recusada}/attend`, 'ana');

      expect(res.status).toBe(200);
      expect(res.ms).toBeLessThan(3000);
      const attended = await conversation(conv.recusada);
      expect(attended.serviceSlaDueAt).toBeTruthy();
      expect(await prisma.auditLog.count({ where: { entityId: conv.recusada, action: 'conversation.attended' } })).toBe(1);
      await app.get(ConversationService).whenSlaSynced();
      expect(syncFailed(conv.recusada)).toBe(true);

      await proxy.listen(); // a mesma porta de volta
      await eventually(async () => (await call('GET', '/health/ready')).status === 200);

      const job = await eventually(async () => {
        await app.get(ConversationService).reconcileSla(conv.recusada);
        return inspector.getJob(`service-sla:${conv.recusada}`);
      });
      expect(Math.abs(firesAt(job) - attended.serviceSlaDueAt!.getTime())).toBeLessThan(2000);
    });
  });
});
