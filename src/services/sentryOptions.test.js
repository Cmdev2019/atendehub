import { sentryOptions } from './sentryOptions';

// B-86 (Sentry 11): sem `dataCollection` explícito, o SDK 11 passaria a coletar
// IP, cabeçalhos, cookies e corpos — o 10 não coletava por padrão
describe('sentryOptions — o que sai do front (B-18 / B-86)', () => {
  const options = () => sentryOptions({ dsn: 'https://k@o0.ingest.sentry.io/1', environment: 'production' });

  it('repassa o DSN e o ambiente, sem tracing', () => {
    expect(options()).toEqual(
      expect.objectContaining({
        dsn: 'https://k@o0.ingest.sentry.io/1',
        environment: 'production',
        tracesSampleRate: 0,
      }),
    );
  });

  it('não coleta dado pessoal: dataCollection mínimo e explícito', () => {
    expect(options().dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });

  it('beforeSend tira o corpo e os cookies da requisição, mesmo que algo os anexe', () => {
    const event = { request: { url: '/inbox', data: '{"phone":"5511999990000"}', cookies: { sid: 'a' } } };

    expect(options().beforeSend(event)).toEqual({ request: { url: '/inbox' } });
  });
});
