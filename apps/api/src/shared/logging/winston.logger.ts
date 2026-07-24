import * as winston from 'winston';
import { WinstonModule, utilities as nestWinstonUtils } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { getRequestId } from './request-context';

// Injeta o requestId (via AsyncLocalStorage) em todo log emitido dentro do
// ciclo de uma requisição, sem precisar passá-lo explicitamente em cada
// chamada de logger.
const withRequestId = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId) info.requestId = requestId;
  return info;
});

export function createWinstonLogger(isProduction: boolean): LoggerService {
  return WinstonModule.createLogger({
    level: isProduction ? 'log' : 'debug',
    transports: [
      new winston.transports.Console({
        format: isProduction
          ? // Produção: JSON estruturado — consumível por qualquer agregador
            // de log (ELK, CloudWatch, Loki...) sem parsing customizado.
            winston.format.combine(
              withRequestId(),
              winston.format.timestamp(),
              winston.format.json(),
            )
          : // Dev: formato legível no terminal, sem perder o requestId.
            winston.format.combine(
              withRequestId(),
              winston.format.timestamp(),
              nestWinstonUtils.format.nestLike('AtendeHub', {
                colors: true,
                prettyPrint: true,
              }),
            ),
      }),
    ],
  });
}
