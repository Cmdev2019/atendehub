import { render, screen, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    login: jest.fn(),
    registerCompany: jest.fn(),
    loading: false,
    error: null,
  }),
}));

import { LoginPage } from './LoginPage';

describe('LoginPage — alternância login/cadastro (B-9)', () => {
  it('começa no modo login', () => {
    render(h(LoginPage));
    expect(screen.getByText('Faça login em sua conta')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome da empresa')).not.toBeInTheDocument();
  });

  it('troca para o formulário de cadastro de empresa e volta para login', () => {
    render(h(LoginPage));

    fireEvent.click(screen.getByText('Criar empresa'));
    expect(screen.getByText('Crie a conta da sua empresa')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da empresa')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Fazer login'));
    expect(screen.getByText('Faça login em sua conta')).toBeInTheDocument();
  });
});
