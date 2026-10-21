import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { createElement as h } from 'react';

const mockHandlers = {};
jest.mock('../services/websocket', () => ({
  wsClient: {
    on: jest.fn((event, callback) => {
      mockHandlers[event] = callback;
      return () => delete mockHandlers[event];
    }),
  },
}));

jest.mock('../services/api', () => ({
  apiClient: { getConversationsOverview: jest.fn() },
}));

import { MONITOR_EVENT_DEBOUNCE_MS, MONITOR_REFRESH_MS, QueueMonitorView } from './QueueMonitorView';
import { apiClient } from '../services/api';

const NOW = Date.parse('2026-10-21T13:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();

const overview = {
  generatedAt: new Date(NOW).toISOString(),
  totals: {
    waiting: 3, oldestWaitingSince: minutesAgo(30), waitSlaBreached: 1,
    inService: 3, serviceSlaBreached: 0, agentsOnline: 2, agentsTotal: 3,
  },
  departments: [
    { id: 'dep-r', name: 'Receitas', color: '#0f766e', isActive: true, waiting: 2, oldestWaitingSince: minutesAgo(30), waitSlaBreached: 1, inService: 2, serviceSlaBreached: 0, agentsOnline: 1, agentsTotal: 2 },
    { id: 'dep-x', name: 'Oftalmo', color: '#2563eb', isActive: false, waiting: 0, oldestWaitingSince: null, waitSlaBreached: 0, inService: 0, serviceSlaBreached: 0, agentsOnline: 0, agentsTotal: 0 },
    { id: null, name: 'Sem setor', color: null, isActive: true, waiting: 1, oldestWaitingSince: minutesAgo(12), waitSlaBreached: 0, inService: 1, serviceSlaBreached: 0, agentsOnline: 0, agentsTotal: 0 },
  ],
  agents: [
    { id: 'ana', name: 'Ana', role: 'AGENT', availability: 'ONLINE', departmentIds: ['dep-r'], inService: 2, serviceSlaBreached: 0, awaitingReply: 1 },
    { id: 'bia', name: 'Bia', role: 'AGENT', availability: 'OFFLINE', departmentIds: ['dep-r', 'dep-x'], inService: 1, serviceSlaBreached: 1, awaitingReply: 1 },
    { id: 'sue', name: 'Sueli', role: 'SUPERVISOR', availability: 'ONLINE', departmentIds: [], inService: 0, serviceSlaBreached: 0, awaitingReply: 0 },
  ],
};

const rowOf = (name) => screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr');

// B-68 (parte 2): a visão do supervisor — setores × atendentes
describe('QueueMonitorView (B-68)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockHandlers).forEach((key) => delete mockHandlers[key]);
    jest.useFakeTimers().setSystemTime(NOW);
    apiClient.getConversationsOverview.mockResolvedValue(overview);
  });
  afterEach(() => jest.useRealTimers());

  const mount = async () => {
    render(h(QueueMonitorView));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Setores' })).toBeInTheDocument());
  };

  it('mostra o resumo: na fila com a maior espera, estouros em destaque e atendentes Online', async () => {
    await mount();

    const resumo = screen.getByLabelText('Resumo da fila');
    expect(within(resumo).getByText('maior espera: 30 min')).toBeInTheDocument();
    expect(within(resumo).getByText('SLA da espera estourado').closest('.metric-card')).toHaveClass('monitor-card-alert');
    expect(within(resumo).getByText('SLA do atendimento estourado').closest('.metric-card')).not.toHaveClass('monitor-card-alert');
    expect(within(resumo).getByText('2 de 3')).toBeInTheDocument();
  });

  it('lista os setores com a fila, a maior espera e quem está Online — o inativo apagado e o "Sem setor"', async () => {
    await mount();

    const receitas = within(rowOf('Receitas'));
    expect(receitas.getByText('30 min')).toBeInTheDocument();
    expect(receitas.getByText('1 de 2')).toBeInTheDocument();
    expect(rowOf('Oftalmo')).toHaveClass('monitor-row-muted');
    expect(within(rowOf('Oftalmo')).getByText('Inativo')).toBeInTheDocument();
    expect(within(rowOf('Sem setor')).getByText('12 min')).toBeInTheDocument();
  });

  it('destaca a atendente Offline com paciente esperando resposta', async () => {
    await mount();

    expect(rowOf('Bia')).toHaveClass('monitor-row-warning');
    expect(within(rowOf('Bia')).getByText(/Offline com paciente esperando/)).toBeInTheDocument();
    expect(within(rowOf('Bia')).getByText('Receitas, Oftalmo')).toBeInTheDocument();
    // Online com paciente esperando é o trabalho normal: sem destaque
    expect(rowOf('Ana')).not.toHaveClass('monitor-row-warning');
    expect(within(rowOf('Sueli')).getByText('Líder de setor')).toBeInTheDocument();
  });

  it('uma rajada de eventos vira uma busca só; e a cada 30 s busca sozinho', async () => {
    await mount();
    expect(apiClient.getConversationsOverview).toHaveBeenCalledTimes(1);

    act(() => {
      mockHandlers['conversation.created']();
      mockHandlers['sla.breached']();
      mockHandlers['user.availability']();
    });
    await act(async () => jest.advanceTimersByTime(MONITOR_EVENT_DEBOUNCE_MS));
    expect(apiClient.getConversationsOverview).toHaveBeenCalledTimes(2);

    await act(async () => jest.advanceTimersByTime(MONITOR_REFRESH_MS));
    expect(apiClient.getConversationsOverview).toHaveBeenCalledTimes(3);
  });

  it('o botão Atualizar busca na hora', async () => {
    await mount();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Atualizar/ })));

    expect(apiClient.getConversationsOverview).toHaveBeenCalledTimes(2);
  });

  it('sem permissão ou fora do ar: mostra o motivo', async () => {
    apiClient.getConversationsOverview.mockRejectedValueOnce(new Error('Acesso negado. Requer: SUPERVISOR'));
    render(h(QueueMonitorView));

    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado. Requer: SUPERVISOR');
  });
});
