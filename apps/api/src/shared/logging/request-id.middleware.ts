import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { requestContext } from './request-context';

const HEADER = 'x-request-id';
// B-94 (L-05): o id do cliente vai para todo log e para o header de resposta
// — só entra se for curto e sem caracteres de controle/espaço (UUID, ids de
// proxy). Fora disso (valor gigante, quebra de linha forjando log), gera um.
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

// Reaproveita o request-id recebido (útil atrás de um proxy/gateway que já
// gera um) ou cria um novo — sempre devolvido no header de resposta pra
// correlacionar log do backend com o que o cliente/proxy viu.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const received = req.headers[HEADER];
    const requestId =
      typeof received === 'string' && VALID_REQUEST_ID.test(received) ? received : randomUUID();
    res.setHeader(HEADER, requestId);

    requestContext.run({ requestId }, () => next());
  }
}
