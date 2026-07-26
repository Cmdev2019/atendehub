import { render, screen, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';
import { CloseConversationDialog } from './CloseConversationDialog';

const baseProps = {
  open: true,
  contactName: 'Marina Alves',
  onChoose: jest.fn(),
  onCancel: jest.fn(),
};

describe('CloseConversationDialog (B-31/B-32/B-36)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('não renderiza nada quando open=false', () => {
    const { container } = render(h(CloseConversationDialog, { ...baseProps, open: false }));
    expect(container).toBeEmptyDOMElement();
  });

  it('sempre abre na tela de escolha, mesmo reabrindo depois de ter ido pra tela de motivo', () => {
    const { rerender } = render(h(CloseConversationDialog, baseProps));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelado' }));
    expect(screen.getByLabelText('Descreva o motivo do cancelamento')).toBeInTheDocument();

    rerender(h(CloseConversationDialog, { ...baseProps, open: false }));
    rerender(h(CloseConversationDialog, baseProps));

    expect(screen.getByRole('button', { name: 'Resolvido' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Descreva o motivo do cancelamento')).not.toBeInTheDocument();
  });

  it('"Resolvido" chama onChoose com RESOLVED, sem motivo', () => {
    const onChoose = jest.fn();
    render(h(CloseConversationDialog, { ...baseProps, onChoose }));

    fireEvent.click(screen.getByRole('button', { name: 'Resolvido' }));

    expect(onChoose).toHaveBeenCalledWith('RESOLVED');
  });

  it('"Não resolvido" chama onChoose com UNRESOLVED, sem motivo', () => {
    const onChoose = jest.fn();
    render(h(CloseConversationDialog, { ...baseProps, onChoose }));

    fireEvent.click(screen.getByRole('button', { name: 'Não resolvido' }));

    expect(onChoose).toHaveBeenCalledWith('UNRESOLVED');
  });

  it('X fecha o diálogo sem chamar onChoose', () => {
    const onChoose = jest.fn();
    const onCancel = jest.fn();
    render(h(CloseConversationDialog, { ...baseProps, onChoose, onCancel }));

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onChoose).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('"Voltar à conversa" fecha sem chamar onChoose', () => {
    const onChoose = jest.fn();
    const onCancel = jest.fn();
    render(h(CloseConversationDialog, { ...baseProps, onChoose, onCancel }));

    fireEvent.click(screen.getByRole('button', { name: 'Voltar à conversa' }));

    expect(onChoose).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('Escape fecha sem chamar onChoose', () => {
    const onChoose = jest.fn();
    const onCancel = jest.fn();
    render(h(CloseConversationDialog, { ...baseProps, onChoose, onCancel }));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onChoose).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  describe('fluxo de "Cancelado" (B-36)', () => {
    it('clicar em "Cancelado" abre a tela de motivo, sem chamar onChoose ainda', () => {
      const onChoose = jest.fn();
      render(h(CloseConversationDialog, { ...baseProps, onChoose }));

      fireEvent.click(screen.getByRole('button', { name: 'Cancelado' }));

      expect(onChoose).not.toHaveBeenCalled();
      expect(screen.getByText('Motivo do cancelamento')).toBeInTheDocument();
      expect(screen.getByText(/Marina Alves está sendo cancelada/)).toBeInTheDocument();
    });

    it('"Confirmar cancelamento" fica desabilitado até preencher o motivo', () => {
      render(h(CloseConversationDialog, baseProps));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelado' }));

      const confirmBtn = screen.getByRole('button', { name: 'Confirmar cancelamento' });
      expect(confirmBtn).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Descreva o motivo do cancelamento'), { target: { value: '   ' } });
      expect(confirmBtn).toBeDisabled(); // só espaço em branco não conta

      fireEvent.change(screen.getByLabelText('Descreva o motivo do cancelamento'), { target: { value: 'Motivo real' } });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('confirmar chama onChoose com CANCELLED e o motivo (sem espaços nas pontas)', () => {
      const onChoose = jest.fn();
      render(h(CloseConversationDialog, { ...baseProps, onChoose }));

      fireEvent.click(screen.getByRole('button', { name: 'Cancelado' }));
      fireEvent.change(screen.getByLabelText('Descreva o motivo do cancelamento'), {
        target: { value: '  Contato sumiu.  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

      expect(onChoose).toHaveBeenCalledWith('CANCELLED', 'Contato sumiu.');
    });

    it('"Voltar" na tela de motivo retorna pra escolha sem chamar onChoose/onCancel', () => {
      const onChoose = jest.fn();
      const onCancel = jest.fn();
      render(h(CloseConversationDialog, { ...baseProps, onChoose, onCancel }));

      fireEvent.click(screen.getByRole('button', { name: 'Cancelado' }));
      fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

      expect(screen.getByRole('button', { name: 'Resolvido' })).toBeInTheDocument();
      expect(onChoose).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('X na tela de motivo fecha o diálogo inteiro (onCancel), não só volta', () => {
      const onCancel = jest.fn();
      render(h(CloseConversationDialog, { ...baseProps, onCancel }));

      fireEvent.click(screen.getByRole('button', { name: 'Cancelado' }));
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(onCancel).toHaveBeenCalled();
    });
  });
});
