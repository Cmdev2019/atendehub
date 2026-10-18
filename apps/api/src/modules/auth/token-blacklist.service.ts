import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../shared/redis/redis.module';

/**
 * Serviço de blacklist de access tokens usando Redis.
 *
 * Quando um access token é revogado (logout explícito, mudança de senha, etc.),
 * ele é adicionado à blacklist. O JwtStrategy verifica a blacklist antes de
 * validar o token.
 *
 * O Redis gerencia automaticamente a expiração usando TTL — tokens expirados
 * naturalmente são removidos da blacklist, economizando memória.
 *
 * B-80: usa o cliente Redis compartilhado (RedisModule) em vez de abrir o
 * próprio.
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly keyPrefix = 'blacklist:token:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Adiciona um access token à blacklist.
   *
   * @param token - O JWT access token completo
   * @param expiresInSeconds - Tempo de vida restante do token (em segundos)
   *
   * O TTL é definido com base no tempo de expiração original do token.
   * Quando o token expirar naturalmente, o Redis o remove automaticamente.
   */
  async add(token: string, expiresInSeconds: number): Promise<void> {
    const key = this.keyPrefix + token;

    try {
      // Armazena "1" como valor (o valor não importa, só a existência da key)
      // TTL definido para o tempo restante até a expiração natural do token
      await this.redis.setex(key, expiresInSeconds, '1');

      this.logger.debug(
        `Token adicionado à blacklist (TTL: ${expiresInSeconds}s)`,
      );
    } catch (err: any) {
      this.logger.error(
        `Falha ao adicionar token à blacklist: ${err.message}`,
      );
      // Não propaga o erro — se a blacklist falhar, o token expirará naturalmente
    }
  }

  /**
   * Verifica se um access token está na blacklist.
   *
   * @param token - O JWT access token completo
   * @returns true se o token está revogado, false caso contrário
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const key = this.keyPrefix + token;

    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (err: any) {
      this.logger.error(
        `Falha ao verificar blacklist: ${err.message}. Assumindo token válido (fail-open).`,
      );
      // Fail-open: se o Redis estiver indisponível, assume que o token é válido
      // para não bloquear usuários legítimos. O token ainda expirará naturalmente.
      return false;
    }
  }

  /**
   * Remove um token da blacklist manualmente (raro, usado em testes).
   */
  async remove(token: string): Promise<void> {
    const key = this.keyPrefix + token;

    try {
      await this.redis.del(key);
    } catch (err: any) {
      this.logger.error(`Falha ao remover token da blacklist: ${err.message}`);
    }
  }

  /**
   * Retorna o número de tokens atualmente na blacklist (para monitoramento).
   */
  async count(): Promise<number> {
    try {
      const keys = await this.redis.keys(this.keyPrefix + '*');
      return keys.length;
    } catch (err: any) {
      this.logger.error(`Falha ao contar tokens na blacklist: ${err.message}`);
      return 0;
    }
  }
}
