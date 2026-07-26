import { render, screen, fireEvent, act } from '@testing-library/react';
import { createElement as h } from 'react';
import { ConfirmProvider } from '../context/ConfirmContext';

const mockLogout = jest.fn();
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

import { Sidebar } from './Sidebar';

// B-13: logout passou de confirm() nativo pro ConfirmDialog — este teste
// prova que a integração real funciona (não só o mecanismo isolado, já
// coberto por ConfirmContext.test.js).
describe('Sidebar — logout via modal de confirmação (B-13)', () => {
  beforeEach(() => {
    mockLogout.mockClear();
  });

  it('não desloga se o usuário cancelar no modal', async () => {
    render(h(ConfirmProvider, null, h(Sidebar)));

    fireEvent.click(screen.getByTitle('Fazer logout do sistema'));
    await screen.findByText('Deseja fazer logout?');

    await act(async () => {
      fireEvent.click(screen.getByText('Cancelar'));
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('desloga só depois de confirmar no modal', async () => {
    render(h(ConfirmProvider, null, h(Sidebar)));

    fireEvent.click(screen.getByTitle('Fazer logout do sistema'));
    await screen.findByText('Deseja fazer logout?');
    expect(mockLogout).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Confirmar'));
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

// B-14: a seção ativa do menu lateral só era indicada por CSS (.active) —
// sem aria-current, leitor de tela não sabia qual item estava selecionado.
describe('Sidebar — aria-current no item ativo (B-14)', () => {
  it('marca aria-current="page" só no item ativo', () => {
    render(h(ConfirmProvider, null, h(Sidebar, { activeView: 'settings' })));

    expect(screen.getByTitle('Configurações')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTitle('Caixa de Entrada')).not.toHaveAttribute('aria-current');
  });
});

// B-32: "Funis" (nunca teve tela) virou "Dashboard", 1ª opção do menu.
describe('Sidebar — Dashboard no lugar de Funis (B-32)', () => {
  it('Dashboard é o 1º item do menu e já está navegável', () => {
    render(h(ConfirmProvider, null, h(Sidebar, { activeView: 'dashboard', onNavigate: jest.fn() })));

    const items = screen.getAllByRole('button', { name: /Dashboard|Mensagens|Contatos|Relatórios|Config/ });
    expect(items[0]).toHaveAttribute('title', 'Dashboard');
    expect(items[0]).not.toBeDisabled();
    expect(screen.queryByTitle(/Funis/)).not.toBeInTheDocument();
  });

  it('clicar em Dashboard chama onNavigate', () => {
    const onNavigate = jest.fn();
    render(h(ConfirmProvider, null, h(Sidebar, { activeView: 'inbox', onNavigate })));

    fireEvent.click(screen.getByTitle('Dashboard'));

    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });
});
