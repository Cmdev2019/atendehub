import { render, screen, fireEvent, act } from '@testing-library/react';
import { createElement as h, useState } from 'react';
import { ConfirmProvider } from './ConfirmContext';
import { useConfirm } from '../hooks/useConfirm';

// Componente de teste que expõe o resultado da Promise de confirm() na tela,
// simulando um call site real como Sidebar.jsx/SettingsPanel.jsx.
function Harness({ options }) {
  const confirm = useConfirm();
  const [result, setResult] = useState(null);

  const ask = async () => {
    const answer = await confirm('Excluir mesmo?', options);
    setResult(answer ? 'confirmado' : 'cancelado');
  };

  return h(
    'div',
    null,
    h('button', { onClick: ask }, 'perguntar'),
    result && h('span', null, result),
  );
}

describe('ConfirmContext / useConfirm (B-13)', () => {
  it('useConfirm fora do ConfirmProvider lança erro', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    function Standalone() {
      useConfirm();
      return null;
    }
    expect(() => render(h(Standalone))).toThrow('useConfirm deve ser usado dentro de ConfirmProvider');
    consoleSpy.mockRestore();
  });

  it('resolve true quando o usuário confirma', async () => {
    render(h(ConfirmProvider, null, h(Harness)));

    fireEvent.click(screen.getByText('perguntar'));
    expect(await screen.findByText('Excluir mesmo?')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Confirmar'));
    });

    expect(await screen.findByText('confirmado')).toBeInTheDocument();
  });

  it('resolve false quando o usuário cancela', async () => {
    render(h(ConfirmProvider, null, h(Harness)));

    fireEvent.click(screen.getByText('perguntar'));
    await screen.findByText('Excluir mesmo?');

    await act(async () => {
      fireEvent.click(screen.getByText('Cancelar'));
    });

    expect(await screen.findByText('cancelado')).toBeInTheDocument();
  });

  it('repassa options (danger/labels) pro modal', async () => {
    render(h(ConfirmProvider, null, h(Harness, { options: { danger: true, confirmLabel: 'Excluir' } })));

    fireEvent.click(screen.getByText('perguntar'));

    expect(await screen.findByText('Excluir')).toBeInTheDocument();
  });

  it('perguntas sucessivas não vazam resultado da anterior', async () => {
    render(h(ConfirmProvider, null, h(Harness)));

    fireEvent.click(screen.getByText('perguntar'));
    await screen.findByText('Excluir mesmo?');
    await act(async () => {
      fireEvent.click(screen.getByText('Cancelar'));
    });
    await screen.findByText('cancelado');

    fireEvent.click(screen.getByText('perguntar'));
    await screen.findByText('Excluir mesmo?');
    await act(async () => {
      fireEvent.click(screen.getByText('Confirmar'));
    });

    expect(await screen.findByText('confirmado')).toBeInTheDocument();
  });
});
