import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * POST /api/v1/webhooks/evolution
   *
   * Endpoint público chamado pela Evolution API.
   * Não requer JWT — a segurança é feita pela rede (Docker) e,
   * futuramente, por validação de assinatura HMAC.
   *
   * Payload da Evolution API v2:
   * {
   *   "event": "MESSAGES_UPSERT",
   *   "instance": "slug-nome-timestamp",
   *   "data": { ... }
   * }
   */
  @Public()
  @Post('evolution')
  @HttpCode(HttpStatus.OK)
  async receiveEvolution(
    @Body() payload: any,
    @Headers('x-evolution-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    // Processa de forma assíncrona sem bloquear a resposta
    // A Evolution API espera um 200 rápido
    this.webhookService.handleEvent(payload).catch((err) => {
      this.logger.error(`Erro assíncrono no webhook: ${err.message}`, err.stack);
    });

    return { received: true };
  }
}
