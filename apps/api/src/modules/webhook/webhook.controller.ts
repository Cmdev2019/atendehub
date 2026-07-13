import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { timingSafeEqual, createHash } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { QUEUE_NAMES } from '../../shared/queues/queue-names';
import { WebhookJobData } from './webhook.processor';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.WEBHOOK) private readonly webhookQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /api/v1/webhooks/evolution
   *
   * Endpoint público chamado pela Evolution API.
   * Valida a autenticidade da requisição verificando a apikey que a Evolution API
   * inclui no payload de cada webhook (campo "apikey" no corpo JSON).
   *
   * Em vez de processar inline (o que pode causar timeout), adiciona um job
   * na fila e retorna 200 imediatamente. O WebhookProcessor processa em background.
   *
   * Referência: https://evolutionapi-evolution-api-90.mintlify.app/events/webhooks
   *
   * Payload da Evolution API v2:
   * {
   *   "event": "messages.upsert",
   *   "instance": "session-name",
   *   "data": { ... },
   *   "apikey": "<instance_api_key>",
   *   "server_url": "...",
   *   "date_time": "..."
   * }
   */
  @Public()
  @Post('evolution')
  @HttpCode(HttpStatus.OK)
  async receiveEvolution(
    @Body() payload: any,
    @Headers('x-evolution-signature') signatureHeader?: string,
  ): Promise<{ received: boolean }> {
    // ── 1. Fail-closed: a EVOLUTION_API_KEY deve estar configurada ──────────
    const expectedApiKey = this.config.get<string>('EVOLUTION_API_KEY');

    if (!expectedApiKey) {
      this.logger.error(
        'EVOLUTION_API_KEY não configurada — rejeitando webhook (fail-closed).',
      );
      throw new InternalServerErrorException('Webhook não configurado corretamente');
    }

    // ── 2. Validação da apikey ──────────────────────────────────────────────
    // A Evolution API v2 envia a apikey de duas formas:
    //   a) No corpo do payload (campo "apikey") — sempre presente
    //   b) Em um header customizado (se configurado na instância)
    //
    // Verificamos ambos: se o header estiver presente, valida pelo header.
    // Se não, valida pela apikey no corpo do payload.
    const receivedApiKey = signatureHeader || payload?.apikey;

    if (!receivedApiKey) {
      this.logger.warn(
        'Webhook recebido sem apikey no payload ou header — rejeitando.',
      );
      throw new ForbiddenException('Credenciais de webhook ausentes');
    }

    if (!this.isValidApiKey(receivedApiKey, expectedApiKey)) {
      this.logger.warn(
        'Webhook recebido com apikey inválida — possível tentativa de injeção.',
      );
      throw new ForbiddenException('Assinatura do webhook inválida');
    }

    // ── 3. Normaliza o evento ───────────────────────────────────────────────
    // A Evolution API v2 usa dois formatos de evento:
    //   - "MESSAGES_UPSERT" (usado no docker-compose como WEBHOOK_EVENTS_*)
    //   - "messages.upsert" (formato real enviado no payload)
    // Normalizamos para o formato UPPER_SNAKE_CASE usado internamente.
    const normalizedPayload: WebhookJobData = {
      event: this.normalizeEventName(payload.event),
      instance: payload.instance,
      data: payload.data,
    };

    // ── 4. Adiciona job na fila e retorna imediatamente ────────────────────
    // A Evolution API espera um 200 rápido. Processamento acontece em background.
    await this.webhookQueue.add(normalizedPayload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    });

    this.logger.debug(
      `Webhook ${normalizedPayload.event} da instância ${normalizedPayload.instance} adicionado à fila`,
    );

    return { received: true };
  }

  // ── Comparação em tempo constante (previne timing attack) ─────────────────
  // Ambos os valores são hasheados para tamanho fixo antes da comparação,
  // pois timingSafeEqual exige buffers do mesmo comprimento.
  private isValidApiKey(received: string, expected: string): boolean {
    const receivedHash = createHash('sha256').update(received).digest();
    const expectedHash = createHash('sha256').update(expected).digest();
    return timingSafeEqual(receivedHash, expectedHash);
  }

  // ── Normaliza nome do evento para UPPER_SNAKE_CASE ────────────────────────
  // "messages.upsert" → "MESSAGES_UPSERT"
  // "MESSAGES_UPSERT" → "MESSAGES_UPSERT" (já normalizado)
  private normalizeEventName(event: string): string {
    if (!event) return '';
    return event.replace(/\./g, '_').toUpperCase();
  }
}
