import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from './ThemeContext';
import { useTheme } from '../hooks/useTheme';

// Componente de teste
function TestComponent() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div>
      <div data-testid="theme">{isDark ? 'Escuro' : 'Claro'}</div>
      <button onClick={toggleTheme} data-testid="toggle-btn">
        Alternar Tema
      </button>
      <div data-testid="data-theme">
        {typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')}
      </div>
    </div>
  );
}

describe('ThemeContext Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('fornece contexto de tema', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme')).toBeInTheDocument();
  });

  it('começa em tema claro por padrão', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('Claro');
  });

  it('alterna para tema escuro', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByTestId('theme')).toHaveTextContent('Escuro');
    });
  });

  it('alterna tema múltiplas vezes', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');

    // Claro -> Escuro
    await user.click(toggleBtn);
    expect(screen.getByTestId('theme')).toHaveTextContent('Escuro');

    // Escuro -> Claro
    await user.click(toggleBtn);
    expect(screen.getByTestId('theme')).toHaveTextContent('Claro');

    // Claro -> Escuro
    await user.click(toggleBtn);
    expect(screen.getByTestId('theme')).toHaveTextContent('Escuro');
  });

  it('salva tema no localStorage', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(localStorage.getItem('theme')).toBe('dark');
    });
  });

  it('carrega tema do localStorage ao iniciar', () => {
    localStorage.setItem('theme', 'dark');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('Escuro');
  });

  it('aplica data-theme no DOM', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  it('aplica classe dark-mode ao body', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(document.body).toHaveClass('dark-mode');
    });
  });

  it('remove classe dark-mode ao voltar para claro', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');

    // Claro -> Escuro
    await user.click(toggleBtn);
    expect(document.body).toHaveClass('dark-mode');

    // Escuro -> Claro
    await user.click(toggleBtn);
    expect(document.body).not.toHaveClass('dark-mode');
  });

  it('persiste tema após reload', async () => {
    const user = userEvent.setup();

    const { unmount } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(localStorage.getItem('theme')).toBe('dark');
    });

    unmount();

    // Re-render com novo ThemeProvider
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('Escuro');
  });
});
