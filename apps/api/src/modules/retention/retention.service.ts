import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma/prisma.service';

// ── B-101 (L-15): retenção de dados operacionais ────────────────────────────
// Sem política nenhuma, `notifications` e `audit_logs` só cresciam.
// - Notificações JÁ LIDAS expiram em NOTIFICATION_RETENTION_DAYS (padrão 90):
//   dado operacional, sem valor depois de visto.
// - Auditoria só é purgada se AUDIT_LOG_RETENTION_DAYS estiver definido: o
//   prazo é decisão de LGPD do responsável (em espera, mapa de dados
//   pessoais), então o padrão é guardar.
// - Conversas e mensagens não são apagadas aqui (mesmo motivo); a
//   anonimização por contato continua sendo o caminho (B-62).
// 0 ou vazio desliga a purga daquele tipo.
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private days(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purge(now = new Date()): Promise<{ notifications: number; auditLogs: number }> {
    const notificationDays = this.days('NOTIFICATION_RETENTION_DAYS', 90);
    const auditDays = this.days('AUDIT_LOG_RETENTION_DAYS', 0);

    const notifications = notificationDays
      ? (
          await this.prisma.notification.deleteMany({
            where: { readAt: { not: null, lt: new Date(now.getTime() - notificationDays * DAY_MS) } },
          })
        ).count
      : 0;

    const auditLogs = auditDays
      ? (
          await this.prisma.auditLog.deleteMany({
            where: { createdAt: { lt: new Date(now.getTime() - auditDays * DAY_MS) } },
          })
        ).count
      : 0;

    if (notifications || auditLogs) {
      this.logger.log(`Retenção: ${notifications} notificação(ões) lida(s) e ${auditLogs} registro(s) de auditoria removidos`);
    }
    return { notifications, auditLogs };
  }
}
