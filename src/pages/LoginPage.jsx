import { createElement as h, useState } from 'react';
import { LoginForm } from '../components/LoginForm';
import { RegisterCompanyForm } from '../components/RegisterCompanyForm';
import { Logo } from '../components/Logo';

const e = h;

// Alterna entre login e auto-cadastro de empresa (B-9) — mesmo card, sem
// navegação/rota nova (o app inteiro é uma SPA de tela única antes do login).
export function LoginPage({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const isRegister = mode === 'register';

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
        e('h2', null, isRegister ? 'Crie a conta da sua empresa' : 'Faça login em sua conta'),
        isRegister
          ? e(RegisterCompanyForm, { onSuccess: onLoginSuccess })
          : e(LoginForm, { onSuccess: onLoginSuccess }),
        e(
          'p',
          { className: 'auth-switch' },
          isRegister ? 'Já tem uma conta? ' : 'Ainda não tem uma empresa cadastrada? ',
          e(
            'button',
            { type: 'button', className: 'auth-switch-link', onClick: () => setMode(isRegister ? 'login' : 'register') },
            isRegister ? 'Fazer login' : 'Criar empresa',
          ),
        ),
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
