import { render, screen, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';
import { ContactFormDialog } from './ContactFormDialog';

const baseProps = {
  open: true,
  contact: null,
  onSave: jest.fn(),
  onCancel: jest.fn(),
  saving: false,
  error: null,
};

describe('ContactFormDialog (B-34)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('não renderiza nada quando open=false', () => {
    const { container } = render(h(ContactFormDialog, { ...baseProps, open: false }));
    expect(container).toBeEmptyDOMElement();
  });

  it('cadastro: botão "Criar contato" fica desabilitado até nome e telefone válidos', () => {
    render(h(ContactFormDialog, baseProps));

    const submitBtn = screen.getByRole('button', { name: 'Criar contato' });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'João' } });
    expect(submitBtn).toBeDisabled(); // telefone ainda vazio

    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '123' } }); // curto demais
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '5511999998888' } });
    expect(submitBtn).not.toBeDisabled();
  });

  it('cadastro: onSave recebe name/phone/email/channel', () => {
    const onSave = jest.fn();
    render(h(ContactFormDialog, { ...baseProps, onSave }));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  João Souza  ' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '5511999998888' } });
    fireEvent.change(screen.getByLabelText('Canal'), { target: { value: 'EMAIL' } });
    fireEvent.change(screen.getByLabelText('E-mail (opcional)'), { target: { value: 'joao@email.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar contato' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'João Souza',
      phone: '5511999998888',
      email: 'joao@email.com',
      channel: 'EMAIL',
    });
  });

  it('edição: telefone/canal aparecem só como leitura, não como campo editável', () => {
    render(
      h(ContactFormDialog, {
        ...baseProps,
        contact: { id: 'c1', name: 'Ana', phone: '5511900000001', email: null, channel: 'WHATSAPP' },
      }),
    );

    expect(screen.queryByLabelText('Telefone')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Canal')).not.toBeInTheDocument();
    expect(screen.getByText('5511900000001')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
  });

  it('edição: onSave recebe só name/email, sem phone/channel', () => {
    const onSave = jest.fn();
    render(
      h(ContactFormDialog, {
        ...baseProps,
        onSave,
        contact: { id: 'c1', name: 'Ana', phone: '5511900000001', email: 'ana@email.com', channel: 'WHATSAPP' },
      }),
    );

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Atualizada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(onSave).toHaveBeenCalledWith({ name: 'Ana Atualizada', email: 'ana@email.com' });
  });

  it('edição: botão fica habilitado mesmo sem mexer no telefone (não é obrigatório de novo)', () => {
    render(
      h(ContactFormDialog, {
        ...baseProps,
        contact: { id: 'c1', name: 'Ana', phone: '5511900000001', email: null, channel: 'WHATSAPP' },
      }),
    );

    expect(screen.getByRole('button', { name: 'Salvar alterações' })).not.toBeDisabled();
  });

  it('mostra o erro passado por prop', () => {
    render(h(ContactFormDialog, { ...baseProps, error: 'Já existe um contato com este número de telefone' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Já existe um contato com este número de telefone');
  });

  it('Cancelar chama onCancel', () => {
    const onCancel = jest.fn();
    render(h(ContactFormDialog, { ...baseProps, onCancel }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('Escape chama onCancel', () => {
    const onCancel = jest.fn();
    render(h(ContactFormDialog, { ...baseProps, onCancel }));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });
});
