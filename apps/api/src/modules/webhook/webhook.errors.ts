// ── B-39: classificação de erro transitório vs. permanente ─────────────────
// Usada pelo WebhookProcessor pra decidir se vale a pena deixar o Bull
// retentar (transitório/desconhecido) ou pular direto pra falha definitiva
// via job.discard() (permanente — retentar não muda o resultado). O padrão
// é sempre RETENTAR quando o erro não é reconhecido: perder uma mensagem
// por classificação errada é pior do que gastar uma tentativa à toa.

export type WebhookErrorClass = 'transient' | 'permanent' | 'unknown';

// Lança isso explicitamente num handler quando o erro é comprovadamente
// permanente (payload corrompido além do que já é tratado defensivamente,
// por exemplo) — nenhum código hoje faz isso, mas o mecanismo existe pra
// quando um caso assim for identificado, em vez de gastar todas as
// tentativas configuradas (`WEBHOOK_ATTEMPTS`) num erro que nunca muda.
export class WebhookPermanentError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'WebhookPermanentError';
  }
}

// Códigos de erro de rede do Node — timeout, conexão recusada/resetada, DNS.
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN', // DNS temporariamente indisponível
  'ENOTFOUND', // DNS não resolveu (pode ser transitório: DNS interno/proxy reiniciando)
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

// Códigos do Prisma pra falha de conexão com o Postgres (não erro de query/dado).
// Ref.: https://www.prisma.io/docs/orm/reference/error-reference
const TRANSIENT_PRISMA_CODES = new Set([
  'P1001', // não conseguiu alcançar o banco
  'P1002', // banco alcançável mas não respondeu a tempo
  'P1008', // timeout de operação
  'P1017', // conexão com o banco encerrada
]);

// Erros de conexão do ioredis (usado pelo Bull e por qualquer chamada direta
// ao Redis no projeto) chegam com esses códigos/nomes.
const TRANSIENT_REDIS_SIGNATURES = ['redis', 'ioredis'];

export function classifyWebhookError(err: unknown): WebhookErrorClass {
  if (err instanceof WebhookPermanentError) return 'permanent';
  if (!(err instanceof Error)) return 'unknown';

  const anyErr = err as any;
  const code: string | undefined = anyErr.code;

  if (code && (TRANSIENT_NETWORK_CODES.has(code) || TRANSIENT_PRISMA_CODES.has(code))) {
    return 'transient';
  }

  // Erro HTTP de uma chamada axios (Evolution, download de mídia) —
  // 429 (rate limit) e 5xx são transitórios; os demais 4xx são permanentes
  // (payload/credenciais errados não se corrigem sozinhos numa retentativa).
  const status: number | undefined = anyErr.response?.status ?? anyErr.status;
  if (typeof status === 'number') {
    if (status === 429 || status >= 500) return 'transient';
    if (status >= 400) return 'permanent';
  }

  const message = err.message?.toLowerCase() ?? '';
  const name = err.name?.toLowerCase() ?? '';

  if (name.includes('timeout') || message.includes('timeout')) return 'transient';
  if (TRANSIENT_REDIS_SIGNATURES.some((sig) => message.includes(sig) || name.includes(sig))) {
    return 'transient';
  }

  return 'unknown';
}
