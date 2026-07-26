import { render, screen, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';

jest.mock('../services/api', () => ({
  apiClient: { getDashboardSummary: jest.fn() },
}));

import { DashboardView } from './DashboardView';

describe('DashboardView (B-32)', () => {
  let mockApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('../services/api').apiClient;
  });

  it('mostra "Carregando" antes da resposta chegar', () => {
    mockApiClient.getDashboardSummary.mockReturnValue(new Promise(() => {})); // nunca resolve
    render(h(DashboardView));

    expect(screen.getByText('Carregando indicadores…')).toBeInTheDocument();
  });

  it('mostra os indicadores reais depois de carregar', async () => {
    mockApiClient.getDashboardSummary.mockResolvedValueOnce({
      totalConversations: 20,
      attended: 15,
      notAttended: 5,
      totalClosed: 8,
      resolved: 5,
      unresolved: 2,
      unlabeled: 1,
    });

    render(h(DashboardView));

    await waitFor(() => expect(screen.queryByText('Carregando indicadores…')).not.toBeInTheDocument());

    expect(screen.getByText('20')).toBeInTheDocument(); // chamados no período
    expect(screen.getByText('15')).toBeInTheDocument(); // atendidos
    expect(screen.getAllByText('5')).toHaveLength(2);   // não atendidos + resolvidos (mesmo valor)
    expect(screen.getAllByText('Atendidos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Não atendidos').length).toBeGreaterThan(0);
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

    render(h(DashboardView));

    await waitFor(() => expect(screen.queryByText('Carregando indicadores…')).not.toBeInTheDocument());

    expect(screen.getAllByText('Sem dados no período.')).toHaveLength(1);
  });

  it('não quebra a tela se o backend falhar — mantém os indicadores zerados', async () => {
    mockApiClient.getDashboardSummary.mockRejectedValueOnce(new Error('offline'));

    render(h(DashboardView));

    await waitFor(() => expect(screen.queryByText('Carregando indicadores…')).not.toBeInTheDocument());

    expect(screen.getAllByText('Sem dados no período.')).toHaveLength(2);
  });
});
