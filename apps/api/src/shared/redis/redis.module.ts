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

@Injectable()
class RedisClientLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('RedisClient');
        const redis = new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          maxRetriesPerRequest: 3,
        });
        redis.on('error', (err) => logger.error(`Redis error: ${err.message}`));
        redis.on('ready', () => logger.log('Cliente Redis compartilhado conectado'));
        return redis;
      },
    },
    RedisClientLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
