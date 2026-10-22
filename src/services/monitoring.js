import * as Sentry from '@sentry/react';
import { sentryOptions } from './sentryOptions';

// B-18: captura/agrupamento de exceções não tratadas do frontend, mesmo pé
// de igualdade com o backend (sentry.ts). Sem VITE_SENTRY_DSN configurado,
// Sentry.init() é um no-op seguro (comportamento documentado do SDK) — não
// bloqueia ninguém rodando em dev antes de a conta existir. As opções (e o
// que não sai do navegador) ficam em sentryOptions.js.
export function initMonitoring() {
  Sentry.init(
    sentryOptions({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
    }),
  );
}

// Chamado pelo ErrorBoundary (B-12) — todo erro de render não tratado
// também vira evento no Sentry, não só no console.
export function captureException(error, extra) {
  Sentry.captureException(error, extra ? { extra } : undefined);
}
