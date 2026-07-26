import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';

jest.mock('../services/api', () => ({
  apiClient: { getReport: jest.fn(), downloadReport: jest.fn() },
}));

import { ReportsView } from './ReportsView';

const attendanceRows = [
  {
    contato: 'Marina Alves',
    canal: 'WHATSAPP',
    atendente: 'Ana',
    departamento: 'Comercial',
    status: 'CLOSED',
    resolucao: 'Resolvido',
    tags: 'Entrega',
    criadaEm: '2026-07-10T10:00:00.000Z',
    encerradaEm: '2026-07-10T12:00:00.000Z',
  },
];

describe('ReportsView (B-33)', () => {
  let mockApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('../services/api').apiClient;
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  it('carrega o relatório "Base de atendimento" por padrão e mostra a tabela', async () => {
    mockApiClient.getReport.mockResolvedValueOnce({ period: {}, rows: attendanceRows });

    render(h(ReportsView));

    await waitFor(() => expect(screen.queryByText('Carregando relatório…')).not.toBeInTheDocument());

    expect(mockApiClient.getReport).toHaveBeenCalledWith('attendance', expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    expect(screen.getByText('Marina Alves')).toBeInTheDocument();
    expect(screen.getByText('Resolvido')).toBeInTheDocument();
  });

  it('mostra a mensagem de vazio certa quando não há linhas', async () => {
    mockApiClient.getReport.mockResolvedValueOnce({ period: {}, rows: [] });

    render(h(ReportsView));

    await waitFor(() => expect(screen.getByText('Nenhuma conversa no período.')).toBeInTheDocument());
  });

  it('trocar o tipo de relatório refaz a busca com o novo tipo', async () => {
    mockApiClient.getReport.mockResolvedValue({ period: {}, rows: [] });

    render(h(ReportsView));
    await waitFor(() => expect(mockApiClient.getReport).toHaveBeenCalledWith('attendance', expect.anything()));

    fireEvent.change(screen.getByLabelText('Tipo de relatório'), { target: { value: 'by-agent' } });

    await waitFor(() => expect(mockApiClient.getReport).toHaveBeenCalledWith('by-agent', expect.anything()));
  });

  it('trocar a data "de"/"até" refaz a busca com o período novo', async () => {
    mockApiClient.getReport.mockResolvedValue({ period: {}, rows: [] });

    render(h(ReportsView));
    await waitFor(() => expect(mockApiClient.getReport).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-01-01' } });

    await waitFor(() =>
      expect(mockApiClient.getReport).toHaveBeenLastCalledWith('attendance', expect.objectContaining({ from: '2026-01-01' })),
    );
  });

  it('exportar CSV chama downloadReport com format=csv e dispara o download', async () => {
    mockApiClient.getReport.mockResolvedValue({ period: {}, rows: attendanceRows });
    const blob = new Blob(['conteudo'], { type: 'text/csv' });
    mockApiClient.downloadReport.mockResolvedValueOnce({ blob, filename: 'relatorio.csv' });

    render(h(ReportsView));
    await waitFor(() => expect(screen.queryByText('Carregando relatório…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() =>
      expect(mockApiClient.downloadReport).toHaveBeenCalledWith(
        'attendance',
        expect.objectContaining({ format: 'csv' }),
      ),
    );
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('exportar PDF que falha (modo demonstração) mostra o erro na tela', async () => {
    mockApiClient.getReport.mockResolvedValue({ period: {}, rows: attendanceRows });
    mockApiClient.downloadReport.mockRejectedValueOnce({ message: 'Exportação em PDF não está disponível em modo demonstração.' });

    render(h(ReportsView));
    await waitFor(() => expect(screen.queryByText('Carregando relatório…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    await screen.findByText(/não está disponível em modo demonstração/);
  });
});
