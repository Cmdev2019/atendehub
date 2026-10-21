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
      data: [
        {
          id: 'q-1', name: 'Fila Receitas', strategy: 'MANUAL', maxWaitSecs: 300, maxServiceSecs: null, isActive: true,
          departmentId: 'dep-1', department: { id: 'dep-1', name: 'Receitas' },
        },
        {
          id: 'q-2', name: 'Fila Ultrassom', strategy: 'MANUAL', maxWaitSecs: 600, maxServiceSecs: 1800, isActive: true,
          departmentId: 'dep-2', department: { id: 'dep-2', name: 'Ultrassom' },
        },
      ],
    }),
    createQueue: jest.fn().mockResolvedValue({}),
    updateQueue: jest.fn().mockResolvedValue({}),
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

    expect(screen.getByText('Fila compartilhada · espera máx. 300s · atendimento sem prazo · Receitas')).toBeInTheDocument();
    expect(screen.queryByText(/Round-robin/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Menos ocupado/)).not.toBeInTheDocument();
  });

  it('cria fila sem mandar estratégia (o backend usa MANUAL)', async () => {
    await openQueues();

    fireEvent.change(screen.getByPlaceholderText(/Nome da fila/), { target: { value: 'Fila Endoscopia' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar fila/ }));

    await waitFor(() => expect(apiClient.createQueue).toHaveBeenCalled());
    expect(apiClient.createQueue.mock.calls[0][0]).not.toHaveProperty('strategy');
  });
});

// B-114 (ADR-0019, regra 19): o prazo do atendimento é por setor, na fila dele
describe('SettingsPanel — Filas com o tempo máximo de atendimento', () => {
  async function openQueues() {
    render(h(ThemeProvider, null, h(ConfirmProvider, null, h(SettingsPanel))));
    fireEvent.click(screen.getByRole('button', { name: /Filas de distribuição/ }));
    await waitFor(() => expect(screen.getByText('Fila Ultrassom')).toBeInTheDocument());
  }

  beforeEach(() => jest.clearAllMocks());

  it('mostra o prazo do atendimento de cada setor', async () => {
    await openQueues();

    expect(screen.getByText('Fila compartilhada · espera máx. 600s · atendimento máx. 1800s · Ultrassom')).toBeInTheDocument();
  });

  it('cria fila com o prazo do atendimento; vazio manda null (setor sem prazo)', async () => {
    await openQueues();

    fireEvent.change(screen.getByPlaceholderText(/Nome da fila/), { target: { value: 'Fila Endoscopia' } });
    fireEvent.change(screen.getByPlaceholderText(/Tempo máx. de atendimento/), { target: { value: '2400' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar fila/ }));
    await waitFor(() => expect(apiClient.createQueue).toHaveBeenCalledTimes(1));
    expect(apiClient.createQueue.mock.calls[0][0]).toMatchObject({ name: 'Fila Endoscopia', maxServiceSecs: 2400 });

    fireEvent.change(screen.getByPlaceholderText(/Nome da fila/), { target: { value: 'Fila Receitas 2' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar fila/ }));
    await waitFor(() => expect(apiClient.createQueue).toHaveBeenCalledTimes(2));
    expect(apiClient.createQueue.mock.calls[1][0]).toMatchObject({ maxServiceSecs: null });
  });

  it('editar e apagar o prazo do atendimento manda null, para o setor ficar sem prazo', async () => {
    await openQueues();

    fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[1]); // Fila Ultrassom
    const field = screen.getByPlaceholderText(/Tempo máx. de atendimento/);
    expect(field).toHaveValue(1800);
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/ }));

    await waitFor(() => expect(apiClient.updateQueue).toHaveBeenCalled());
    expect(apiClient.updateQueue).toHaveBeenCalledWith('q-2', expect.objectContaining({ maxServiceSecs: null }));
  });
});
