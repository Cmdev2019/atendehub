/**
 * C-04 — quantos proxies à frente da API são confiáveis para o Express
 * calcular `req.ip` a partir do `X-Forwarded-For`.
 *
 * Em produção a API só é alcançável através do nginx (B-55), que repassa o IP
 * do cliente em `X-Forwarded-For` (B-43). Sem `trust proxy`, `req.ip` é sempre
 * o IP do nginx e o limite de requisições trata a plataforma inteira como um
 * único cliente — 5 logins errados de qualquer pessoa travavam o login de
 * todo mundo.
 *
 * `TRUST_PROXY`:
 *   - ausente → 1 em produção (só o nginx), desligado fora dela (em dev a API
 *     é acessada direto, e confiar no cabeçalho deixaria qualquer um escolher
 *     o próprio IP);
 *   - `false`/`0` → desligado;
 *   - número → quantidade de proxies confiáveis (ex.: 2 com um balanceador
 *     na frente do nginx);
 *   - qualquer outro texto → repassado ao Express (lista de IPs/sub-redes,
 *     ex.: `loopback, 10.0.0.0/8`).
 */
export function resolveTrustProxy(
  value: string | undefined,
  isProduction: boolean,
): boolean | number | string {
  const raw = value?.trim();
  if (!raw) return isProduction ? 1 : false;
  if (raw === 'false' || raw === '0') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}
