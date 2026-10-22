import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// ── B-80 (M-27 / B-46): cliente Redis compartilhado ─────────────────────────
// Para estado simples por chave com TTL (blacklist de tokens, sessão do
// auto-atendimento, throttle de foto de perfil). Antes cada serviço abria o
// seu cliente com a mesma configuração (ADR-0014 adiou a consolidação para
// este item). Continuam com cliente próprio, por terem necessidades
// diferentes: o Bull, o adapter do Socket.IO (pub/sub), o rate limit (sem
// fila offline) e o health check.
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

// B-107: prazo de cada comando. Com o Redis aceitando a conexão sem responder,
// o comando ficava pendurado para sempre e a política de falha de cada
// consumidor (fail-open da blacklist, "sem sessão" no auto-atendimento, sem
// foto, sem teto de cadastro) nunca chegava a valer — toda rota autenticada
// esperava junto. Com o prazo, o comando falha em 500 ms e cada um aplica a
// sua. Com o Redis saudável, os comandos daqui respondem em poucos ms.
export const SHARED_REDIS_COMMAND_TIMEOUT_MS = 500;

export function createSharedRedisClient(config: ConfigService): Redis {
  const logger = new Logger('RedisClient');
  const redis = new Redis({
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: config.get<string>('REDIS_PASSWORD'),
    maxRetriesPerRequest: 3,
    commandTimeout: SHARED_REDIS_COMMAND_TIMEOUT_MS,
  });
  redis.on('error', (err) => logger.error(`Redis error: ${err.message}`));
  redis.on('ready', () => logger.log('Cliente Redis compartilhado conectado'));
  return redis;
}

@Injectable()
class RedisClientLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // B-107: com o Redis mudo, o QUIT estoura o prazo — aí a conexão é derrubada
  async onModuleDestroy() {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: createSharedRedisClient,
    },
    RedisClientLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
