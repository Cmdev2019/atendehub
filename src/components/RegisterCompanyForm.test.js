import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement as h } from 'react';

let mockAuthState;

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

import { RegisterCompanyForm } from './RegisterCompanyForm';

function fillForm({ companyName = 'Café & Cia', name = 'Fulano', email = 'fulano@empresa.com', password = 'Senha123', confirmPassword = 'Senha123' } = {}) {
  fireEvent.change(screen.getByLabelText('Nome da empresa'), { target: { value: companyName } });
  fireEvent.change(screen.getByLabelText('Seu nome'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: confirmPassword } });
}

describe('RegisterCompanyForm (B-9)', () => {
  beforeEach(() => {
    mockAuthState = {
      registerCompany: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
      loading: false,
      error: null,
    };
  });

  it('bloqueia o submit e mostra erros quando os campos estão vazios', async () => {
    render(h(RegisterCompanyForm));
    fireEvent.click(screen.getByText('Criar empresa'));

    expect(await screen.findByText('Nome da empresa é obrigatório')).toBeInTheDocument();
    expect(mockAuthState.registerCompany).not.toHaveBeenCalled();
  });

  it('bloqueia o submit quando a senha não segue a política do backend', async () => {
    render(h(RegisterCompanyForm));
    fillForm({ password: 'fraca', confirmPassword: 'fraca' });
    fireEvent.click(screen.getByText('Criar empresa'));

    expect(await screen.findByText(/no mínimo 8 caracteres/)).toBeInTheDocument();
    expect(mockAuthState.registerCompany).not.toHaveBeenCalled();
  });

  it('bloqueia o submit quando a confirmação de senha não confere', async () => {
    render(h(RegisterCompanyForm));
    fillForm({ confirmPassword: 'Outra123' });
    fireEvent.click(screen.getByText('Criar empresa'));

    expect(await screen.findByText('Senhas não conferem')).toBeInTheDocument();
    expect(mockAuthState.registerCompany).not.toHaveBeenCalled();
  });

  it('chama registerCompany com os dados do formulário e onSuccess ao concluir', async () => {
    const onSuccess = jest.fn();
    render(h(RegisterCompanyForm, { onSuccess }));
    fillForm();
    fireEvent.click(screen.getByText('Criar empresa'));

    await waitFor(() => expect(mockAuthState.registerCompany).toHaveBeenCalledWith({
      companyName: 'Café & Cia',
      name: 'Fulano',
      email: 'fulano@empresa.com',
      password: 'Senha123',
    }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('mostra o erro do backend (ex.: e-mail já existe) sem chamar onSuccess', async () => {
    mockAuthState.registerCompany.mockRejectedValueOnce(new Error('Já existe uma conta com este e-mail'));
    const onSuccess = jest.fn();
    render(h(RegisterCompanyForm, { onSuccess }));
    fillForm();
    fireEvent.click(screen.getByText('Criar empresa'));

    expect(await screen.findByText('Já existe uma conta com este e-mail')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
