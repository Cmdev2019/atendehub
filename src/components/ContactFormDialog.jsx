import { createElement as h, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

const CHANNEL_LABELS = { WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', EMAIL: 'E-mail', CHAT: 'Chat do site' };
const CHANNEL_OPTIONS = Object.keys(CHANNEL_LABELS);

// Mesma regra do backend (CreateContactDto) — só dígitos, sem "+"/espaço/
// traço. Validar aqui evita mandar o form pro servidor só pra ele recusar.
const PHONE_PATTERN = /^\d{10,15}$/;

// Cadastro e edição de contato (B-34) — mesmo diálogo pros dois casos
// (`contact` presente = edição). Telefone/canal só existem no cadastro: o
// backend recusa mudar os dois depois de criado (UpdateContactDto omite
// ambos de propósito), então na edição eles aparecem só como leitura.
export function ContactFormDialog({ open, contact, onSave, onCancel, saving, error }) {
  const isEdit = !!contact;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState('WHATSAPP');
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? '');
    setPhone(contact?.phone ?? '');
    setEmail(contact?.email ?? '');
    setChannel(contact?.channel ?? 'WHATSAPP');
    nameRef.current?.focus();
  }, [open, contact]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const nameValid = name.trim().length >= 2;
  const phoneValid = isEdit || PHONE_PATTERN.test(phone.trim());
  const canSubmit = nameValid && phoneValid && !saving;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const payload = isEdit
      ? { name: name.trim(), email: email.trim() || undefined }
      : { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, channel };
    onSave(payload);
  };

  return h(
    'div',
    { className: 'confirm-overlay', onClick: onCancel },
    h(
      'div',
      {
        className: 'confirm-dialog contact-form-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'contact-form-title',
        onClick: (event) => event.stopPropagation(),
      },
      h('h3', { id: 'contact-form-title' }, isEdit ? 'Editar contato' : 'Novo contato'),
      error && h('div', { className: 'send-error', role: 'alert' }, h(Icon, { name: 'warning', size: 15 }), ` ${error}`),
      h(
        'form',
        { className: 'contact-form', onSubmit: handleSubmit },
        h(
          'div',
          { className: 'contact-form-field' },
          h('label', { htmlFor: 'contact-name' }, 'Nome'),
          h('input', {
            id: 'contact-name',
            ref: nameRef,
            type: 'text',
            value: name,
            onChange: (e) => setName(e.target.value),
            required: true,
            minLength: 2,
            maxLength: 100,
          }),
        ),
        isEdit
          ? h(
              'div',
              { className: 'contact-form-readonly' },
              h('div', null, h('span', null, 'Telefone'), h('strong', null, contact.phone)),
              h('div', null, h('span', null, 'Canal'), h('strong', null, CHANNEL_LABELS[contact.channel] || contact.channel)),
            )
          : h(
              'div',
              { className: 'contact-form-row' },
              h(
                'div',
                { className: 'contact-form-field' },
                h('label', { htmlFor: 'contact-phone' }, 'Telefone'),
                h('input', {
                  id: 'contact-phone',
                  type: 'tel',
                  value: phone,
                  onChange: (e) => setPhone(e.target.value),
                  placeholder: '5511999998888',
                  required: true,
                }),
                h('small', null, 'Somente números, com DDI e DDD (10 a 15 dígitos)'),
              ),
              h(
                'div',
                { className: 'contact-form-field' },
                h('label', { htmlFor: 'contact-channel' }, 'Canal'),
                h(
                  'select',
                  { id: 'contact-channel', value: channel, onChange: (e) => setChannel(e.target.value) },
                  CHANNEL_OPTIONS.map((c) => h('option', { key: c, value: c }, CHANNEL_LABELS[c])),
                ),
              ),
            ),
        h(
          'div',
          { className: 'contact-form-field' },
          h('label', { htmlFor: 'contact-email' }, 'E-mail (opcional)'),
          h('input', { id: 'contact-email', type: 'email', value: email, onChange: (e) => setEmail(e.target.value) }),
        ),
        h(
          'div',
          { className: 'confirm-actions' },
          h('button', { type: 'button', className: 'btn-secondary', onClick: onCancel }, 'Cancelar'),
          h(
            'button',
            { type: 'submit', className: 'primary-button', disabled: !canSubmit },
            saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar contato',
          ),
        ),
      ),
    ),
  );
}
