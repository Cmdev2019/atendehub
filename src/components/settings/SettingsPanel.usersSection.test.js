import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createElement as h } from 'react';
import { ThemeProvider } from '../../context/ThemeContext';
import { ConfirmProvider } from '../../context/ConfirmContext';

const mockUser = { id: 'user-1', name: 'Admin', role: 'ADMIN', avatarUrl: null };

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, updateUser: jest.fn() }),
}));

jest.mock('../../services/api', () => ({
  apiClient: {
    getWhatsappConnections: jest.fn().mockResolvedValue({ data: [] }),
    getDepartments: jest.fn().mockResolvedValue({ data: [] }),
    getUsers: jest.fn().mockResolvedValue({
      data: [
        { id: 'user-1', name: 'Admin', email: 'admin@demo.com', role: 'ADMIN', isActive: true },
        { id: 'user-2', name: 'Outro Atendente', email: 'outro@demo.com', role: 'AGENT', isActive: true },
      ],
    }),
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

// Regressão: "Desativar"/"Excluir" apareciam na própria linha do admin
// logado (só "Resetar senha" escondia corretamente) — o backend sempre
// recusa autodesativação/autoexclusão, então eram botões sem saída visível
// só pra essa linha.
describe('SettingsPanel — UsersSection não mostra ações destrutivas na própria linha', () => {
  it('esconde Resetar senha/Desativar/Excluir na linha do usuário logado, mas mostra nas demais', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Usuários e níveis/ }));

    await waitFor(() => {
      expect(screen.getByText('Outro Atendente')).toBeInTheDocument();
    });

    const ownRow = screen.getByText('Admin').closest('.settings-item');
    const otherRow = screen.getByText('Outro Atendente').closest('.settings-item');

    expect(within(ownRow).queryByTitle('Gerar senha temporária para este usuário')).not.toBeInTheDocument();
    expect(within(ownRow).queryByTitle('Desativar usuário')).not.toBeInTheDocument();
    expect(within(ownRow).queryByTitle('Excluir usuário')).not.toBeInTheDocument();

    expect(within(otherRow).getByTitle('Gerar senha temporária para este usuário')).toBeInTheDocument();
    expect(within(otherRow).getByTitle('Desativar usuário')).toBeInTheDocument();
    expect(within(otherRow).getByTitle('Excluir usuário')).toBeInTheDocument();
  });
});
