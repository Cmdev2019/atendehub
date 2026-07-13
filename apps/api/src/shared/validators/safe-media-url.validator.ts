import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// ── Bloqueia alvos que apontam para a rede interna/infra do próprio servidor ──
// Protege contra SSRF: a URL informada pelo agente é buscada pela Evolution
// API no lado do servidor (server-side fetch), então nunca pode apontar para
// localhost, ranges privados (RFC 1918), link-local (inclui metadados de
// cloud, ex: 169.254.169.254) ou esquemas diferentes de http/https.
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
]);

function isBlockedIPv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const [a, b] = [Number(match[1]), Number(match[2])];

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 — link-local, inclui metadados de nuvem (AWS/GCP/Azure)
  if (a === 169 && b === 254) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 0.0.0.0/8
  if (a === 0) return true;

  return false;
}

@ValidatorConstraint({ name: 'isSafeMediaUrl', async: false })
export class IsSafeMediaUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }

    // Apenas HTTP(S) — bloqueia file:, ftp:, gopher:, data:, etc.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const hostname = url.hostname.toLowerCase();

    if (BLOCKED_HOSTNAMES.has(hostname)) return false;
    if (isBlockedIPv4(hostname)) return false;

    return true;
  }

  defaultMessage(): string {
    return 'mediaUrl deve ser uma URL http(s) pública válida (hosts internos não são permitidos)';
  }
}

export function IsSafeMediaUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSafeMediaUrlConstraint,
    });
  };
}
