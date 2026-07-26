import { createElement as h, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

const MAX_REASON_LENGTH = 500;

// Encerrar (B-31) pede o motivo do encerramento (B-32/B-36) antes de
// confirmar — vira dado real pro dashboard ("resolvidas x não resolvidas x
// canceladas"). Modal dedicado (não o useConfirm genérico, B-13): a escolha
// é entre 3 ações primárias, não um confirmar/cancelar binário.
//
// "Cancelado" (B-36, pedido do usuário) é uma AÇÃO que encerra a conversa
// de verdade — diferente do antigo botão "Cancelar", que só fechava este
// diálogo sem mexer na conversa. Por isso o dismiss (desistir e continuar
// na mesma conversa) agora é só o X/Escape/clique fora — "Cancelado" nunca
// mais significa "não fazer nada".
export function CloseConversationDialog({ open, contactName, onChoose, onCancel }) {
  const [view, setView] = useState('choice'); // 'choice' | 'cancel-reason'
  const [reason, setReason] = useState('');
  const dismissRef = useRef(null);
  const reasonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setView('choice');
    setReason('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    if (view === 'choice') dismissRef.current?.focus();
    if (view === 'cancel-reason') reasonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, view, onCancel]);

  if (!open) return null;

  const reasonValid = reason.trim().length > 0;

  const handleConfirmCancel = (event) => {
    event.preventDefault();
    if (!reasonValid) return;
    onChoose('CANCELLED', reason.trim());
  };

  return h(
    'div',
    { className: 'confirm-overlay', onClick: onCancel },
    h(
      'div',
      {
        className: 'confirm-dialog close-dialog',
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-labelledby': 'close-dialog-title',
        'aria-describedby': 'close-dialog-message',
        onClick: (event) => event.stopPropagation(),
      },
      h('button', {
        type: 'button',
        className: 'confirm-dialog-dismiss',
        onClick: onCancel,
        title: 'Fechar sem encerrar a conversa',
        'aria-label': 'Fechar',
      }, h(Icon, { name: 'x', size: 16 })),

      view === 'choice'
        ? h(
            'div',
            null,
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
              h(
                'button',
                { ref: dismissRef, type: 'button', className: 'btn-secondary', onClick: onCancel },
                'Voltar à conversa',
              ),
              h(
                'button',
                { type: 'button', className: 'primary-button danger', onClick: () => setView('cancel-reason') },
                'Cancelado',
              ),
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
          )
        : h(
            'form',
            { onSubmit: handleConfirmCancel },
            h(Icon, { name: 'warning', size: 24, className: 'confirm-icon danger' }),
            h('h3', { id: 'close-dialog-title' }, 'Motivo do cancelamento'),
            h(
              'p',
              { id: 'close-dialog-message' },
              `Por que a conversa com ${contactName} está sendo cancelada? Essa justificativa fica registrada.`,
            ),
            h('textarea', {
              ref: reasonRef,
              className: 'close-dialog-reason',
              rows: 4,
              maxLength: MAX_REASON_LENGTH,
              value: reason,
              onChange: (e) => setReason(e.target.value),
              placeholder: 'Ex.: contato pediu para retornar depois e não respondeu mais.',
              required: true,
              'aria-label': 'Descreva o motivo do cancelamento',
            }),
            h(
              'div',
              { className: 'confirm-actions' },
              h('button', { type: 'button', className: 'btn-secondary', onClick: () => setView('choice') }, 'Voltar'),
              h(
                'button',
                { type: 'submit', className: 'primary-button danger', disabled: !reasonValid },
                'Confirmar cancelamento',
              ),
            ),
          ),
    ),
  );
}
