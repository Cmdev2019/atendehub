import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
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
    createUser: jest.fn().mockResolvedValue({}),
    updateUser: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../services/websocket', () => ({
  wsClient: { on: jest.fn(), off: jest.fn() },
}));

import { SettingsPanel } from './SettingsPanel';
import { apiClient } from '../../services/api';
import { wsClient } from '../../services/websocket';

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

// B-65 (ADR-0019): o supervisor vê o estado de cada um e a troca chega na hora
describe('SettingsPanel — UsersSection mostra quem está Online', () => {
  it('mostra o estado de cada usuário e atualiza com o evento user.availability', async () => {
    apiClient.getUsers.mockResolvedValueOnce({
      data: [
        { id: 'user-1', name: 'Admin', email: 'admin@demo.com', role: 'ADMIN', isActive: true, availability: 'ONLINE' },
        { id: 'user-2', name: 'Outro Atendente', email: 'outro@demo.com', role: 'AGENT', isActive: true },
      ],
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Usuários e níveis/ }));
    await waitFor(() => expect(screen.getByText('Outro Atendente')).toBeInTheDocument());

    const ownRow = screen.getByText('Admin').closest('.settings-item');
    const otherRow = screen.getByText('Outro Atendente').closest('.settings-item');
    expect(within(ownRow).getByText('Online')).toBeInTheDocument();
    // Sem o campo, vale Offline
    expect(within(otherRow).getByText('Offline')).toBeInTheDocument();

    const [, onAvailability] = wsClient.on.mock.calls.filter(([event]) => event === 'user.availability').pop();
    act(() => onAvailability({ userId: 'user-2', availability: 'ONLINE' }));
    expect(within(otherRow).getByText('Online')).toBeInTheDocument();
  });
});

// B-113 (ADR-0019, regra 22): setores escolhidos no cadastro e na edição
describe('SettingsPanel — UsersSection escolhe os setores do atendente', () => {
  const sectors = { data: [{ id: 'dep-1', name: 'Receitas' }, { id: 'dep-2', name: 'Ultrassom' }] };

  async function openUsers(users) {
    if (users) apiClient.getUsers.mockResolvedValueOnce({ data: users });
    apiClient.getDepartments.mockResolvedValueOnce(sectors);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Usuários e níveis/ }));
    await waitFor(() => expect(screen.getByText('Outro Atendente')).toBeInTheDocument());
  }

  it('cadastra o atendente já com os setores marcados', async () => {
    await openUsers();
    const choices = await screen.findByRole('group', { name: 'Setores que atende' });

    fireEvent.change(screen.getByPlaceholderText('Nome completo'), { target: { value: 'Nova Atendente' } });
    fireEvent.change(screen.getByPlaceholderText('E-mail'), { target: { value: 'nova@demo.com' } });
    fireEvent.change(screen.getByPlaceholderText(/^Senha/), { target: { value: 'Senha123' } });
    fireEvent.click(within(choices).getByLabelText('Receitas'));
    fireEvent.click(within(choices).getByLabelText('Ultrassom'));
    fireEvent.click(screen.getByRole('button', { name: /Criar usuário/ }));

    await waitFor(() =>
      expect(apiClient.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'nova@demo.com', departmentIds: ['dep-1', 'dep-2'] }),
      ),
    );
  });

  it('mostra os setores de cada um e edita na própria linha — a lista substitui', async () => {
    await openUsers([
      { id: 'user-1', name: 'Admin', email: 'admin@demo.com', role: 'ADMIN', isActive: true },
      {
        id: 'user-2', name: 'Outro Atendente', email: 'outro@demo.com', role: 'AGENT', isActive: true,
        departments: [{ id: 'dep-1', name: 'Receitas' }],
      },
    ]);
    const otherRow = screen.getByText('Outro Atendente').closest('.settings-item');
    expect(within(otherRow).getByText('Setores: Receitas')).toBeInTheDocument();
    expect(within(screen.getByText('Admin').closest('.settings-item')).getByText('Sem setor')).toBeInTheDocument();

    fireEvent.click(within(otherRow).getByTitle('Escolher os setores que este usuário atende'));
    const editor = screen.getByRole('group', { name: 'Setores que Outro Atendente atende' });
    expect(within(editor).getByLabelText('Receitas')).toBeChecked();

    fireEvent.click(within(editor).getByLabelText('Receitas'));
    fireEvent.click(within(editor).getByLabelText('Ultrassom'));
    fireEvent.click(within(otherRow).getByRole('button', { name: /Salvar setores/ }));

    await waitFor(() =>
      expect(apiClient.updateUser).toHaveBeenCalledWith('user-2', { departmentIds: ['dep-2'] }),
    );
  });
});
