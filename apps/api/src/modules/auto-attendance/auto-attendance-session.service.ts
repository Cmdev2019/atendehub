import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../shared/redis/redis.module';

// Estado efêmero de "onde o contato está no auto-atendimento agora", por
// conversa — não vira tabela no Postgres de propósito (ver
// ROADMAP_ESTABILIZACAO.md B-35): é descartável, dura no máximo o timeout de
// inatividade, e o TTL do Redis cuida da limpeza sozinho. Cliente Redis
// compartilhado (RedisModule, B-80).
const SESSION_TTL_SECS = 24 * 60 * 60; // teto de segurança bem acima de qualquer timeout configurável

@Injectable()
export class AutoAttendanceSessionService {
  private readonly logger = new Logger(AutoAttendanceSessionService.name);
  private readonly keyPrefix = 'auto-attendance:session:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(conversationId: string) {
    return this.keyPrefix + conversationId;
  }

  async setAwaitingMenuReply(conversationId: string): Promise<void> {
    try {
      await this.redis.setex(this.key(conversationId), SESSION_TTL_SECS, 'AWAITING_MENU_REPLY');
    } catch (err: any) {
      this.logger.error(`Falha ao gravar sessão de auto-atendimento: ${err.message}`);
    }
  }

  async isAwaitingMenuReply(conversationId: string): Promise<boolean> {
    try {
      const value = await this.redis.get(this.key(conversationId));
      return value === 'AWAITING_MENU_REPLY';
    } catch (err: any) {
      this.logger.error(`Falha ao ler sessão de auto-atendimento: ${err.message}. Assumindo sem sessão ativa.`);
      // Fail-closed nesse sentido específico: se o Redis cair, o contato passa
      // a falar com fila normal (WAITING) em vez de ficar preso interpretando
      // qualquer mensagem futura como resposta de menu perdida no limbo.
      return false;
    }
  }

  async clear(conversationId: string): Promise<void> {
    try {
      await this.redis.del(this.key(conversationId));
    } catch (err: any) {
      this.logger.error(`Falha ao limpar sessão de auto-atendimento: ${err.message}`);
    }
  }
}
