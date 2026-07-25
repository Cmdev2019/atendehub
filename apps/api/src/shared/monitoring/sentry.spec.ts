import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { SentryExceptionFilter } from './sentry';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

// B-18: só erros inesperados (5xx / não-HttpException) viram evento no
// Sentry — HttpException com status < 500 é fluxo normal da aplicação
// (validação, 404, conflito...), não incidente pra investigar. A
// responsabilidade de transformar exceção em resposta HTTP continua 100%
// do BaseExceptionFilter do Nest (já testado pelo próprio framework) — o
// que importa testar aqui é só a decisão de capturar (ou não) no Sentry.
describe('SentryExceptionFilter', () => {
  const mockHost: any = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
  });

  it('não captura HttpException esperada (ex.: 404), mas delega a resposta ao Nest', () => {
    const filter = new SentryExceptionFilter();
    const exception = new NotFoundException('não encontrado');
    filter.catch(exception, mockHost);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalledWith(exception, mockHost);
  });

  it('não captura HttpException esperada (ex.: 400)', () => {
    const filter = new SentryExceptionFilter();
    filter.catch(new BadRequestException('inválido'), mockHost);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('captura um erro genérico (não-HttpException) e ainda delega a resposta ao Nest', () => {
    const filter = new SentryExceptionFilter();
    const error = new Error('algo quebrou de verdade');
    filter.catch(error, mockHost);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalledWith(error, mockHost);
  });
});
