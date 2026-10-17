import { JwtService } from '@nestjs/jwt';
import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler';

/**
 * C-04 — de quem é cada requisição para o limite de requisições.
 *
 * O `ThrottlerGuard` é global e roda ANTES do `JwtAuthGuard` das rotas, então
 * `req.user` ainda não existe quando o tracker é calculado. Por isso o token
 * é verificado aqui (só a assinatura, sem banco nem blacklist — basta para
 * saber de quem é a cota; quem barra token revogado continua sendo o
 * `JwtStrategy`).
 *
 *   - token válido → `user:<id>`: cada usuário tem a própria cota, mesmo com
 *     um escritório inteiro saindo pelo mesmo IP;
 *   - sem token ou token inválido → `ip:<req.ip>` (login, cadastro, rotas
 *     públicas). `req.ip` só é o IP do cliente com `trust proxy` configurado
 *     — ver trust-proxy.ts.
 */
export function createUserOrIpTracker(jwt: JwtService): ThrottlerGetTrackerFunction {
  return (req) => {
    const header: unknown = req.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify<{ sub?: unknown }>(header.slice(7));
        if (typeof payload.sub === 'string' && payload.sub) {
          return `user:${payload.sub}`;
        }
      } catch {
        // token inválido ou expirado — conta pelo IP
      }
    }
    return `ip:${req.ip}`;
  };
}

/**
 * C-04 — webhook da Evolution: uma cota por instância de WhatsApp.
 *
 * Antes, todos os tenants dividiam um único contador de 200 eventos/min (pior
 * ainda atrás do proxy, onde o IP era sempre o mesmo), e o excedente recebia
 * 429 — mensagem perdida. O nome da instância vem do corpo; quem garante que
 * o webhook é legítimo é a validação da apikey no controller. Sem instância
 * no corpo, conta pelo IP.
 */
export const webhookInstanceTracker: ThrottlerGetTrackerFunction = (req) => {
  const instance: unknown = req.body?.instance;
  if (typeof instance === 'string' && instance.length > 0 && instance.length <= 100) {
    return `webhook:${instance}`;
  }
  return `ip:${req.ip}`;
};
