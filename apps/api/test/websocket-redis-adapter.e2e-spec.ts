import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { io, Socket } from 'socket.io-client';
import { Role } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { EventsGateway } from '../src/modules/events/events.gateway';
import { EventsService } from '../src/modules/events/events.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { RedisIoAdapter } from '../src/shared/websocket/redis-io.adapter';

/**
 * B-86 (ioredis 6) — Socket.IO entre réplicas, pelo adapter do Redis.
 *
 * O RedisIoAdapter só é ligado no main.ts, e nenhum teste passava por ele: com
 * uma réplica só, o tempo real funciona mesmo com o pub/sub quebrado. Aqui duas
 * instâncias da API dividem o Redis, como duas réplicas em produção, e o socket
 * conectado na A precisa ser alcançado pelo que a B faz: evento da empresa,
 * contagem de conectados (B-80) e queda da sessão (B-74).
 */
describe('Socket.IO entre réplicas — adapter do Redis (E2E)', () => {
  jest.setTimeout(60000);

  const run = randomUUID().slice(0, 8);
  const apps: INestApplication[] = [];
  const sockets: Socket[] = [];
  let a: INestApplication;
  let b: INestApplication;
  let prisma: PrismaService;
  let companyId: string;

  // Como o main.ts: o adapter conecta no Redis antes do listen
  const boot = async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    const adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis();
    app.useWebSocketAdapter(adapter);
    await app.listen(0, '127.0.0.1');
    apps.push(app);
    return app;
  };

  const nextEvent = <T>(socket: Socket, event: string, ms = 5000): Promise<T | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    a = await boot();
    b = await boot();
    prisma = a.get(PrismaService);
    companyId = (
      await prisma.company.create({ data: { name: 'E2E B-86 Redis', slug: `e2e-b86-redis-${run}` } })
    ).id;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    for (const app of apps) await app.close();
  });

  it('o socket conectado na réplica A recebe o evento, entra na contagem e cai pelo que a réplica B faz', async () => {
    const user = await prisma.user.create({
      data: { companyId, name: 'Ana', email: `b86-redis-${run}@e2e.test`, passwordHash: 'x', role: Role.AGENT },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
    const { accessToken } = await a.get(AuthService).login(user);

    const socket = io(`http://127.0.0.1:${a.getHttpServer().address().port}/ws`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    expect(await nextEvent(socket, 'connected')).not.toBeNull();

    // Evento da empresa emitido na B chega ao socket da A pelo pub/sub
    const status = nextEvent<{ sessionName: string }>(socket, 'connection.status');
    b.get(EventsService).emitConnectionStatus({
      companyId,
      connectionId: 'c-b86',
      sessionName: `b86-${run}`,
      status: 'open',
    });
    expect(await status).toEqual(expect.objectContaining({ sessionName: `b86-${run}` }));

    // Contagem pelo adapter (B-80): a B, sem nenhum socket próprio, enxerga o da A
    expect(await b.get(EventsGateway).getConnectedCount()).toBeGreaterThanOrEqual(1);

    // Queda da sessão pedida na B derruba o socket da A (B-74)
    const reason = nextEvent<string>(socket, 'disconnect');
    b.get(EventsService).disconnectUser(user.id);
    expect(await reason).toBe('io server disconnect');
  });
});
