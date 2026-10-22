import { ArgumentsHost, Catch, ConflictException, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { isUniqueConstraintViolation } from '../prisma/prisma-errors.util';

// ── Inicialização (B-18) ─────────────────────────────────────────────────────
// Sem tracing de performance (tracesSampleRate: 0) — o pedido era só captura/
// agrupamento de exceções com stack trace e alerta (o winston já cobre logs
// estruturados, B6-3). Sem SENTRY_DSN configurado, Sentry.init() não lança —
// só desativa o envio (comportamento documentado do SDK), então é seguro
// chamar sempre, mesmo em dev antes de alguém configurar a conta.
export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
    // B-86 (Sentry 11): sem `dataCollection`, o SDK 11 coleta tudo — IP,
    // cabeçalhos, cookies, corpos, query string e variáveis locais; no 10 o
    // padrão era não coletar dado pessoal. O mínimo fica aqui, explícito.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // Nunca manda corpo de requisição/cookies pro Sentry — pode conter
    // telefone/conteúdo de mensagem de cliente (LGPD, mesma cautela de
    // B-17/B-28/B-29/B-30). Só stack trace e metadata técnica saem daqui.
    // Segunda barreira: vale mesmo que algo anexe esses campos ao evento.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      return event;
    },
  });
}

// ── Filtro global de exceções ────────────────────────────────────────────────
// Estende BaseExceptionFilter (o handler padrão do Nest) em vez de substituí-lo
// — a resposta HTTP pro cliente continua idêntica a se este filtro não
// existisse; a única mudança é capturar no Sentry ANTES de delegar. Erros
// esperados (HttpException com status < 500 — validação, 404, 409...) não são
// capturados: são fluxo normal da aplicação, não incidente pra investigar.
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // B-73 (M-07): violação de índice único que nenhum serviço tratou é
    // conflito com dado existente (409), não erro do servidor (500).
    if (isUniqueConstraintViolation(exception)) {
      return super.catch(new ConflictException('Conflito com um registro já existente'), host);
    }

    const isExpectedHttpError =
      exception instanceof HttpException && exception.getStatus() < 500;

    if (!isExpectedHttpError) {
      Sentry.captureException(exception);
    }

    super.catch(exception, host);
  }
}
