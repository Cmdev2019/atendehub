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

  // Auto-cadastro de empresa (B-9) — mesmo fluxo do login (já sai
  // autenticado + socket conectado), só troca o endpoint chamado.
  const registerCompany = useCallback(async (dto) => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.registerCompany(dto);
      setUser(response.user);

      try {
        await wsClient.connect(response.accessToken);
      } catch (wsErr) {
        console.warn('⚠️ WebSocket não conseguiu conectar:', wsErr.message);
      }

      return response;
    } catch (err) {
      setError(err.message || 'Erro ao criar a empresa');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Atualiza o usuário em memória sem precisar de novo login/refresh —
  // usado após editar o próprio perfil ou trocar o avatar (F8-7), pra
  // Topbar/Sidebar refletirem a mudança na hora.
  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const logout = useCallback(async () => {
    // Desconectar WebSocket primeiro
    wsClient.disconnect();

    try {
      await apiClient.logout();
    } catch (err) {
      // Best-effort: a revogação no backend pode falhar (rede, token já
      // expirado), mas a sessão local já foi encerrada (apiClient.logout
      // limpa os tokens no finally) — a UI precisa voltar ao login de
      // qualquer forma, nunca ficar "presa" autenticada sem token válido.
      console.error('Erro ao revogar sessão no backend:', err);
    } finally {
      setUser(null);
      setError(null);
    }
  }, []);

  const value = {
    user,
    loading,
    error,
    login,
    registerCompany,
    logout,
    updateUser,
    isAuthenticated: !!user,
  };

  return h(AuthContext.Provider, { value }, children);
}
