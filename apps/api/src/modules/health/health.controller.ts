import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';

/**
 * GET /api/v1/health
 *
 * Liveness check público e leve — usado pelo frontend para detectar se o
 * backend está disponível e por orquestradores (Docker/nginx) como healthcheck.
 * Não toca em dependências (DB/Redis); readiness com dependências é escopo
 * do item F6-3 do roadmap.
 */
@Controller('health')
export class HealthController {
  @Public()
  @SkipThrottle()
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    };
  }
}
