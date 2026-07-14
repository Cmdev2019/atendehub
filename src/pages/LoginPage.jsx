import { createElement as h } from 'react';
import { LoginForm } from '../components/LoginForm';
import { Logo } from '../components/Logo';

const e = h;

export function LoginPage({ onLoginSuccess }) {
  return e(
    'div',
    { className: 'login-page' },
    e(
      'div',
      { className: 'login-container' },
      // Header
      e(
        'div',
        { className: 'login-header' },
        e(Logo, { size: 64 }),
        e('h1', null, 'AtendeHub'),
        e('p', null, 'Sistema de Atendimento Omnichannel'),
      ),

      // Form
      e(
        'div',
        { className: 'login-body' },
        e('h2', null, 'Faça login em sua conta'),
        e(LoginForm, { onSuccess: onLoginSuccess }),
      ),

      // Footer
      e(
        'div',
        { className: 'login-footer' },
        e('small', null, '© 2026 AtendeHub. Todos os direitos reservados.'),
      ),
    ),
  );
}
