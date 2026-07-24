import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

/**
 * Aplica o Redis Adapter no nível do IoAdapter (raiz da engine Socket.IO),
 * não dentro do gateway. Gateways com `namespace` (ex.: `/ws`) recebem em
 * `afterInit(server)` o objeto Namespace, não o Server raiz — Namespace não
 * tem `.adapter()`, então chamar isso lá dentro sempre falhava (escondido
 * pelo try/catch do gateway). Aqui o `.adapter()` é chamado no Server real,
 * criado antes de qualquer namespace, então funciona com qualquer namespace
 * registrado depois — resolvendo `events.gateway.ts:80` (B2-6).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const config = this.app.get(ConfigService);
    const host = config.get<string>('REDIS_HOST', 'localhost');
    const port = config.get<number>('REDIS_PORT', 6379);
    const password = config.get<string>('REDIS_PASSWORD');

    const pubClient = new Redis({ host, port, password, maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();

    try {
      await Promise.all([
        new Promise<void>((resolve) => pubClient.once('ready', resolve)),
        new Promise<void>((resolve) => subClient.once('ready', resolve)),
      ]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log(`Socket.IO Redis Adapter configurado (${host}:${port})`);
    } catch (err: any) {
      this.logger.error(
        `Falha ao conectar Redis Adapter: ${err.message}. Socket.IO funcionará apenas em single-instance.`,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
