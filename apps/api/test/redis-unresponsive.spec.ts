import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Bull from 'bull';
import { createRequire } from 'module';
import * as net from 'net';
import { TokenBlacklistService } from '../src/modules/auth/token-blacklist.service';
import { AutoAttendanceSessionService } from '../src/modules/auto-attendance/auto-attendance-session.service';
import { createSlaRequestQueue } from '../src/modules/conversation/sla-request-queue';
import { HealthService } from '../src/modules/health/health.service';
import { createSharedRedisClient } from '../src/shared/redis/redis.module';

/**
 * B-107 — os prazos com clientes de verdade (o ioredis 6 da API e o 5 do Bull)
 * contra um servidor que fala o protocolo do Redis só o bastante para o
 * handshake e os comandos daqui. `muted` faz ele aceitar a conexão e parar de
 * responder: o Redis "travado", que antes segurava os comandos para sempre.
 * Unitário (roda no `npm test`), sem Redis nem banco: tudo em 127.0.0.1.
 */
class FakeRedis {
  muted = false;
  port = 0;
  readonly commands: string[] = [];
  private readonly store = new Map<string, string>();
  private readonly sockets = new Set<net.Socket>();
  private readonly server = net.createServer((socket) => this.serve(socket));

  async start(muted = false) {
    this.muted = muted;
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as net.AddressInfo).port;
  }

  async stop() {
    for (const socket of this.sockets) socket.destroy();
    await new Promise((resolve) => this.server.close(resolve));
  }

  private serve(socket: net.Socket) {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => undefined);
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (let parsed = parse(buffer); parsed; parsed = parse(buffer)) {
        buffer = buffer.subarray(parsed.consumed);
        this.commands.push(parsed.args[0].toUpperCase());
        if (!this.muted) socket.write(this.reply(parsed.args));
      }
    });
  }

  private reply([name, ...args]: string[]): string {
    switch (name.toUpperCase()) {
      case 'HELLO':
        return `%3\r\n${bulk('server')}${bulk('redis')}${bulk('version')}${bulk('7.2.4')}${bulk('proto')}:3\r\n`;
      case 'INFO':
        return bulk('# Server\r\nredis_version:7.2.4\r\nredis_mode:standalone\r\n');
      case 'PING':
        return '+PONG\r\n';
      case 'CLIENT':
      case 'SELECT':
      case 'QUIT':
        return '+OK\r\n';
      case 'SETEX':
        this.store.set(args[0], args[2]);
        return '+OK\r\n';
      case 'GET':
        return this.store.has(args[0]) ? bulk(this.store.get(args[0])!) : '_\r\n';
      case 'EXISTS':
        return `:${args.filter((key) => this.store.has(key)).length}\r\n`;
      case 'DEL':
        return `:${args.filter((key) => this.store.delete(key)).length}\r\n`;
      default:
        return '-ERR comando fora deste servidor de teste\r\n';
    }
  }
}

