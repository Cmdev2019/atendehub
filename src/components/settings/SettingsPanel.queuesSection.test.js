import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';
import { ThemeProvider } from '../../context/ThemeContext';
import { ConfirmProvider } from '../../context/ConfirmContext';

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Admin', role: 'ADMIN' }, updateUser: jest.fn() }),
}));

jest.mock('../../services/api', () => ({
  apiClient: {
    getWhatsappConnections: jest.fn().mockResolvedValue({ data: [] }),
    getUsers: jest.fn().mockResolvedValue({ data: [] }),
    getDepartments: jest.fn().mockResolvedValue({ data: [{ id: 'dep-1', name: 'Receitas' }] }),
    getQueues: jest.fn().mockResolvedValue({
      data: [{
        id: 'q-1', name: 'Fila Receitas', strategy: 'MANUAL', maxWaitSecs: 300, isActive: true,
        departmentId: 'dep-1', department: { id: 'dep-1', name: 'Receitas' },
      }],
    }),
    createQueue: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../services/websocket', () => ({
  wsClient: { on: jest.fn(), off: jest.fn() },
}));

import { SettingsPanel } from './SettingsPanel';
import { apiClient } from '../../services/api';

// B-66 (ADR-0019, M-21): a escolha de estratégia prometia uma distribuição que
// nunca existiu — a fila é compartilhada e a tela não oferece mais a opção
describe('SettingsPanel — Filas sem escolha de estratégia', () => {
  async function openQueues() {
    render(h(ThemeProvider, null, h(ConfirmProvider, null, h(SettingsPanel))));
    fireEvent.click(screen.getByRole('button', { name: /Filas de distribuição/ }));
    await waitFor(() => expect(screen.getByText('Fila Receitas')).toBeInTheDocument());
  }

  it('mostra a fila como compartilhada e não oferece Round-robin nem "menos ocupado"', async () => {
    await openQueues();

    expect(screen.getByText('Fila compartilhada · espera máx. 300s · Receitas')).toBeInTheDocument();
    expect(screen.queryByText(/Round-robin/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Menos ocupado/)).not.toBeInTheDocument();
  });

  it('cria fila sem mandar estratégia (o backend usa MANUAL)', async () => {
    await openQueues();

    fireEvent.change(screen.getByPlaceholderText(/Nome da fila/), { target: { value: 'Fila Ultrassom' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar fila/ }));

    await waitFor(() => expect(apiClient.createQueue).toHaveBeenCalled());
    expect(apiClient.createQueue.mock.calls[0][0]).not.toHaveProperty('strategy');
  });
});
