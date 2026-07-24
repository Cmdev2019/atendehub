import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma/prisma.service';

// ── Housekeeping: remove refresh tokens já inutilizáveis (expirados ou
// revogados) — nunca toca em tokens válidos/ativos. Sem isso a tabela só
// cresce (achado em 2026-07-21: usuário admin com 42 tokens, 30 ainda
// válidos, zero linhas removidas desde sempre).
@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup(): Promise<void> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    if (count > 0) {
      this.logger.log(`Limpeza de refresh tokens: ${count} removido(s)`);
    }
  }
}
