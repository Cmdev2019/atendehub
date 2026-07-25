import { useContext } from 'react';
import { ConfirmContext } from '../context/ConfirmContext';

// Retorna a função confirm(message, options?) => Promise<boolean> — mesma
// ergonomia do confirm() nativo do navegador, só que via modal próprio (B-13).
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm deve ser usado dentro de ConfirmProvider');
  }
  return confirm;
}
