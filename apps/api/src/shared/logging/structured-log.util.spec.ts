import { formatStructuredLog, WORKER_ID } from './structured-log.util';

describe('formatStructuredLog', () => {
  it('formata evento + campos como "Evento | k=v k=v"', () => {
    expect(formatStructuredLog('WebhookJobStarted', { queue: 'webhook', attempt: '1/3' })).toBe(
      'WebhookJobStarted | queue=webhook attempt=1/3',
    );
  });

  it('usa "-" para campo ausente (null/undefined)', () => {
    expect(formatStructuredLog('IdempotencyCollisionResolved', { requestId: undefined, contactId: 'c1' })).toBe(
      'IdempotencyCollisionResolved | requestId=- contactId=c1',
    );
  });

  it('sem campos, devolve só o nome do evento com o separador', () => {
    expect(formatStructuredLog('Evento', {})).toBe('Evento | ');
  });
});

describe('WORKER_ID', () => {
  it('tem o formato hostname:pid', () => {
    expect(WORKER_ID).toMatch(/^.+:\d+$/);
  });
});
