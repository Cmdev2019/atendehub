import { createElement as h, createContext, useState, useCallback } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

export const ConfirmContext = createContext(null);

// B-13: substitui confirm()/alert() nativos do navegador por um modal
// próprio, sem precisar reescrever cada callback como componente — a API
// imperativa (`await confirm(mensagem)`) é a mesma ergonomia do confirm()
// nativo, só que resolvida por uma Promise em vez de bloquear a thread.
export function ConfirmProvider({ children }) {
  // null = fechado. Quando aberto, guarda a mensagem/opções + o resolve()
  // da Promise pendente, pra ser chamado pelo clique em confirmar/cancelar.
  const [pending, setPending] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setPending({ message, ...options, resolve });
    });
  }, []);

  const handleConfirm = () => {
    pending?.resolve(true);
    setPending(null);
  };

  const handleCancel = () => {
    pending?.resolve(false);
    setPending(null);
  };

  return h(
    ConfirmContext.Provider,
    { value: confirm },
    children,
    h(ConfirmDialog, {
      open: !!pending,
      title: pending?.title,
      message: pending?.message,
      confirmLabel: pending?.confirmLabel,
      cancelLabel: pending?.cancelLabel,
      danger: pending?.danger,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    }),
  );
}
