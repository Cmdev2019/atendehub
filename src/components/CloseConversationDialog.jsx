import { createElement as h, useEffect, useRef } from 'react';
import { Icon } from './icons';

// Encerrar (B-31) pede o motivo do encerramento (B-32) antes de confirmar —
// vira dado real pro dashboard ("resolvidas x não resolvidas"). Modal
// dedicado (não o useConfirm genérico, B-13): a escolha é entre 2 ações
// primárias, não um confirmar/cancelar binário.
export function CloseConversationDialog({ open, contactName, onChoose, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return h(
    'div',
    { className: 'confirm-overlay', onClick: onCancel },
    h(
      'div',
      {
        className: 'confirm-dialog',
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-labelledby': 'close-dialog-title',
        'aria-describedby': 'close-dialog-message',
        onClick: (event) => event.stopPropagation(),
      },
      h(Icon, { name: 'check', size: 24, className: 'confirm-icon' }),
      h('h3', { id: 'close-dialog-title' }, 'Encerrar conversa'),
      h(
        'p',
        { id: 'close-dialog-message' },
        `Encerrar a conversa com ${contactName}? Ela sai da fila de atendimento. Qual foi o resultado do atendimento?`,
      ),
      h(
        'div',
        { className: 'confirm-actions' },
        h('button', { ref: cancelRef, type: 'button', className: 'btn-secondary', onClick: onCancel }, 'Cancelar'),
        h(
          'button',
          { type: 'button', className: 'primary-button danger', onClick: () => onChoose('UNRESOLVED') },
          'Não resolvido',
        ),
        h(
          'button',
          { type: 'button', className: 'primary-button', onClick: () => onChoose('RESOLVED') },
          'Resolvido',
        ),
      ),
    ),
  );
}
