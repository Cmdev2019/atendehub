import { createElement as h } from 'react';
import { useAuth } from '../hooks/useAuth';

const e = h;

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return e(
      'div',
      { className: 'loading-screen' },
      e('div', { className: 'spinner' }),
      e('p', null, 'Carregando...'),
    );
  }

  if (!isAuthenticated) {
    window.location.href = '/login';
    return null;
  }

  return e(h.Fragment, null, children);
}
