// B-18 / B-86: opções do Sentry do front, fora do monitoring.js — que lê o
// import.meta.env do Vite, que o Jest não entende — para poderem ser testadas.
export function sentryOptions({ dsn, environment }) {
  return {
    dsn,
    environment,
    tracesSampleRate: 0,
    // B-86 (Sentry 11): sem `dataCollection`, o SDK 11 coleta tudo — IP,
    // cabeçalhos, cookies, corpos e query string; no 10 o padrão era não
    // coletar dado pessoal. O mínimo fica aqui, explícito (mesmo da API).
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
    // Nunca manda corpo de requisição/formulário pro Sentry — pode conter
    // telefone/conteúdo de mensagem de cliente (LGPD, mesma cautela do
    // backend em sentry.ts). Segunda barreira, além do dataCollection.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      return event;
    },
  };
}
