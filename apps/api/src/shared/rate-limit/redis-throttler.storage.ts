import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

/** Mesmo formato do `ThrottlerStorageRecord` do @nestjs/throttler (tempos em segundos). */
export interface ThrottlerStorageResult {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

// Janela fixa, atômica no Redis. KEYS[1] = contador, KEYS[2] = bloqueio;
// ARGV = ttl, limite e duração do bloqueio (ms). Retorna
// {hits, msAtéFimDaJanela, bloqueado (0/1), msAtéFimDoBloqueio}.
// Ao bloquear, o contador é apagado: passado o bloqueio, começa uma janela
// nova — mesmo comportamento do armazenamento em memória do @nestjs/throttler.
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  return {tonumber(ARGV[2]) + 1, blockTtl, 1, blockTtl}
end
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

/**
 * C-04 — contador do limite de requisições no Redis, compartilhado entre
 * réplicas da API. O armazenamento padrão do @nestjs/throttler fica na
 * memória do processo: com duas réplicas, cada uma contaria metade e o
 * limite efetivo dobraria (ver também B-46).
 *
 * Fail-open: se o Redis falhar, a requisição passa (com log) em vez de
 * derrubar a API inteira com 500 — o nginx (B-43) continua limitando por IP.
 * `enableOfflineQueue: false` + `commandTimeout` fazem a falha ser imediata em
 * vez de segurar a requisição esperando o Redis voltar. Por isso o boot espera
 * a primeira conexão (até 3 s): sem isso, as primeiras requisições depois de
 * subir a API passariam sem limite.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;
  private readonly keyPrefix = 'throttle:';
  private lastFailureLogAt = 0;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD'),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 500,
    });

    this.redis.on('error', (err) => this.logFailure(err));
  }

  private initPromise?: Promise<void>;

  // A mesma instância é provider do RateLimitModule e storage do
  // ThrottlerModule, então o Nest chama este hook duas vezes — a espera (e o
  // aviso) acontece uma vez só.
  onModuleInit(): Promise<void> {
    this.initPromise ??= this.waitForConnection();
    return this.initPromise;
  }

  private async waitForConnection(): Promise<void> {
    if (this.redis.status === 'ready') return;
    const ready = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      this.redis.once('ready', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    if (!ready) {
      this.logger.warn(
        'Redis não respondeu em 3 s no boot — o limite de requisições fica liberado até a conexão subir.',
      );
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageResult> {
    try {
      const [hits, msToExpire, blocked, msToBlockExpire] = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        `${this.keyPrefix}${key}:hits`,
        `${this.keyPrefix}${key}:block`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

      return {
        totalHits: hits,
        timeToExpire: Math.ceil(msToExpire / 1000),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.ceil(msToBlockExpire / 1000),
      };
    } catch (err) {
      this.logFailure(err as Error);
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }

  // No máximo um log por minuto: com o Redis fora, toda requisição falharia
  // aqui e o log viraria ruído.
  private logFailure(err: Error): void {
    const now = Date.now();
    if (now - this.lastFailureLogAt < 60_000) return;
    this.lastFailureLogAt = now;
    this.logger.error(
      `Redis indisponível para o limite de requisições — liberando sem limite até voltar: ${err.message}`,
    );
  }
}
