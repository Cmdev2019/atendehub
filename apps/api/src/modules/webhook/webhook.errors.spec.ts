import { classifyWebhookError, WebhookPermanentError } from './webhook.errors';

describe('classifyWebhookError (B-39)', () => {
  it('classifica WebhookPermanentError como permanent', () => {
    expect(classifyWebhookError(new WebhookPermanentError('payload inválido'))).toBe('permanent');
  });

  it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EHOSTUNREACH'])(
    'classifica erro de rede com code=%s como transient',
    (code) => {
      expect(classifyWebhookError(Object.assign(new Error('falha de rede'), { code }))).toBe('transient');
    },
  );

  it.each(['P1001', 'P1002', 'P1008', 'P1017'])(
    'classifica erro do Prisma com code=%s (falha de conexão) como transient',
    (code) => {
      expect(classifyWebhookError(Object.assign(new Error('prisma'), { code }))).toBe('transient');
    },
  );

  it('classifica HTTP 500 (response.status) como transient', () => {
    expect(classifyWebhookError(Object.assign(new Error('erro'), { response: { status: 500 } }))).toBe(
      'transient',
    );
  });

  it('classifica HTTP 429 como transient (rate limit — vale re-tentar mais tarde)', () => {
    expect(classifyWebhookError(Object.assign(new Error('erro'), { response: { status: 429 } }))).toBe(
      'transient',
    );
  });

  it('classifica HTTP 400 como permanent (payload/credenciais não se corrigem sozinhos)', () => {
    expect(classifyWebhookError(Object.assign(new Error('erro'), { response: { status: 400 } }))).toBe(
      'permanent',
    );
  });

  it('classifica erro de timeout pelo nome/mensagem como transient', () => {
    const err = new Error('operação excedeu o timeout configurado');
    err.name = 'TimeoutError';
    expect(classifyWebhookError(err)).toBe('transient');
  });

  it('classifica erro com "redis" na mensagem como transient', () => {
    expect(classifyWebhookError(new Error('Redis connection lost'))).toBe('transient');
  });

  it('classifica erro sem nenhuma assinatura conhecida como unknown (nunca some silenciosamente — Bull ainda re-tenta)', () => {
    expect(classifyWebhookError(new Error('algo bizarro aconteceu'))).toBe('unknown');
  });

  it('classifica valor que não é Error como unknown', () => {
    expect(classifyWebhookError('string qualquer')).toBe('unknown');
    expect(classifyWebhookError(null)).toBe('unknown');
    expect(classifyWebhookError(undefined)).toBe('unknown');
  });
});
