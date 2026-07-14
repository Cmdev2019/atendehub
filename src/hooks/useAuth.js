import { useState, useCallback } from 'react';

export function useAuth() {
  const [user, setUser] = useState({
    id: 'user-1',
    name: 'João Silva',
    email: 'joao@atendehub.com',
    role: 'agent',
    avatar: 'JS',
  });
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (data.user) {
        setUser(data.user);
        setIsAuthenticated(true);
        localStorage.setItem('token', data.token);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('token');
  }, []);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };
}
