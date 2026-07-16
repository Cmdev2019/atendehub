import { render, screen, act } from '@testing-library/react';
import { createElement as h } from 'react';

// Estado controlável do apiClient para simular troca real ↔ mock
let mockActive = false;
const mockListeners = new Set();

jest.mock('../services/api', () => ({
  apiClient: {
    isMockActive: () => mockActive,
    onModeChange: (cb) => {
      mockListeners.add(cb);
      return () => mockListeners.delete(cb);
    },
  },
}));

import { DemoBanner } from './DemoBanner';

const setMockActive = (active) => {
  mockActive = active;
  mockListeners.forEach((cb) => cb(active));
};

describe('DemoBanner', () => {
  beforeEach(() => {
    mockActive = false;
    mockListeners.clear();
  });

  it('não renderiza nada com backend real', () => {
    render(h(DemoBanner));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('exibe o banner quando o mock está ativo', () => {
    mockActive = true;
    render(h(DemoBanner));
    expect(screen.getByRole('status')).toHaveTextContent('Modo demonstração');
  });

  it('aparece e some conforme o modo muda em tempo real', () => {
    render(h(DemoBanner));
    expect(screen.queryByRole('status')).toBeNull();

    act(() => setMockActive(true));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => setMockActive(false));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
