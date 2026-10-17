import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { createUserOrIpTracker } from './rate-limit-trackers';

/**
 * C-04 — opções do `ThrottlerModule`, extraídas do app.module.ts para que o
 * teste e2e (test/rate-limit.e2e-spec.ts) suba exatamente a mesma
 * configuração da API: limite global por usuário autenticado ou por IP, com
 * o contador no Redis.
 */
export function buildThrottlerOptions(
  config: ConfigService,
  storage: ThrottlerStorage,
): ThrottlerModuleOptions {
  const jwt = new JwtService({ secret: config.get<string>('JWT_SECRET') });
  return {
    throttlers: [
      {
        ttl: Number(config.get('THROTTLE_TTL') ?? 60) * 1000,
        limit: Number(config.get('THROTTLE_LIMIT') ?? 100),
      },
    ],
    getTracker: createUserOrIpTracker(jwt),
    storage,
  };
}
