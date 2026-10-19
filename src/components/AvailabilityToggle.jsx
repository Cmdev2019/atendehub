import { createElement as h, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import { wsClient } from '../services/websocket';

export const AVAILABILITY_LABELS = { ONLINE: 'Online', OFFLINE: 'Offline' };

// B-65 (ADR-0019): o atendente escolhe se está Online (recebe as conversas
// novas dos seus setores e pega da fila) ou Offline. Só ele muda o próprio
// estado; o logout põe Offline sozinho. Sem o campo (usuário antigo, modo
// demonstração), vale Offline — ninguém aparece disponível sem ter escolhido.
export function AvailabilityToggle() {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const userId = user?.id;

  // A troca feita em outra aba (ou pelo servidor) chega pelo socket
  useEffect(() => {
    if (!userId) return undefined;
    return wsClient.on('user.availability', (payload) => {
      if (payload?.userId === userId) updateUser({ availability: payload.availability });
    });
  }, [userId, updateUser]);

  if (!user) return null;

  const online = user.availability === 'ONLINE';

  const toggle = async () => {
    const next = online ? 'OFFLINE' : 'ONLINE';
    setBusy(true);
    try {
      const result = await apiClient.updateMyAvailability(next);
      updateUser({ availability: result?.availability ?? next });
      setError(null);
    } catch (err) {
      setError(err?.message || 'Não foi possível trocar o estado');
    } finally {
      setBusy(false);
    }
  };

  return h(
    'span',
    { className: 'availability' },
    h(
      'button',
      {
        type: 'button',
        role: 'switch',
        'aria-checked': online,
        className: `availability-toggle ${online ? 'online' : 'offline'}`,
        onClick: toggle,
        disabled: busy,
        title: online
          ? 'Você está Online e recebe as conversas novas dos seus setores. Clique para ficar Offline.'
          : 'Você está Offline e não pega conversa da fila. Clique para ficar Online.',
      },
      h('span', { className: 'availability-dot', 'aria-hidden': true }),
      AVAILABILITY_LABELS[online ? 'ONLINE' : 'OFFLINE'],
    ),
    error && h('span', { className: 'availability-error', role: 'alert' }, error),
  );
}
