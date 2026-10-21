import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';
import { ThemeProvider } from '../../context/ThemeContext';
import { ConfirmProvider } from '../../context/ConfirmContext';

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Admin', role: 'ADMIN' }, updateUser: jest.fn() }),
}));

// Setores do teste: `ativos` ativos e um desativado
const departmentsWith = (ativos) => ({
  data: [
    ...Array.from({ length: ativos }, (_, i) => ({
      id: `dep-${i + 1}`, name: `Setor ${i + 1}`, color: '#0f766e', isActive: true, _count: { users: 0 },
    })),
    { id: 'dep-off', name: 'Setor desativado', color: '#94a3b8', isActive: false, _count: { users: 0 } },
  ],
});

jest.mock('../../services/api', () => ({
  apiClient: {
    getWhatsappConnections: jest.fn().mockResolvedValue({ data: [] }),
    getUsers: jest.fn().mockResolvedValue({ data: [] }),
    getDepartments: jest.fn(),
    createDepartment: jest.fn().mockResolvedValue({}),
    updateDepartment: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../services/websocket', () => ({
  wsClient: { on: jest.fn(), off: jest.fn() },
}));

import { SettingsPanel } from './SettingsPanel';
import { apiClient } from '../../services/api';

// B-116 (decisão do responsável em 2026-10-21): o admin cria os setores
// conforme a necessidade, até 20 ativos por empresa
describe('SettingsPanel — Grupos (setores) com o limite de 20 ativos', () => {
  async function openGroups(ativos) {
    apiClient.getDepartments.mockResolvedValue(departmentsWith(ativos));
    render(h(ThemeProvider, null, h(ConfirmProvider, null, h(SettingsPanel))));
    fireEvent.click(screen.getByRole('button', { name: /Grupos \(setores\)/ }));
    await waitFor(() => expect(screen.getByText('Setor desativado')).toBeInTheDocument());
  }

  beforeEach(() => jest.clearAllMocks());

  it('mostra quantos setores ativos há e marca o desativado', async () => {
    await openGroups(3);

    expect(screen.getByText('3 de 20 setores ativos')).toBeInTheDocument();
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('abaixo do limite, cria o setor', async () => {
    await openGroups(3);

    fireEvent.change(screen.getByPlaceholderText(/Nome do grupo/), { target: { value: 'Receitas' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar grupo/ }));

    await waitFor(() => expect(apiClient.createDepartment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Receitas' }),
    ));
  });

  it('com 20 ativos, o botão de criar e o de reativar ficam travados, com o motivo', async () => {
    await openGroups(20);

    expect(screen.getByText('20 de 20 setores ativos')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Nome do grupo/), { target: { value: 'Receitas' } });
    const criar = screen.getByRole('button', { name: /Criar grupo/ });
    expect(criar).toBeDisabled();
    expect(criar).toHaveAttribute('title', 'Limite de 20 setores ativos — desative um para criar outro');
    expect(screen.getByRole('button', { name: 'Reativar grupo' })).toBeDisabled();
  });

  it('desativar um setor manda isActive false', async () => {
    await openGroups(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Desativar grupo' })[0]);

    await waitFor(() => expect(apiClient.updateDepartment).toHaveBeenCalledWith('dep-1', { isActive: false }));
  });
});
