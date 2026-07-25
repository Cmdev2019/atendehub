import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';
import { ThemeProvider } from '../../context/ThemeContext';
import { ConfirmProvider } from '../../context/ConfirmContext';

const mockUser = { id: 'user-1', name: 'Admin', role: 'ADMIN', avatarUrl: null };

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, updateUser: jest.fn() }),
}));

// SettingsPanel.jsx importa apiClient no escopo do módulo (via WhatsappSection/
// UsersSection/etc.) — precisa ser mockado pra evitar o problema de import.meta
// (mesma razão documentada em api.test.js/websocket eventBus.test.js).
jest.mock('../../services/api', () => ({
  apiClient: {
    getWhatsappConnections: jest.fn().mockResolvedValue({ data: [] }),
    getDepartments: jest.fn().mockResolvedValue({ data: [] }),
    getUsers: jest.fn().mockResolvedValue({ data: [] }),
    getQueues: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

jest.mock('../../services/websocket', () => ({
  wsClient: { on: jest.fn(), off: jest.fn() },
}));

import { SettingsPanel } from './SettingsPanel';

function renderPanel() {
  return render(h(ThemeProvider, null, h(ConfirmProvider, null, h(SettingsPanel))));
}

// B-14: a seção ativa do menu de Configurações só era indicada por CSS
// (classe .active) — leitor de tela não tinha como saber qual estava selecionada.
describe('SettingsPanel — nav com aria-current (B-14)', () => {
  it('marca aria-current="page" só na seção ativa, e atualiza ao trocar de seção', async () => {
    renderPanel();

    const profileBtn = screen.getByRole('button', { name: /Meu perfil/ });
    const appearanceBtn = screen.getByRole('button', { name: /Aparência/ });

    expect(profileBtn).toHaveAttribute('aria-current', 'page');
    expect(appearanceBtn).not.toHaveAttribute('aria-current');

    fireEvent.click(appearanceBtn);

    await waitFor(() => {
      expect(appearanceBtn).toHaveAttribute('aria-current', 'page');
    });
    expect(profileBtn).not.toHaveAttribute('aria-current');
  });
});
