import { AsyncLocalStorage } from 'async_hooks';

interface RequestContextStore {
  requestId: string;
}

// Correlaciona logs da mesma requisição sem precisar injetar o id
// manualmente em cada service — qualquer log emitido durante o ciclo de
// vida da requisição (mesmo em código async, filas etc. chamado a partir
// dela) enxerga o mesmo requestId via getRequestId().
export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
