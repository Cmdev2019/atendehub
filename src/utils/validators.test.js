import { validators, validateForm } from './validators';

describe('Validators', () => {
  describe('email', () => {
    it('retorna erro se email vazio', () => {
      const result = validators.email('');
      expect(result).toBe('Email é obrigatório');
    });

    it('retorna erro se email inválido', () => {
      const result = validators.email('invalid-email');
      expect(result).toBe('Email inválido');
    });

    it('retorna null se email válido', () => {
      const result = validators.email('test@example.com');
      expect(result).toBeNull();
    });

    it('valida múltiplos emails válidos', () => {
      expect(validators.email('user@domain.co.uk')).toBeNull();
      expect(validators.email('test.email@example.com')).toBeNull();
    });
  });

  describe('password', () => {
    it('retorna erro se senha vazia', () => {
      const result = validators.password('');
      expect(result).toBe('Senha é obrigatória');
    });

    it('retorna erro se senha muito curta', () => {
      const result = validators.password('12345');
      expect(result).toBe('Senha deve ter no mínimo 6 caracteres');
    });

    it('retorna null se senha válida', () => {
      const result = validators.password('validPassword123');
      expect(result).toBeNull();
    });
  });

  describe('passwordStrength', () => {
    it('retorna null se senha vazia', () => {
      const result = validators.passwordStrength('');
      expect(result).toBeNull();
    });

    it('calcula força de senha fraca', () => {
      const result = validators.passwordStrength('abc');
      expect(result.strength).toBe('Fraca');
      expect(result.score).toBeLessThanOrEqual(2);
    });

    it('calcula força de senha média/forte', () => {
      const result = validators.passwordStrength('Abcdef123');
      expect(['Média', 'Forte']).toContain(result.strength);
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it('calcula força de senha forte', () => {
      const result = validators.passwordStrength('Abc123!@#');
      expect(result.strength).toBe('Forte');
      expect(result.score).toBeGreaterThanOrEqual(4);
    });

    it('verifica requirements', () => {
      const result = validators.passwordStrength('Abc123!@#');
      expect(result.requirements.uppercase).toBe(true);
      expect(result.requirements.lowercase).toBe(true);
      expect(result.requirements.number).toBe(true);
      expect(result.requirements.special).toBe(true);
      expect(result.requirements.length).toBe(true);
    });
  });

  describe('name', () => {
    it('retorna erro se nome vazio', () => {
      const result = validators.name('');
      expect(result).toBe('Nome é obrigatório');
    });

    it('retorna erro se nome muito curto', () => {
      const result = validators.name('Jo');
      expect(result).toBe('Nome deve ter no mínimo 3 caracteres');
    });

    it('retorna null se nome válido', () => {
      const result = validators.name('João Silva');
      expect(result).toBeNull();
    });
  });

  // B-9: nome da empresa no auto-cadastro
  describe('companyName', () => {
    it('retorna erro se vazio', () => {
      expect(validators.companyName('')).toBe('Nome da empresa é obrigatório');
    });

    it('retorna erro se muito curto', () => {
      expect(validators.companyName('A')).toBe('Nome da empresa deve ter no mínimo 2 caracteres');
    });

    it('retorna null se válido', () => {
      expect(validators.companyName('Café & Cia')).toBeNull();
    });
  });

  // B-9: mesma política de senha do backend (CreateUserDto/RegisterCompanyDto)
  describe('passwordPolicy', () => {
    it('retorna erro se vazia', () => {
      expect(validators.passwordPolicy('')).toBe('Senha é obrigatória');
    });

    it('retorna erro se menor que 8 caracteres', () => {
      expect(validators.passwordPolicy('Abc123')).toBe('Senha deve ter no mínimo 8 caracteres');
    });

    it('retorna erro sem maiúscula/minúscula/número', () => {
      expect(validators.passwordPolicy('abcdefgh')).toMatch(/maiúscula/);
      expect(validators.passwordPolicy('ABCDEFGH')).toMatch(/minúscula/);
      expect(validators.passwordPolicy('Abcdefgh')).toMatch(/número/);
    });

    it('retorna null quando atende a política inteira', () => {
      expect(validators.passwordPolicy('Senha123')).toBeNull();
    });
  });

  describe('confirmPassword', () => {
    it('retorna erro se confirmação vazia', () => {
      const result = validators.confirmPassword('', 'password');
      expect(result).toBe('Confirmação de senha é obrigatória');
    });

    it('retorna erro se senhas não conferem', () => {
      const result = validators.confirmPassword('password2', 'password1');
      expect(result).toBe('Senhas não conferem');
    });

    it('retorna null se senhas conferem', () => {
      const result = validators.confirmPassword('password', 'password');
      expect(result).toBeNull();
    });
  });
});

describe('validateForm', () => {
  it('valida múltiplos campos', () => {
    const formData = {
      email: 'invalid',
      password: '123',
      name: 'Jo',
    };
    const errors = validateForm(formData, ['email', 'password', 'name']);
    expect(Object.keys(errors).length).toBeGreaterThan(0);
    expect(errors.email).toBeTruthy();
    expect(errors.password).toBeTruthy();
    expect(errors.name).toBeTruthy();
  });

  it('retorna objeto vazio se sem erros', () => {
    const formData = {
      email: 'test@example.com',
      password: 'validPassword123',
      name: 'João Silva',
    };
    const errors = validateForm(formData, ['email', 'password', 'name']);
    expect(Object.keys(errors).length).toBe(0);
  });

  it('valida companyName (B-9)', () => {
    const errors = validateForm({ companyName: '' }, ['companyName']);
    expect(errors.companyName).toBeTruthy();

    const noErrors = validateForm({ companyName: 'Café & Cia' }, ['companyName']);
    expect(noErrors.companyName).toBeUndefined();
  });

  it('valida apenas campos solicitados', () => {
    const formData = {
      email: 'invalid',
      password: 'validPassword123',
    };
    const errors = validateForm(formData, ['email']);
    expect(errors.email).toBeTruthy();
    expect(errors.password).toBeUndefined();
  });
});
