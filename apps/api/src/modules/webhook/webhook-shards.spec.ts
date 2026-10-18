import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import {
  WEBHOOK_SHARD_COUNT,
  WEBHOOK_SHARD_QUEUE_NAMES,
  pickWebhookQueue,
  webhookOrderingKey,
  webhookShardIndex,
} from './webhook-shards';

// B-79 (M-06): o que garante "paralelo entre contatos, em ordem dentro do
// contato" é o mesmo contato cair sempre no mesmo shard.
describe('webhook-shards (B-79)', () => {
  it('shard 0 mantém o nome antigo da fila (jobs já enfileirados seguem sendo processados)', () => {
    expect(WEBHOOK_SHARD_QUEUE_NAMES[0]).toBe(QUEUE_NAMES.WEBHOOK);
    expect(new Set(WEBHOOK_SHARD_QUEUE_NAMES).size).toBe(WEBHOOK_SHARD_COUNT);
  });

  it('chave de ordenação: contato da mensagem nos dois formatos da Evolution, ou só a instância', () => {
    expect(webhookOrderingKey('s1', { key: { remoteJid: '5511@s.whatsapp.net' } })).toBe('s1:5511@s.whatsapp.net');
    expect(webhookOrderingKey('s1', [{ remoteJid: '5511@s.whatsapp.net', status: 'READ' }])).toBe(
      's1:5511@s.whatsapp.net',
    );
    expect(webhookOrderingKey('s1', { state: 'open' })).toBe('s1');
  });

  it('mesmo contato → sempre o mesmo shard; mensagem e status do contato juntos', () => {
    const queues = Array.from({ length: WEBHOOK_SHARD_COUNT }, (_, i) => ({ name: `q${i}` })) as any[];
    const upsert = { instance: 's1', data: { key: { remoteJid: '5511999990000@s.whatsapp.net', id: 'a' } } };
    const update = { instance: 's1', data: { remoteJid: '5511999990000@s.whatsapp.net', status: 'READ' } };

    expect(pickWebhookQueue(queues, upsert)).toBe(pickWebhookQueue(queues, upsert));
    expect(pickWebhookQueue(queues, update)).toBe(pickWebhookQueue(queues, upsert));
  });

  it('contatos diferentes se espalham pelos shards', () => {
    const used = new Set(
      Array.from({ length: 200 }, (_, i) => webhookShardIndex(`s1:55119${String(i).padStart(8, '0')}@s.whatsapp.net`)),
    );
    expect(used.size).toBe(WEBHOOK_SHARD_COUNT);
  });
});
