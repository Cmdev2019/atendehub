import { createWinstonLogger } from './winston.logger';

describe('createWinstonLogger', () => {
  it.each([true, false])('cria um logger utilizável (isProduction=%s)', (isProduction) => {
    const logger = createWinstonLogger(isProduction);

    expect(logger.log).toBeInstanceOf(Function);
    expect(logger.error).toBeInstanceOf(Function);
    expect(logger.warn).toBeInstanceOf(Function);

    // Não deve lançar ao emitir cada nível — valida que a cadeia de formato
    // (json em produção, nestLike em dev) está montada corretamente.
    expect(() => logger.log?.('mensagem de teste', 'Context')).not.toThrow();
    expect(() => logger.error?.('erro de teste', undefined, 'Context')).not.toThrow();
    expect(() => logger.warn?.('aviso de teste', 'Context')).not.toThrow();
  });
});
