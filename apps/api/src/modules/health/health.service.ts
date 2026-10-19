import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import axios from 'axios';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { StorageService } from '../../shared/storage/storage.service';

export type DependencyStatus = 'up' | 'down';

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
}

export interface DependencyCheck {
  status: DependencyStatus;
  latencyMs: number;
  error?: string;
}

// B-102 (L-16): tempo máximo de cada checagem do diagnóstico
const DIAGNOSTIC_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`sem resposta em ${ms} ms`)), ms).unref?.()),
  ]);
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
    private readonly storage: StorageService,
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

  // ── Diagnóstico de dependências (B-102 / L-16) ───────────────────────────
  // Fora do readiness de propósito: storage ou Evolution fora do ar degradam
  // mídia e WhatsApp, mas a API segue atendendo o painel — tirar a instância
  // do balanceador por isso seria pior. Aqui é só para o ADMIN ver o estado.
  async checkDependencies(): Promise<Record<string, DependencyCheck>> {
    const evolutionUrl = this.config.get<string>('EVOLUTION_API_URL', 'http://localhost:8080');
    const probes: Record<string, () => Promise<unknown>> = {
      database: () => this.prisma.$queryRaw`SELECT 1`,
      redis: async () => {
        if (this.redis.status === 'end' || this.redis.status === 'close' || this.redis.status === 'wait') {
          await this.redis.connect();
        }
        return this.redis.ping();
      },
      storage: () => this.storage.ping(),
      evolution: () => axios.get(evolutionUrl, { timeout: DIAGNOSTIC_TIMEOUT_MS }),
    };

    const entries = await Promise.all(
      Object.entries(probes).map(async ([name, probe]) => {
        const started = Date.now();
        try {
          await withTimeout(probe(), DIAGNOSTIC_TIMEOUT_MS);
          return [name, { status: 'up' as const, latencyMs: Date.now() - started }] as const;
        } catch (err: any) {
          return [name, { status: 'down' as const, latencyMs: Date.now() - started, error: err.message }] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
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
