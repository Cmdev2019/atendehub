import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';

// ── B-79 (M-06): webhooks em paralelo, mas em ordem por contato ─────────────
// Antes, uma fila só com concorrência 1 processava os webhooks de todas as
// empresas: uma chamada lenta segurava todo mundo. Agora são N filas
// (shards), cada uma com concorrência 1, e o webhook vai para o shard do seu
// contato (hash de instância + JID). Contatos diferentes andam em paralelo;
// as mensagens de um mesmo contato continuam uma depois da outra — o que
// importa para a conversa (criação, saudação, resposta ao menu).
//
// O shard 0 mantém o nome antigo (`webhook`), então jobs já enfileirados
// antes desta versão continuam sendo processados.
export const WEBHOOK_SHARD_COUNT = 4;

export const WEBHOOK_SHARD_QUEUE_NAMES: string[] = Array.from({ length: WEBHOOK_SHARD_COUNT }, (_, i) =>
  i === 0 ? QUEUE_NAMES.WEBHOOK : `${QUEUE_NAMES.WEBHOOK}-${i}`,
);

// Token das N filas, na ordem dos shards (controller e DLQ escolhem a fila)
export const WEBHOOK_SHARD_QUEUES = Symbol('WEBHOOK_SHARD_QUEUES');

export const webhookShardQueuesProvider = {
  provide: WEBHOOK_SHARD_QUEUES,
  useFactory: (...queues: Queue[]) => queues,
  inject: WEBHOOK_SHARD_QUEUE_NAMES.map((name) => getQueueToken(name)),
};

// Chave de ordenação: o contato da mensagem (ou só a instância, para eventos
// de conexão/QR). Tolerante aos formatos da Evolution — objeto ou lista, com
// `key.remoteJid` (MESSAGES_UPSERT) ou `remoteJid` direto (MESSAGES_UPDATE).
export function webhookOrderingKey(instance: string | undefined, data: any): string {
  const first = Array.isArray(data) ? data[0] : data;
  const jid: string | undefined = first?.key?.remoteJid ?? first?.remoteJid;
  return jid ? `${instance ?? ''}:${jid}` : `${instance ?? ''}`;
}

// FNV-1a de 32 bits: estável entre processos e réplicas (o mesmo contato
// sempre cai no mesmo shard), barato e bem distribuído para chaves curtas.
export function webhookShardIndex(key: string, count = WEBHOOK_SHARD_COUNT): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
}

export function pickWebhookQueue<T>(
  queues: Queue<T>[],
  payload: { instance?: string; data?: any },
): Queue<T> {
  return queues[webhookShardIndex(webhookOrderingKey(payload.instance, payload.data), queues.length)];
}
