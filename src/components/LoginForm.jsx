import { createElement as h, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { validateForm } from '../utils/validators';

const e = h;

export function LoginForm({ onSuccess }) {
  const { login, loading, error: authError } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Limpar erro do campo ao digitar
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Validar formulário
    const formErrors = validateForm(formData, ['email', 'password']);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    try {
      await login(formData.email, formData.password);
      onSuccess?.();
    } catch (err) {
      setErrors({ submit: err.message || 'Erro ao fazer login' });
    }
  };

  return e(
    'form',
    { className: 'login-form', onSubmit: handleSubmit },
    // Email
    e(
      'div',
      { className: 'form-group' },
      e('label', { htmlFor: 'email' }, 'Email'),
      e('input', {
        id: 'email',
        type: 'email',
        placeholder: 'seu@email.com',
        value: formData.email,
        onChange: (evt) => handleChange('email', evt.target.value),
        disabled: loading,
        'aria-describedby': errors.email ? 'email-error' : null,
        className: errors.email ? 'error' : '',
      }),
      errors.email && e('span', { id: 'email-error', className: 'error-text' }, errors.email),
    ),

    // Password
    e(
      'div',
      { className: 'form-group' },
      e('label', { htmlFor: 'password' }, 'Senha'),
      e(
        'div',
        { className: 'password-input-wrapper' },
        e('input', {
          id: 'password',
          type: showPassword ? 'text' : 'password',
          placeholder: '••••••••',
          value: formData.password,
          onChange: (evt) => handleChange('password', evt.target.value),
          disabled: loading,
          'aria-describedby': errors.password ? 'password-error' : null,
          className: errors.password ? 'error' : '',
        }),
        e('button', {
          type: 'button',
          className: 'toggle-password',
          onClick: () => setShowPassword(!showPassword),
          'aria-label': showPassword ? 'Ocultar senha' : 'Mostrar senha',
        }, showPassword ? '👁️' : '👁️‍🗨️'),
      ),
      errors.password && e('span', { id: 'password-error', className: 'error-text' }, errors.password),
    ),

    // Erros gerais
    (authError || errors.submit) &&
      e('div', { className: 'error-box', role: 'alert' }, authError || errors.submit),

    // Submit
    e(
      'button',
      {
        type: 'submit',
        className: 'primary-button',
        disabled: loading,
      },
      loading ? e('span', null, '⏳ Conectando...') : 'Entrar',
    ),

    // Demo credentials hint
    e(
      'div',
      { className: 'demo-hint' },
      e('small', null, '💡 Demo: admin@demo.com / Admin@123'),
    ),
  );
}
