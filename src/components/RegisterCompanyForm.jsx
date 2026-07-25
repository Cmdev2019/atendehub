import { createElement as h, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { validateForm, validators } from '../utils/validators';
import { Icon } from './icons';

const e = h;

// Auto-cadastro de empresa (B-9) — quem preenche este formulário vira ADMIN
// de uma empresa nova (plano FREE por padrão). Mesmo padrão visual do
// LoginForm (reaproveita as classes .login-form/.form-group/.primary-button).
export function RegisterCompanyForm({ onSuccess }) {
  const { registerCompany, loading, error: authError } = useAuth();
  const [formData, setFormData] = useState({
    companyName: '', name: '', email: '', password: '', confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const formErrors = validateForm(formData, ['companyName', 'name', 'email', 'confirmPassword']);
    // Senha do cadastro segue a mesma política do backend (min 8, maiúscula,
    // minúscula, número) — mais forte que o simples "obrigatória" do login.
    const passwordError = validators.passwordPolicy(formData.password);
    if (passwordError) formErrors.password = passwordError;

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    try {
      await registerCompany({
        companyName: formData.companyName,
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });
      onSuccess?.();
    } catch (err) {
      setErrors({ submit: err.message || 'Erro ao criar a empresa' });
    }
  };

  return e(
    'form',
    { className: 'login-form', onSubmit: handleSubmit },
    e(
      'div',
      { className: 'form-group' },
      e('label', { htmlFor: 'companyName' }, 'Nome da empresa'),
      e('input', {
        id: 'companyName',
        type: 'text',
        placeholder: 'Minha Empresa Ltda.',
        value: formData.companyName,
        onChange: (evt) => handleChange('companyName', evt.target.value),
        disabled: loading,
        'aria-describedby': errors.companyName ? 'companyName-error' : null,
        className: errors.companyName ? 'error' : '',
      }),
      errors.companyName && e('span', { id: 'companyName-error', className: 'error-text' }, errors.companyName),
    ),

    e(
      'div',
      { className: 'form-group' },
      e('label', { htmlFor: 'reg-name' }, 'Seu nome'),
      e('input', {
        id: 'reg-name',
        type: 'text',
        placeholder: 'Seu nome completo',
        value: formData.name,
        onChange: (evt) => handleChange('name', evt.target.value),
        disabled: loading,
        'aria-describedby': errors.name ? 'reg-name-error' : null,
        className: errors.name ? 'error' : '',
      }),
      errors.name && e('span', { id: 'reg-name-error', className: 'error-text' }, errors.name),
    ),

    e(
      'div',
      { className: 'form-group' },
      e('label', { htmlFor: 'reg-email' }, 'Email'),
      e('input', {
        id: 'reg-email',
        type: 'email',
        placeholder: 'voce@suaempresa.com',
        value: formData.email,
        onChange: (evt) => handleChange('email', evt.target.value),
        disabled: loading,
        'aria-describedby': errors.email ? 'reg-email-error' : null,
        className: errors.email ? 'error' : '',
      }),
      errors.email && e('span', { id: 'reg-email-error', className: 'error-text' }, errors.email),
    ),

    e(
      'div',
      { className: 'form-group' },
      e('label', { htmlFor: 'reg-password' }, 'Senha'),
      e(
        'div',
        { className: 'password-input-wrapper' },
        e('input', {
          id: 'reg-password',
          type: showPassword ? 'text' : 'password',
          placeholder: '••••••••',
          value: formData.password,
          onChange: (evt) => handleChange('password', evt.target.value),
          disabled: loading,
          'aria-describedby': errors.password ? 'reg-password-error' : null,
          className: errors.password ? 'error' : '',
        }),
        e('button', {
          type: 'button',
          className: 'toggle-password',
          onClick: () => setShowPassword(!showPassword),
          'aria-label': showPassword ? 'Ocultar senha' : 'Mostrar senha',
        }, h(Icon, {
          name: showPassword ? 'eye-off' : 'eye',
          size: 18,
          label: showPassword ? 'Ocultar senha' : 'Mostrar senha',
        })),
      ),
      errors.password
        ? e('span', { id: 'reg-password-error', className: 'error-text' }, errors.password)
        : e('span', { className: 'field-hint' }, 'Mín. 8 caracteres, com maiúscula, minúscula e número'),
    ),

    e(
      'div',
      { className: 'form-group' },
      e('label', { htmlFor: 'reg-confirm-password' }, 'Confirmar senha'),
      e('input', {
        id: 'reg-confirm-password',
        type: showPassword ? 'text' : 'password',
        placeholder: '••••••••',
        value: formData.confirmPassword,
        onChange: (evt) => handleChange('confirmPassword', evt.target.value),
        disabled: loading,
        'aria-describedby': errors.confirmPassword ? 'reg-confirm-password-error' : null,
        className: errors.confirmPassword ? 'error' : '',
      }),
      errors.confirmPassword &&
        e('span', { id: 'reg-confirm-password-error', className: 'error-text' }, errors.confirmPassword),
    ),

    (authError || errors.submit) &&
      e('div', { className: 'error-box', role: 'alert' }, authError || errors.submit),

    e(
      'button',
      { type: 'submit', className: 'primary-button', disabled: loading },
      loading ? e('span', null, h(Icon, { name: 'refresh', size: 14 }), ' Criando empresa...') : 'Criar empresa',
    ),
  );
}
