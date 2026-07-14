import { createElement as h, createContext, useState, useEffect } from 'react';

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    // Recuperar tema do localStorage ou detectar preferência do sistema
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Salvar tema no localStorage
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Aplicar ao DOM
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.body.classList.toggle('dark-mode', isDark);
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const value = {
    isDark,
    toggleTheme,
  };

  return h(ThemeContext.Provider, { value }, children);
}
