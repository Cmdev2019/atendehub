import { render, screen, act } from '@testing-library/react';
import { createElement as h } from 'react';

// Estado controlável do wsClient para simular queda e volta do socket
let mockStatus = 'idle';
const mockListeners = new Set();

jest.mock('../services/websocket', () => ({
  wsClient: {
    getStatus: () => mockStatus,
    onStatusChange: (cb) => {
      mockListeners.add(cb);
      return () => mockListeners.delete(cb);
    },
  },
}));

import { RealtimeStatusBanner } from './RealtimeStatusBanner';

const setStatus = (status) => {
  mockStatus = status;
  mockListeners.forEach((cb) => cb(status));
};

describe('RealtimeStatusBanner (B-74)', () => {
  beforeEach(() => {
    mockStatus = 'idle';
    mockListeners.clear();
  });

  it('não aparece com o socket conectado ou sem sessão', () => {
    mockStatus = 'connected';
    render(h(RealtimeStatusBanner));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('aparece enquanto reconecta e some quando o socket volta', () => {
    mockStatus = 'connected';
    render(h(RealtimeStatusBanner));

    act(() => setStatus('reconnecting'));
    expect(screen.getByRole('status')).toHaveTextContent('Reconectando ao tempo real');

    act(() => setStatus('connected'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
