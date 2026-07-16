import { createElement as h, useSyncExternalStore } from 'react';
import { apiClient } from '../services/api';

// Banner persistente exibido sempre que o app está operando sobre o mock
// (backend indisponível em dev ou mock explícito). Some sozinho quando o
// backend volta — o apiClient revalida com backoff e notifica via onModeChange.
export function DemoBanner() {
  const mockActive = useSyncExternalStore(
    (onStoreChange) => apiClient.onModeChange(onStoreChange),
    () => apiClient.isMockActive(),
  );

  if (!mockActive) return null;

  return h(
    'div',
    { className: 'demo-banner', role: 'status' },
    '🧪 Modo demonstração — dados fictícios (backend indisponível)',
  );
}
