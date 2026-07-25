import { createElement as h, useEffect, useRef } from 'react';
import { Icon } from './icons';

const e = h;

// Modal de confirmação (B-13) — substitui o confirm() nativo do navegador
// nas ações destrutivas. Puramente apresentacional; o estado/promise fica
// no ConfirmContext (useConfirm).
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // Cancelar é a ação segura por padrão — foca nela ao abrir.
    cancelRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return e(
    'div',
    { className: 'confirm-overlay', onClick: onCancel },
    e(
      'div',
      {
        className: 'confirm-dialog',
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-labelledby': 'confirm-dialog-title',
        'aria-describedby': 'confirm-dialog-message',
        onClick: (event) => event.stopPropagation(),
      },
      e(Icon, { name: 'warning', size: 24, className: danger ? 'confirm-icon danger' : 'confirm-icon' }),
      e('h3', { id: 'confirm-dialog-title' }, title || 'Confirmar ação'),
      e('p', { id: 'confirm-dialog-message' }, message),
      e(
        'div',
        { className: 'confirm-actions' },
        e('button', { ref: cancelRef, type: 'button', className: 'btn-secondary', onClick: onCancel }, cancelLabel),
        e(
          'button',
          { type: 'button', className: danger ? 'primary-button danger' : 'primary-button', onClick: onConfirm },
          confirmLabel,
        ),
      ),
    ),
  );
}
