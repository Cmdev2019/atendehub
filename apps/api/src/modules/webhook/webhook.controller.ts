import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  ForbiddenException,
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
   * Requer validação de assinatura para garantir que a requisição partiu da Evolution API.
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
    const expectedSignature = process.env.EVOLUTION_API_KEY ?? 'evolution_api_key_dev';

    if (!signature || signature !== expectedSignature) {
      this.logger.warn(`Tentativa de chamada de webhook não autorizada. Assinatura recebida: ${signature}`);
      throw new ForbiddenException('Assinatura do webhook inválida');
    }

    // Processa de forma assíncrona sem bloquear a resposta
    // A Evolution API espera um 200 rápido
    this.webhookService.handleEvent(payload).catch((err) => {
      this.logger.error(`Erro assíncrono no webhook: ${err.message}`, err.stack);
    });

    return { received: true };
  }
}
