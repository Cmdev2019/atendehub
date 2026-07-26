import { render, screen, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';

jest.mock('../services/api', () => ({
  apiClient: { getDashboardSummary: jest.fn(), getConversationStats: jest.fn() },
}));

import { DashboardView } from './DashboardView';

const baseStats = {
  totalActive: 10,
  waiting: 4,
  open: 6,
  myOpen: 2,
  slaBreached: 1,
  awaitingReply: 3,
  myAwaitingReply: 1,
};

const baseSummary = {
  totalConversations: 20,
  attended: 15,
  notAttended: 5,
  totalClosed: 8,
  resolved: 5,
  unresolved: 2,
  unlabeled: 1,
};

describe('DashboardView (B-32)', () => {
  let mockApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('../services/api').apiClient;
  });

  it('mostra "Carregando" antes das respostas chegarem', () => {
    mockApiClient.getDashboardSummary.mockReturnValue(new Promise(() => {})); // nunca resolve
    mockApiClient.getConversationStats.mockReturnValue(new Promise(() => {}));
    render(h(DashboardView));

    expect(screen.getByText('Carregando indicadores…')).toBeInTheDocument();
  });

  it('mostra os indicadores do período depois de carregar', async () => {
    mockApiClient.getDashboardSummary.mockResolvedValueOnce(baseSummary);
    mockApiClient.getConversationStats.mockResolvedValueOnce(baseStats);

    render(h(DashboardView));

    await waitFor(() => expect(screen.queryByText('Carregando indicadores…')).not.toBeInTheDocument());

    expect(screen.getByText('20')).toBeInTheDocument(); // chamados no período
    expect(screen.getByText('15')).toBeInTheDocument(); // atendidos
    expect(screen.getAllByText('5')).toHaveLength(2);   // não atendidos + resolvidos (mesmo valor)
    expect(screen.getAllByText('Atendidos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Não atendidos').length).toBeGreaterThan(0);
  });

  it('mostra "Resumo de conversas" e "Sem resposta" com dados em tempo real (B-32)', async () => {
    mockApiClient.getDashboardSummary.mockResolvedValueOnce(baseSummary);
    mockApiClient.getConversationStats.mockResolvedValueOnce(baseStats);

    render(h(DashboardView));

    await waitFor(() => expect(screen.queryByText('Carregando indicadores…')).not.toBeInTheDocument());

    expect(screen.getByText('Resumo de conversas (agora)')).toBeInTheDocument();
    expect(screen.getByText('Sem resposta do atendente (agora)')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // totalActive ("Todas")
    expect(screen.getAllByText('2')).toHaveLength(2);   // myOpen + unresolved (mesmo valor)
    expect(screen.getByText('4')).toBeInTheDocument();  // waiting ("Não atendidas")
    expect(screen.getByText('6')).toBeInTheDocument();  // open ("Em atendimento")
    expect(screen.getAllByText('1')).toHaveLength(2);   // slaBreached + myAwaitingReply
    expect(screen.getByText('3')).toBeInTheDocument();  // awaitingReply ("Todas" em sem resposta)
  });

  it('mostra "sem dados" no gráfico quando o período não tem nenhum encerramento', async () => {
    mockApiClient.getDashboardSummary.mockResolvedValueOnce({
      totalConversations: 3,
      attended: 2,
      notAttended: 1,
      totalClosed: 0,
      resolved: 0,
      unresolved: 0,
      unlabeled: 0,
    });
    mockApiClient.getConversationStats.mockResolvedValueOnce(baseStats);

    render(h(DashboardView));

    await waitFor(() => expect(screen.queryByText('Carregando indicadores…')).not.toBeInTheDocument());

    expect(screen.getAllByText('Sem dados no período.')).toHaveLength(1);
  });

  it('não quebra a tela se o backend falhar — mantém os indicadores zerados', async () => {
    mockApiClient.getDashboardSummary.mockRejectedValueOnce(new Error('offline'));
    mockApiClient.getConversationStats.mockRejectedValueOnce(new Error('offline'));

    render(h(DashboardView));

    await waitFor(() => expect(screen.queryByText('Carregando indicadores…')).not.toBeInTheDocument());

    expect(screen.getAllByText('Sem dados no período.')).toHaveLength(2);
  });
});
