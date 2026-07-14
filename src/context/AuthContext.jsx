import { createElement as h, createContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Verificar se usuário está logado ao carregar
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const userData = await apiClient.getCurrentUser();
          setUser(userData);
          setError(null);
        } catch (err) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setUser(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.login(email, password);
      setUser(response.user);
      return response;
    } catch (err) {
      setError(err.message || 'Erro ao fazer login');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  }, []);

  const register = useCallback(async (data) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.register(data);
      return response;
    } catch (err) {
      setError(err.message || 'Erro ao registrar');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    register,
    isAuthenticated: !!user,
  };

  return h(AuthContext.Provider, { value }, children);
}
