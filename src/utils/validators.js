export const validators = {
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value) return 'Email é obrigatório';
    if (!emailRegex.test(value)) return 'Email inválido';
    return null;
  },

  password: (value) => {
    if (!value) return 'Senha é obrigatória';
    if (value.length < 6) return 'Senha deve ter no mínimo 6 caracteres';
    return null;
  },

  passwordStrength: (value) => {
    if (!value) return null;
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecial = /[@$!%*?&]/.test(value);
    const isLongEnough = value.length >= 8;

    const strength = [hasUpper, hasLower, hasNumber, hasSpecial, isLongEnough].filter(Boolean).length;

    return {
      score: strength,
      strength: strength <= 2 ? 'Fraca' : strength === 3 ? 'Média' : 'Forte',
      requirements: {
        uppercase: hasUpper,
        lowercase: hasLower,
        number: hasNumber,
        special: hasSpecial,
        length: isLongEnough,
      },
    };
  },

  name: (value) => {
    if (!value) return 'Nome é obrigatório';
    if (value.length < 3) return 'Nome deve ter no mínimo 3 caracteres';
    return null;
  },

  confirmPassword: (value, password) => {
    if (!value) return 'Confirmação de senha é obrigatória';
    if (value !== password) return 'Senhas não conferem';
    return null;
  },
};

export function validateForm(formData, fields) {
  const errors = {};

  fields.forEach((field) => {
    let error = null;

    switch (field) {
      case 'email':
        error = validators.email(formData.email);
        break;
      case 'password':
        error = validators.password(formData.password);
        break;
      case 'name':
        error = validators.name(formData.name);
        break;
      case 'confirmPassword':
        error = validators.confirmPassword(formData.confirmPassword, formData.password);
        break;
      default:
        break;
    }

    if (error) {
      errors[field] = error;
    }
  });

  return errors;
}
