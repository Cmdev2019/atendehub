import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { requestContext } from './request-context';

const HEADER = 'x-request-id';

// Reaproveita o request-id recebido (útil atrás de um proxy/gateway que já
// gera um) ou cria um novo — sempre devolvido no header de resposta pra
// correlacionar log do backend com o que o cliente/proxy viu.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers[HEADER] as string) || randomUUID();
    res.setHeader(HEADER, requestId);

    requestContext.run({ requestId }, () => next());
  }
}
