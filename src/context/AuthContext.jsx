import { createElement as h, createContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';
import { wsClient } from '../services/websocket';

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

          // Conectar WebSocket se token válido
          try {
            await wsClient.connect(token);
          } catch (wsErr) {
            console.warn('⚠️ WebSocket não conseguiu conectar, mas continuando:', wsErr.message);
          }
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

      // Conectar WebSocket após login bem-sucedido
      try {
        await wsClient.connect(response.accessToken);
        console.log('✅ WebSocket conectado após login');
      } catch (wsErr) {
        console.warn('⚠️ WebSocket não conseguiu conectar:', wsErr.message);
        // Não falha o login se WebSocket falhar
      }

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
      // Desconectar WebSocket primeiro
      wsClient.disconnect();

      await apiClient.logout();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Erro ao fazer logout:', err);
    }
  }, []);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return h(AuthContext.Provider, { value }, children);
}
