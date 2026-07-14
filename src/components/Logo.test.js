import { render } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo Component', () => {
  it('renderiza sem erros', () => {
    const { container } = render(Logo({ size: 40 }));
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renderiza com tamanho padrão', () => {
    const { container } = render(Logo({}));
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
  });

  it('renderiza com tamanho customizado', () => {
    const { container } = render(Logo({ size: 64 }));
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });

  it('contém gradientes SVG', () => {
    const { container } = render(Logo({ size: 40 }));
    expect(container.querySelector('#gradientBg')).toBeInTheDocument();
    expect(container.querySelector('#gradientDot')).toBeInTheDocument();
  });

  it('contém forma de bolha de chat', () => {
    const { container } = render(Logo({ size: 40 }));
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('contém múltiplos círculos (dots)', () => {
    const { container } = render(Logo({ size: 40 }));
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThan(1);
  });

  it('aplica className customizado', () => {
    const { container } = render(Logo({ size: 40, className: 'my-logo' }));
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('my-logo');
  });
});