function bulk(text: string) {
  return `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
}

// Um comando do cliente (array de bulk strings) ou null se ainda está incompleto
function parse(buffer: Buffer): { args: string[]; consumed: number } | null {
  if (buffer.length === 0 || buffer[0] !== 0x2a) return null; // '*'
  const header = buffer.indexOf('\r\n');
  if (header < 0) return null;
  const count = Number(buffer.subarray(1, header).toString());
  let offset = header + 2;
  const args: string[] = [];
  for (let i = 0; i < count; i++) {
    if (buffer[offset] !== 0x24) return null; // '$'
    const end = buffer.indexOf('\r\n', offset);
    if (end < 0) return null;
    const length = Number(buffer.subarray(offset + 1, end).toString());
    if (buffer.length < end + 2 + length + 2) return null;
    args.push(buffer.subarray(end + 2, end + 2 + length).toString());
    offset = end + 2 + length + 2;
  }
  return { args, consumed: offset };
}

type Outcome<T> = { value?: T; error?: Error; ms: number };
async function timed<T>(promise: Promise<T>): Promise<Outcome<T>> {
  const started = Date.now();
  const outcome = await promise.then(
    (value) => ({ value }),
    (error: Error) => ({ error }),
  );
  return { ...outcome, ms: Date.now() - started };
}

const settlesWithin = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);

const configFor = (port: number) =>
  ({
    get: (key: string, fallback?: unknown) => ({ REDIS_HOST: '127.0.0.1', REDIS_PORT: port })[key] ?? fallback,
  }) as unknown as ConfigService;

// A conexão bloqueante e a de eventos existem no Bull, mas não nos tipos dele
const connectionsOf = (queue: Bull.Queue) =>
  queue as unknown as { bclient: Bull.Queue['client']; eclient: Bull.Queue['client'] };

const ready = (client: { status: string; once: (event: 'ready', cb: () => void) => unknown }) =>
  client.status === 'ready' ? Promise.resolve() : new Promise<void>((resolve) => client.once('ready', resolve));

async function freePort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as net.AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port; // fechada: conexão recusada
}

describe('B-107 — Redis que aceita a conexão e não responde', () => {
  jest.setTimeout(20000);
  let fake: FakeRedis;

  beforeEach(async () => {
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
    fake = new FakeRedis();
  });

  afterEach(async () => {
    await fake.stop().catch(() => undefined);
    jest.restoreAllMocks();
  });

  describe('cliente compartilhado (prazo de 500 ms)', () => {
    it('Redis saudável: blacklist e sessão do auto-atendimento funcionam como antes', async () => {
      await fake.start();
      const client = createSharedRedisClient(configFor(fake.port));
      try {
        await ready(client);
        expect(client.options).toMatchObject({ commandTimeout: 500, maxRetriesPerRequest: 3 });

        const blacklist = new TokenBlacklistService(client);
        await blacklist.add('token-revogado', 60);
        expect(await blacklist.isBlacklisted('token-revogado')).toBe(true);
        expect(await blacklist.isBlacklisted('token-valido')).toBe(false);

        const session = new AutoAttendanceSessionService(client);
        await session.setAwaitingMenuReply('conv-1');
        expect(await session.isAwaitingMenuReply('conv-1')).toBe(true);
        await session.clear('conv-1');
        expect(await session.isAwaitingMenuReply('conv-1')).toBe(false);
      } finally {
        client.disconnect();
      }
    });

    it('travado: cada comando falha em ~500 ms e cada consumidor aplica a sua política', async () => {
      await fake.start();
      const client = createSharedRedisClient(configFor(fake.port));
      try {
        await ready(client);
        fake.muted = true;
        const blacklist = new TokenBlacklistService(client);
        const session = new AutoAttendanceSessionService(client);

        const [exists, isBlacklisted, revoke, awaiting, signupQuota, avatarLock] = await Promise.all([
          timed(client.exists('qualquer')),
          // rota autenticada, handshake do WebSocket: fail-open documentado
          timed(blacklist.isBlacklisted('token')),
          // logout: a revogação falha com log (o token vale até expirar)
          timed(blacklist.add('token', 60)),
          // robô: sem sessão, a mensagem vai para a fila normal
          timed(session.isAwaitingMenuReply('conv-1')),
          // teto de cadastro (MULTI INCR + EXPIRE) e trava da foto (SET NX PX)
          timed(client.multi().incr('signup').expire('signup', 60).exec()),
          timed(client.set('avatar:lock', '1', 'PX', 1000, 'NX')),
        ]);

        expect(exists.error?.message).toMatch(/Command timed out/);
        expect(exists.ms).toBeGreaterThanOrEqual(400);
        expect(isBlacklisted).toMatchObject({ value: false });
        expect(revoke.error).toBeUndefined();
        expect(awaiting).toMatchObject({ value: false });
        expect(signupQuota.error).toBeDefined();
        expect(avatarLock.error).toBeDefined();
        for (const outcome of [exists, isBlacklisted, revoke, awaiting, signupQuota, avatarLock]) {
          expect(outcome.ms).toBeLessThan(1500);
        }
      } finally {
        client.disconnect();
      }
    });

    it('fora do ar (conexão recusada): o comando falha em menos de 1,5 s', async () => {
      const client = createSharedRedisClient(configFor(await freePort()));
      try {
        const exists = await timed(client.exists('qualquer'));
        expect(exists.error).toBeDefined();
        expect(exists.ms).toBeLessThan(1500);
      } finally {
        client.disconnect();
      }
    });
  });

  describe('readiness (prazo de 2 s na checagem do Redis)', () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const storage = { ping: jest.fn() };
    const healthFor = (port: number) => new HealthService(prisma as any, configFor(port), storage as any);

    it('travado com a conexão aberta: redis down em ~2 s, banco checado à parte', async () => {
      await fake.start();
      const health = healthFor(fake.port);
      try {
        expect(await health.checkReadiness()).toEqual({ ready: true, checks: { database: 'up', redis: 'up' } });

        fake.muted = true;
        const result = await timed(health.checkReadiness());

        expect(result.value).toEqual({ ready: false, checks: { database: 'up', redis: 'down' } });
        expect(result.ms).toBeGreaterThanOrEqual(1500);
        expect(result.ms).toBeLessThan(3500);
      } finally {
        await health.onModuleDestroy();
      }
    });

    it('conexão nova com um Redis mudo desde o início: down em ~2 s', async () => {
      await fake.start(true);
      const health = healthFor(fake.port);
      try {
        const result = await timed(health.checkReadiness());

        expect(result.value?.checks.redis).toBe('down');
        expect(result.ms).toBeLessThan(3500);
      } finally {
        await health.onModuleDestroy();
      }
    });
  });

  describe('produtor do SLA dos pedidos do painel (prazo de 2 s)', () => {
    // Mesmo formato do BullModule.forRootAsync (app.module.ts)
    const sharedFor = (port: number) => ({ redis: { host: '127.0.0.1', port, keyPrefix: 'bull:' } });

    it('travado: agendar e consultar o job falham em ~2 s', async () => {
      await fake.start();
      const queue = createSlaRequestQueue(sharedFor(fake.port));
      try {
        await ready(queue.client);
        fake.muted = true;

        const [add, getJob] = await Promise.all([
          timed(queue.add({ conversationId: 'conv-1' } as any, { jobId: 'sla-check:conv-1', delay: 1000 })),
          timed(queue.getJob('service-sla:conv-1')),
        ]);

        for (const outcome of [add, getJob]) {
          expect(outcome.error?.message).toMatch(/Command timed out/);
          expect(outcome.ms).toBeGreaterThanOrEqual(1500);
          expect(outcome.ms).toBeLessThan(3500);
        }
      } finally {
        await (queue as unknown as { onApplicationShutdown: () => Promise<void> }).onApplicationShutdown();
      }
    });

    it('só a conexão de comandos ganha o prazo, e com o ioredis do próprio Bull', async () => {
      await fake.start();
      const queue = createSlaRequestQueue(sharedFor(fake.port));
      try {
        const BullRedis = createRequire(require.resolve('bull'))('ioredis');
        expect(queue.client).toBeInstanceOf(BullRedis);
        expect(queue.client.options).toMatchObject({ commandTimeout: 2000, enableReadyCheck: false });
        // A bloqueante e a de eventos ficam como o Bull as cria (esta instância
        // nem chega a usá-las: não processa jobs nem escuta eventos)
        const { bclient, eclient } = connectionsOf(queue);
        for (const client of [bclient, eclient]) {
          expect(client.options.commandTimeout).toBeUndefined();
          expect(client.options.maxRetriesPerRequest).toBeNull();
        }
      } finally {
        await (queue as unknown as { onApplicationShutdown: () => Promise<void> }).onApplicationShutdown();
      }
    });

    it('a fila do BullModule (processor, robô e webhook) não muda: o mesmo comando segue esperando', async () => {
      await fake.start();
      const queue = new Bull('sla-check', sharedFor(fake.port));
      try {
        await ready(queue.client);
        fake.muted = true;

        const getJob = queue.getJob('service-sla:conv-1');
        expect(await settlesWithin(getJob, 2500)).toBe(false);
        expect(queue.client.options.commandTimeout).toBeUndefined();
        getJob.catch(() => undefined); // cai no close abaixo
      } finally {
        await queue.close();
      }
    });

    it('desligar com o Redis mudo não fica pendurado', async () => {
      await fake.start();
      const queue = createSlaRequestQueue(sharedFor(fake.port));
      await ready(queue.client);
      void connectionsOf(queue).bclient; // abre também a conexão bloqueante
      fake.muted = true;

      const shutdown = await timed(
        (queue as unknown as { onApplicationShutdown: () => Promise<void> }).onApplicationShutdown(),
      );

      expect(shutdown.error).toBeUndefined();
      expect(shutdown.ms).toBeLessThan(3000);
    });
  });
});
