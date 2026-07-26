import { render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { Metrics } from './Metrics';

describe('Metrics', () => {
  it('renderiza os indicadores a partir do stats agregado (B-2)', () => {
    const stats = {
      totalActive: 4,
      waiting: 2,
      open: 1,
      resolvedToday: 3,
      unreadCount: 5,
      unreadConversations: 2,
    };

    render(h(Metrics, { stats }));

    expect(screen.getByText('4')).toBeInTheDocument(); // conversas ativas
    expect(screen.getByText('1')).toBeInTheDocument(); // em atendimento
    expect(screen.getAllByText('2').length).toBeGreaterThan(0); // aguardando / unreadConversations
    expect(screen.getByText('3')).toBeInTheDocument(); // resolvidas hoje
    expect(screen.getByText('5')).toBeInTheDocument(); // não lidas
  });

  it('não quebra e mostra zeros sem stats', () => {
    render(h(Metrics, { stats: {} }));
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('lida com stats undefined sem lançar erro', () => {
    expect(() => render(h(Metrics))).not.toThrow();
  });

  // Pedido do usuário: remover os textos em <small> dos cards de indicadores.
  it('não mostra textos em <small> nos cards (pedido do usuário)', () => {
    const { container } = render(h(Metrics, { stats: { totalActive: 4 } }));
    expect(container.querySelectorAll('.metric-card small')).toHaveLength(0);
  });
});
