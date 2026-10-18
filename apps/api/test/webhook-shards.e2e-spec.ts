import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { AppModule } from '../src/app.module';
import { WEBHOOK_SHARD_QUEUE_NAMES } from '../src/modules/webhook/webhook-shards';

/**
 * M-06/B-79 — Webhooks em N filas (shards), cada uma com o seu consumidor.
 *
 * Os consumidores são subclasses geradas do WebhookProcessor, e o @Process
 * chega a elas por herança. O teste unitário não prova isso — só o Bull de
 * verdade, com a aplicação inteira: um job em cada shard precisa ser
 * consumido. Evento desconhecido é ignorado pelo WebhookService, então o job
 * termina sem tocar em nada.
 *
 * Pré-requisito: Postgres e Redis (como os demais e2e).
 */
describe('Webhooks em shards — todo shard tem consumidor (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(WEBHOOK_SHARD_QUEUE_NAMES.map((name) => [name]))('a fila %s é consumida', async (name) => {
    const queue = app.get<Queue>(getQueueToken(name));
    const job = await queue.add({ event: 'E2E_B79_EVENTO_IGNORADO', instance: `e2e-b79-${name}`, data: {} });

    // Consulta o estado em vez de job.finished(): o finished() confere o
    // estado e só depois assina o evento global — um job rápido termina no
    // meio e a promessa nunca resolve (o teste ficava intermitente).
    try {
      let state = await job.getState();
      for (let i = 0; i < 100 && state !== 'completed' && state !== 'failed'; i++) {
        await new Promise((r) => setTimeout(r, 100));
        state = await job.getState();
      }
      expect(state).toBe('completed');
    } finally {
      await job.remove().catch(() => undefined);
    }
  });
});
