import { FactoryProvider } from '@nestjs/common';
import { BullRootModuleOptions, getSharedConfigToken } from '@nestjs/bull';
import Bull, { Queue, QueueOptions } from 'bull';
import { createRequire } from 'module';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { ServiceSlaJobData, SlaCheckJobData } from '../sla/sla-check.processor';

// ── B-107 (D8): produtor da fila do SLA para os pedidos do painel ───────────
// Atender, Pegar próxima, transferir e mudar o status (e a reconciliação do
// SLA) agendam e cancelam os jobs por aqui, com prazo de 2 s por comando.
// Sem prazo, um Redis que aceita a conexão e não responde segurava o comando
// para sempre, e um Redis fora do ar, 233 s (20 tentativas do ioredis).
//
// É uma instância própria da fila `sla-check`, com as mesmas chaves no Redis:
// o processor e os caminhos do robô e do webhook (upsertFromWebhook,
// routeAutoAttendance, updateStatus sem usuário) seguem com a instância do
// BullModule, com o cliente padrão — o prazo não chega a quem envia mensagem
// de verdade. Só a conexão de comandos (`client`) ganha o prazo; a bloqueante
// e a de eventos ficam como o Bull as cria (sem limite de tentativas), mas
// esta instância não processa jobs nem escuta eventos.
export const SLA_REQUEST_QUEUE = Symbol('SLA_REQUEST_QUEUE');
export const SLA_REQUEST_COMMAND_TIMEOUT_MS = 2000;

export type SlaQueue = Queue<SlaCheckJobData | ServiceSlaJobData>;
type BullRedisClient = ReturnType<NonNullable<QueueOptions['createClient']>>;

// O mesmo ioredis que o Bull usa: o 5, dentro do pacote dele (a API usa o 6,
// B-86). Resolvido a partir do Bull, vale onde quer que o npm o instale.
const BullRedis = createRequire(require.resolve('bull'))('ioredis') as new (
  options: QueueOptions['redis'],
) => BullRedisClient;

export function createSlaRequestQueue(shared: BullRootModuleOptions): SlaQueue {
  // Com `createClient` próprio, o Bull não fecha as conexões no close()
  const clients: BullRedisClient[] = [];
  const queue: SlaQueue = new Bull(QUEUE_NAMES.SLA_CHECK, {
    ...shared,
    createClient: (type, redisOpts) => {
      const client =
        type === 'client'
          ? new BullRedis({ ...redisOpts, commandTimeout: SLA_REQUEST_COMMAND_TIMEOUT_MS })
          : new BullRedis({ ...redisOpts, maxRetriesPerRequest: null });
      clients.push(client);
      return client;
    },
  });

  // Mesmo gancho que o @nestjs/bull põe nas filas dele. Como o Bull, dá 500 ms
  // para o QUIT e então derruba a conexão — com o Redis mudo, o QUIT nunca volta.
  Object.assign(queue, {
    onApplicationShutdown: async () => {
      await queue.close();
      await Promise.all(
        clients.map(async (client) => {
          await Promise.race([
            client.quit().catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 500).unref()),
          ]);
          client.disconnect();
        }),
      );
    },
  });
  return queue;
}

export const slaRequestQueueProvider: FactoryProvider<SlaQueue> = {
  provide: SLA_REQUEST_QUEUE,
  inject: [getSharedConfigToken()],
  useFactory: createSlaRequestQueue,
};
