import { render, screen, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb() {
  throw new Error('estourou no render');
}

describe('ErrorBoundary (B-12)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // React (e nosso próprio componentDidCatch) logam no console.error de
    // propósito — silenciado só pra não poluir a saída do teste.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renderiza os filhos normalmente quando não há erro', () => {
    render(h(ErrorBoundary, null, h('p', null, 'tudo certo')));
    expect(screen.getByText('tudo certo')).toBeInTheDocument();
  });

  it('mostra o fallback em vez de derrubar a árvore quando um filho lança durante o render', () => {
    render(h(ErrorBoundary, null, h(Bomb)));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
    expect(screen.queryByText('tudo certo')).not.toBeInTheDocument();
  });

  it('loga o erro (sem vazar dado do usuário, só a mensagem/stack)', () => {
    render(h(ErrorBoundary, null, h(Bomb)));

    const loggedOwnError = consoleErrorSpy.mock.calls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('Erro não tratado na interface'),
    );
    expect(loggedOwnError).toBe(true);
  });

  it('o botão "Recarregar página" chama onReload (default: window.location.reload)', () => {
    const onReload = jest.fn();
    render(h(ErrorBoundary, { onReload }, h(Bomb)));

    fireEvent.click(screen.getByText('Recarregar página'));
    expect(onReload).toHaveBeenCalled();
  });
});
