import * as Sentry from '@sentry/react';

// B-18: captura/agrupamento de exceções não tratadas do frontend, mesmo pé
// de igualdade com o backend (sentry.ts). Sem VITE_SENTRY_DSN configurado,
// Sentry.init() é um no-op seguro (comportamento documentado do SDK) — não
// bloqueia ninguém rodando em dev antes de a conta existir.
export function initMonitoring() {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    // Nunca manda corpo de requisição/formulário pro Sentry — pode conter
    // telefone/conteúdo de mensagem de cliente (LGPD, mesma cautela do
    // backend em sentry.ts).
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      return event;
    },
  });
}

// Chamado pelo ErrorBoundary (B-12) — todo erro de render não tratado
// também vira evento no Sentry, não só no console.
export function captureException(error, extra) {
  Sentry.captureException(error, extra ? { extra } : undefined);
}
