import { render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { Metrics } from './Metrics';

describe('Metrics', () => {
  it('calcula os indicadores a partir das conversas reais (não mais fixos)', () => {
    const conversations = [
      { id: '1', status: 'WAITING', unreadCount: 2 },
      { id: '2', status: 'OPEN', unreadCount: 0 },
      { id: '3', status: 'WAITING', unreadCount: 1 },
      { id: '4', status: 'RESOLVED', unreadCount: 0 },
    ];

    render(h(Metrics, { conversations }));

    expect(screen.getByText('4')).toBeInTheDocument(); // total na fila
    expect(screen.getByText('1')).toBeInTheDocument(); // em atendimento (OPEN)
    expect(screen.getByText('2')).toBeInTheDocument(); // aguardando (WAITING) e não lidas coincidem aqui
  });

  it('não quebra e mostra zeros sem conversas', () => {
    render(h(Metrics, { conversations: [] }));
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('lida com conversations undefined sem lançar erro', () => {
    expect(() => render(h(Metrics))).not.toThrow();
  });
});
