import { Writable } from 'stream';
import * as winston from 'winston';
import { WinstonModule } from 'nest-winston';
import { buildWinstonOptions, createWinstonLogger } from './winston.logger';

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

// B-52: com o nível 'log' (inexistente no Winston), a produção não gravava
// nenhuma linha — e o teste acima continuava passando, porque só conferia que
// nada lançava exceção. Estes testes olham o que o Winston de fato deixa passar.
describe('nível de log por ambiente (B-52)', () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  // Troca o Console por um transport que só guarda o nível de cada linha que
  // o Winston deixou passar — verifica o filtro de nível real, sem depender
  // de stdout. (Stream em objectMode recebe o objeto `info` inteiro.)
  function loggerWithCapture(isProduction: boolean) {
    const capture = { levels: [] as string[] };
    const sink = new Writable({
      objectMode: true,
      write(info: { level: string }, _encoding, done) {
        capture.levels.push(info.level);
        done();
      },
    });
    const logger = WinstonModule.createLogger({
      ...buildWinstonOptions(isProduction),
      transports: [new winston.transports.Stream({ stream: sink })],
    });
    return { logger, capture };
  }

  it('usa só nomes de nível que o Winston conhece', () => {
    const known = Object.keys(winston.config.npm.levels);

    expect(known).toContain(buildWinstonOptions(true).level);
    expect(known).toContain(buildWinstonOptions(false).level);
    // Trava: o nome antigo, que fazia o Winston descartar tudo
    expect(known).not.toContain('log');
  });

  it('em produção grava log, warn e error, e descarta debug', async () => {
    const { logger, capture } = loggerWithCapture(true);

    logger.log('mensagem de log', 'Teste');
    logger.warn('mensagem de aviso', 'Teste');
    logger.error('mensagem de erro', undefined, 'Teste');
    logger.debug?.('mensagem de debug', 'Teste');
    await flush();

    expect(capture.levels).toEqual(['info', 'warn', 'error']);
  });

  it('em desenvolvimento também grava debug', async () => {
    const { logger, capture } = loggerWithCapture(false);

    logger.debug?.('mensagem de debug', 'Teste');
    await flush();

    expect(capture.levels).toEqual(['debug']);
  });
});
