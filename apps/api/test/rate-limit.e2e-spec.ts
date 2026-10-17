import { Body, Controller, Get, HttpCode, INestApplication, Post } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { RateLimitModule } from '../src/shared/rate-limit/rate-limit.module';
import { webhookInstanceTracker } from '../src/shared/rate-limit/rate-limit-trackers';
import { RedisThrottlerStorage } from '../src/shared/rate-limit/redis-throttler.storage';
import { buildThrottlerOptions } from '../src/shared/rate-limit/throttler-options';
import { resolveTrustProxy } from '../src/shared/rate-limit/trust-proxy';

/**
 * C-04 — Teste E2E do limite de requisições atrás do proxy.
 *
 * Sobe uma aplicação Nest com a MESMA configuração de throttler da API
 * (buildThrottlerOptions + RedisThrottlerStorage + ThrottlerGuard global) e
 * faz requisições HTTP de verdade, simulando o nginx com o cabeçalho
 * X-Forwarded-For. Prova o que o teste unitário não alcança: o `trust proxy`
 * do Express, o script Lua no Redis real e o contador compartilhado entre
 * réplicas.
 *
 * Pré-requisito: Redis rodando em localhost:6379 (`docker compose up -d redis`)
 * e `apps/api/.env` com REDIS_PASSWORD. Roda via `npm run test:e2e`.
 * Cada execução usa IPs, usuários e instâncias aleatórios — os contadores de
 * execuções anteriores (TTL de 60 s) não interferem.
 */
const LIMIT = 3;
const JWT_SECRET = 'segredo-e2e-rate-limit-com-mais-de-32-caracteres';

@Controller('t')
class RateLimitTestController {
  @Throttle({ default: { limit: LIMIT, ttl: 60_000 } })
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Throttle({ default: { limit: LIMIT, ttl: 60_000, getTracker: webhookInstanceTracker } })
  @Post('webhook')
  @HttpCode(200)
  webhook(@Body() _body: unknown) {
    return { received: true };
  }
}

const agent = new http.Agent({ keepAlive: false });

async function bootApp(trustProxy: boolean | number | string): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
      ThrottlerModule.forRootAsync({
        imports: [ConfigModule, RateLimitModule],
        inject: [ConfigService, RedisThrottlerStorage],
        useFactory: (config: ConfigService, storage: RedisThrottlerStorage) =>
          buildThrottlerOptions(
            { get: (k: string) => (k === 'JWT_SECRET' ? JWT_SECRET : config.get(k)) } as ConfigService,
            storage,
          ),
      }),
    ],
    controllers: [RateLimitTestController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address();
  return { app, url: `http://127.0.0.1:${port}` };
}

const randomIp = () =>
  `198.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function hit(url: string, headers: Record<string, string> = {}, body?: unknown): Promise<number> {
  const res = body
    ? await axios.post(url, body, { headers, httpAgent: agent, validateStatus: () => true })
    : await axios.get(url, { headers, httpAgent: agent, validateStatus: () => true });
  return res.status;
}

async function hits(n: number, fn: () => Promise<number>): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(await fn());
  return out;
}

describe('Limite de requisições — E2E (Redis real, atrás de proxy)', () => {
  jest.setTimeout(30000);

  let behindProxy: { app: INestApplication; url: string };
  let replica: { app: INestApplication; url: string };
  let noTrust: { app: INestApplication; url: string };
  const jwt = new JwtService({ secret: JWT_SECRET });

  beforeAll(async () => {
    behindProxy = await bootApp(resolveTrustProxy(undefined, true));
    replica = await bootApp(resolveTrustProxy(undefined, true));
    noTrust = await bootApp(false);
  });

  afterAll(async () => {
    await Promise.all([behindProxy.app.close(), replica.app.close(), noTrust.app.close()]);
  });

  it('com trust proxy, cada cliente atrás do nginx tem a própria cota', async () => {
    const a = randomIp();
    const b = randomIp();
    const statusA = await hits(LIMIT + 1, () =>
      hit(`${behindProxy.url}/t/ping`, { 'x-forwarded-for': a }),
    );
    const statusB = await hit(`${behindProxy.url}/t/ping`, { 'x-forwarded-for': b });

    expect(statusA).toEqual([200, 200, 200, 429]);
    expect(statusB).toBe(200);
  });

  it('sem trust proxy (o defeito do C-04), clientes diferentes dividem uma cota só', async () => {
    // Todos chegam do mesmo socket (127.0.0.1, como o nginx) — o cabeçalho é ignorado.
    // A cota é a mesma de execuções anteriores deste teste, então basta passar do limite.
    await hits(LIMIT, () => hit(`${noTrust.url}/t/ping`, { 'x-forwarded-for': randomIp() }));
    const outroCliente = await hit(`${noTrust.url}/t/ping`, { 'x-forwarded-for': randomIp() });

    expect(outroCliente).toBe(429);
  });

  it('usuários autenticados atrás do mesmo IP têm cotas separadas', async () => {
    const ip = randomIp();
    const t1 = jwt.sign({ sub: `u-${randomUUID()}` });
    const t2 = jwt.sign({ sub: `u-${randomUUID()}` });
    const s1 = await hits(LIMIT + 1, () =>
      hit(`${behindProxy.url}/t/ping`, { 'x-forwarded-for': ip, authorization: `Bearer ${t1}` }),
    );
    const s2 = await hit(`${behindProxy.url}/t/ping`, {
      'x-forwarded-for': ip,
      authorization: `Bearer ${t2}`,
    });

    expect(s1).toEqual([200, 200, 200, 429]);
    expect(s2).toBe(200);
  });

  it('webhook: cada instância de WhatsApp tem a própria cota', async () => {
    const instA = `inst-${randomUUID()}`;
    const instB = `inst-${randomUUID()}`;
    const sA = await hits(LIMIT + 1, () =>
      hit(`${behindProxy.url}/t/webhook`, {}, { instance: instA }),
    );
    const sB = await hit(`${behindProxy.url}/t/webhook`, {}, { instance: instB });

    expect(sA).toEqual([200, 200, 200, 429]);
    expect(sB).toBe(200);
  });

  it('duas réplicas da API compartilham o contador (Redis)', async () => {
    const ip = randomIp();
    const statuses = [
      await hit(`${behindProxy.url}/t/ping`, { 'x-forwarded-for': ip }),
      await hit(`${replica.url}/t/ping`, { 'x-forwarded-for': ip }),
      await hit(`${behindProxy.url}/t/ping`, { 'x-forwarded-for': ip }),
      await hit(`${replica.url}/t/ping`, { 'x-forwarded-for': ip }),
    ];

    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('a resposta 429 informa quando tentar de novo', async () => {
    const ip = randomIp();
    await hits(LIMIT, () => hit(`${behindProxy.url}/t/ping`, { 'x-forwarded-for': ip }));
    const res = await axios.get(`${behindProxy.url}/t/ping`, {
      headers: { 'x-forwarded-for': ip },
      httpAgent: agent,
      validateStatus: () => true,
    });

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
