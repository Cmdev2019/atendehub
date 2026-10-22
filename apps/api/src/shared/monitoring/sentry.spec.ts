import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { initSentry, SentryExceptionFilter } from './sentry';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

// B-86 (Sentry 11): sem `dataCollection` explícito, o SDK 11 passaria a coletar
// IP, cabeçalhos, cookies e corpos — o 10 não coletava por padrão
describe('initSentry — o que sai da API (B-18 / B-86)', () => {
  beforeEach(() => jest.clearAllMocks());
  const options = () => {
    initSentry();
    return (Sentry.init as jest.Mock).mock.calls[0][0];
  };

  it('não coleta dado pessoal: dataCollection mínimo e explícito, sem tracing', () => {
    const { dataCollection, tracesSampleRate } = options();

    expect(dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
    expect(tracesSampleRate).toBe(0);
  });

  it('beforeSend tira o corpo e os cookies da requisição, mesmo que algo os anexe', () => {
    const { beforeSend } = options();
    const event = { request: { url: '/api/v1/x', data: '{"phone":"5511999990000"}', cookies: { sid: 'a' } } };

    expect(beforeSend(event)).toEqual({ request: { url: '/api/v1/x' } });
  });
});

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

  // B-73 (M-07): P2002 não tratado respondia 500 e ia para o Sentry.
  it('converte violação de índice único (P2002) em 409, sem capturar no Sentry', () => {
    const filter = new SentryExceptionFilter();
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    filter.catch(p2002, mockHost);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(BaseExceptionFilter.prototype.catch).toHaveBeenCalledWith(
      expect.any(ConflictException),
      mockHost,
    );
  });
});
