import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // GET /api/v1/health
  // Liveness check público e leve — usado pelo frontend para detectar se o
  // backend está disponível e por orquestradores (Docker/nginx) como healthcheck.
  // Não toca em dependências (DB/Redis) — isso é o /health/ready abaixo.
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

  // GET /api/v1/health/ready
  // Readiness — confirma que PostgreSQL e Redis respondem, não só que o
  // processo Node está de pé. Para orquestração/nginx decidirem se a
  // instância deve receber tráfego.
  @Public()
  @SkipThrottle()
  @Get('ready')
  async ready() {
    const result = await this.healthService.checkReadiness();
    const body = {
      status: result.ready ? 'ok' : 'unavailable',
      checks: result.checks,
      timestamp: new Date().toISOString(),
    };

    // Status HTTP real (não só o campo `status` no corpo) — é o que
    // orquestradores/nginx de fato inspecionam para decidir tráfego.
    if (!result.ready) {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }

  // GET /api/v1/health/dependencies (B-102 / L-16) — requer ADMIN
  // Estado de cada dependência (banco, Redis, storage, Evolution) com o tempo
  // de resposta. Sempre 200: é diagnóstico, não decide tráfego.
  @Roles(Role.ADMIN)
  @Get('dependencies')
  async dependencies() {
    return { checks: await this.healthService.checkDependencies(), timestamp: new Date().toISOString() };
  }
}
