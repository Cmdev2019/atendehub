import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../shared/prisma/prisma.service';

export type DependencyStatus = 'up' | 'down';

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
}

// Cliente Redis dedicado e leve, só para o ping de readiness — não compartilha
// conexão com o Bull nem com o TokenBlacklistService (mesmo padrão dos dois:
// cada consumidor de Redis no projeto cria seu próprio client).
@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD'),
      maxRetriesPerRequest: 1,
      // Readiness precisa responder rápido — não fica tentando reconectar
      // indefinidamente nem deixando a requisição pendurada.
      connectTimeout: 2000,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    this.redis.on('error', () => {
      // Silencioso de propósito: o ping abaixo já reporta o estado; sem este
      // handler, erros de conexão em background derrubariam o processo
      // (comportamento padrão do EventEmitter sem listener de 'error').
    });
  }

  async checkReadiness(): Promise<ReadinessResult> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return {
      ready: database === 'up' && redis === 'up',
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (err: any) {
      this.logger.warn(`Readiness: PostgreSQL indisponível — ${err.message}`);
      return 'down';
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      if (this.redis.status === 'end' || this.redis.status === 'close') {
        await this.redis.connect();
      }
      await this.redis.ping();
      return 'up';
    } catch (err: any) {
      this.logger.warn(`Readiness: Redis indisponível — ${err.message}`);
      return 'down';
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
