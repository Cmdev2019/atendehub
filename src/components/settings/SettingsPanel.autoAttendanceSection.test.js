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
    getAutoAttendanceFlow: jest.fn(),
    updateAutoAttendanceFlow: jest.fn(),
    createAutoAttendanceMenuOption: jest.fn(),
    updateAutoAttendanceMenuOption: jest.fn(),
    removeAutoAttendanceMenuOption: jest.fn(),
    reorderAutoAttendanceMenuOptions: jest.fn(),
    getDepartments: jest.fn(),
    getQueues: jest.fn(),
  },
}));

jest.mock('../../services/websocket', () => ({
  wsClient: { on: jest.fn(), off: jest.fn() },
}));

import { SettingsPanel } from './SettingsPanel';

const baseFlow = {
  id: null,
  isActive: false,
  greetingMessage: null,
  businessHours: null,
  outOfHoursMessage: null,
  inactivityTimeoutSecs: null,
  inactivityMessage: null,
  closingMessage: null,
  menuOptions: [],
};

const flowWithOption = {
  ...baseFlow,
  id: 'flow-1',
  isActive: true,
  menuOptions: [
    {
      id: 'opt-1', order: 1, label: 'Suporte', action: 'ROUTE_TO_DEPARTMENT',
      departmentId: 'dept-1', queueId: null,
      department: { id: 'dept-1', name: 'Suporte técnico' }, queue: null,
    },
    {
      id: 'opt-2', order: 2, label: 'Encerrar', action: 'END_CONVERSATION',
      departmentId: null, queueId: null, department: null, queue: null,
    },
  ],
};

function renderPanel() {
  return render(h(ThemeProvider, null, h(ConfirmProvider, null, h(SettingsPanel))));
}

async function openSection(mockApiClient) {
  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: /Auto-atendimento/ }));
  await waitFor(() => expect(mockApiClient.getAutoAttendanceFlow).toHaveBeenCalled());
  // A seção mostra "Carregando…" até o flow resolver — esperar só a chamada
  // ter sido disparada não é suficiente, a promise ainda pode estar pendente
  await screen.findByRole('checkbox', { name: /Auto-atendimento ativo/ });
}

describe('SettingsPanel — AutoAttendanceSection (B-35)', () => {
  let mockApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('../../services/api').apiClient;
    mockApiClient.getAutoAttendanceFlow.mockResolvedValue(baseFlow);
    mockApiClient.updateAutoAttendanceFlow.mockResolvedValue(baseFlow);
    mockApiClient.createAutoAttendanceMenuOption.mockResolvedValue({});
    mockApiClient.updateAutoAttendanceMenuOption.mockResolvedValue({});
    mockApiClient.removeAutoAttendanceMenuOption.mockResolvedValue({ success: true });
    mockApiClient.reorderAutoAttendanceMenuOptions.mockResolvedValue([]);
    mockApiClient.getDepartments.mockResolvedValue({ data: [{ id: 'dept-1', name: 'Suporte técnico' }] });
    mockApiClient.getQueues.mockResolvedValue({ data: [{ id: 'queue-1', name: 'Comercial' }] });
  });

  it('carrega o flow desativado e sem opções quando a empresa nunca configurou nada', async () => {
    await openSection(mockApiClient);

    expect(await screen.findByText('Nenhuma opção de menu criada ainda.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Auto-atendimento ativo/ })).not.toBeChecked();
  });

  it('ativar o toggle e salvar envia isActive:true pro backend', async () => {
    await openSection(mockApiClient);

    fireEvent.click(screen.getByRole('checkbox', { name: /Auto-atendimento ativo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar auto-atendimento/ }));

    await waitFor(() => {
      expect(mockApiClient.updateAutoAttendanceFlow).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  it('marcar um dia de horário de atendimento envia businessHours com aquele dia', async () => {
    await openSection(mockApiClient);

    fireEvent.click(screen.getByRole('checkbox', { name: /Segunda/ }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar auto-atendimento/ }));

    await waitFor(() => {
      expect(mockApiClient.updateAutoAttendanceFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          businessHours: { mon: [{ start: '09:00', end: '18:00' }] },
        }),
      );
    });
  });

  it('adiciona uma opção de menu que encaminha para departamento', async () => {
    await openSection(mockApiClient);

    fireEvent.change(screen.getByPlaceholderText('Rótulo da opção (ex.: Suporte técnico)'), {
      target: { value: 'Financeiro' },
    });
    fireEvent.change(screen.getByDisplayValue('Selecione o departamento…'), {
      target: { value: 'dept-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar opção/ }));

    await waitFor(() => {
      expect(mockApiClient.createAutoAttendanceMenuOption).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Financeiro', action: 'ROUTE_TO_DEPARTMENT', departmentId: 'dept-1' }),
      );
    });
  });

  it('lista as opções existentes com departamento/fila resolvidos', async () => {
    mockApiClient.getAutoAttendanceFlow.mockResolvedValue(flowWithOption);
    await openSection(mockApiClient);

    expect(await screen.findByText('1 — Suporte')).toBeInTheDocument();
    expect(screen.getByText(/Encaminhar para departamento: Suporte técnico/)).toBeInTheDocument();
    const secondItem = screen.getByText('2 — Encerrar').closest('.settings-item');
    expect(within(secondItem).getByText('Encerrar a conversa')).toBeInTheDocument();
  });

  it('excluir uma opção pede confirmação antes de chamar o backend', async () => {
    mockApiClient.getAutoAttendanceFlow.mockResolvedValue(flowWithOption);
    await openSection(mockApiClient);
    await screen.findByText('1 — Suporte');

    fireEvent.click(screen.getAllByTitle('Excluir opção')[0]);

    // Modal de confirmação (useConfirm, B-13) — ainda não chamou o backend
    expect(mockApiClient.removeAutoAttendanceMenuOption).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /Confirmar/ }));

    await waitFor(() => {
      expect(mockApiClient.removeAutoAttendanceMenuOption).toHaveBeenCalledWith('opt-1');
    });
  });

  it('mover a 1ª opção pra baixo reordena via reorderAutoAttendanceMenuOptions', async () => {
    mockApiClient.getAutoAttendanceFlow.mockResolvedValue(flowWithOption);
    await openSection(mockApiClient);
    await screen.findByText('1 — Suporte');

    fireEvent.click(screen.getAllByTitle('Mover para baixo')[0]);

    await waitFor(() => {
      expect(mockApiClient.reorderAutoAttendanceMenuOptions).toHaveBeenCalledWith(['opt-2', 'opt-1']);
    });
  });

  it('o botão "mover pra cima" da 1ª opção fica desabilitado (não há pra onde mover)', async () => {
    mockApiClient.getAutoAttendanceFlow.mockResolvedValue(flowWithOption);
    await openSection(mockApiClient);
    await screen.findByText('1 — Suporte');

    expect(screen.getAllByTitle('Mover para cima')[0]).toBeDisabled();
    expect(screen.getAllByTitle('Mover para baixo')[1]).toBeDisabled();
  });
});
