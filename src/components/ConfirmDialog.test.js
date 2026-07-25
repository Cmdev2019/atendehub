import { render, screen, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog (B-13)', () => {
  it('não renderiza nada quando open=false', () => {
    render(h(ConfirmDialog, { open: false, message: 'x', onConfirm: jest.fn(), onCancel: jest.fn() }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renderiza título/mensagem/botões quando open=true', () => {
    render(h(ConfirmDialog, {
      open: true, title: 'Excluir usuário', message: 'Tem certeza?',
      confirmLabel: 'Excluir', cancelLabel: 'Manter', onConfirm: jest.fn(), onCancel: jest.fn(),
    }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Excluir usuário')).toBeInTheDocument();
    expect(screen.getByText('Tem certeza?')).toBeInTheDocument();
    expect(screen.getByText('Excluir')).toBeInTheDocument();
    expect(screen.getByText('Manter')).toBeInTheDocument();
  });

  it('chama onConfirm ao clicar no botão de confirmar', () => {
    const onConfirm = jest.fn();
    render(h(ConfirmDialog, { open: true, message: 'x', onConfirm, onCancel: jest.fn() }));

    fireEvent.click(screen.getByText('Confirmar'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('chama onCancel ao clicar em cancelar, no overlay e ao pressionar Escape', () => {
    const onCancel = jest.fn();
    render(h(ConfirmDialog, { open: true, message: 'x', onConfirm: jest.fn(), onCancel }));

    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('clicar dentro do card não fecha o modal (só o overlay fecha)', () => {
    const onCancel = jest.fn();
    render(h(ConfirmDialog, { open: true, title: 'Título', message: 'x', onConfirm: jest.fn(), onCancel }));

    fireEvent.click(screen.getByText('Título'));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
