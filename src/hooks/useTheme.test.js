import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';
import { ThemeProvider } from '../context/ThemeContext';

describe('useTheme Hook', () => {
  const wrapper = ({ children }) => {
    return {
      ...children,
      props: { children },
      type: ThemeProvider,
    };
  };

  it('retorna isDark e toggleTheme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current).toHaveProperty('isDark');
    expect(result.current).toHaveProperty('toggleTheme');
  });

  it('isDark é boolean', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(typeof result.current.isDark).toBe('boolean');
  });

  it('toggleTheme é function', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(typeof result.current.toggleTheme).toBe('function');
  });

  it('lança erro fora de ThemeProvider', () => {
    // Suprimir console.error para este teste
    const originalError = console.error;
    console.error = jest.fn();

    expect(() => {
      renderHook(() => useTheme());
    }).toThrow();

    console.error = originalError;
  });
});
