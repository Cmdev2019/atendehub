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
// Tags (organização por tag/grupo) só fazem sentido em contato que já
// existe — mesma restrição do backend (o endpoint de atribuir tag exige um
// contactId real) — então só aparecem em edição, nunca em cadastro.
export function ContactFormDialog({ open, contact, availableTags = [], onAddTag, onRemoveTag, onSave, onCancel, saving, error }) {
  const isEdit = !!contact;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState('WHATSAPP');
  const [tagToAdd, setTagToAdd] = useState('');
  const nameRef = useRef(null);

  const assignedTagIds = new Set((contact?.tags || []).map((t) => t.id));
  const selectableTags = availableTags.filter((t) => !assignedTagIds.has(t.id));

  const handleAddTag = (event) => {
    const tagId = event.target.value;
    setTagToAdd('');
    if (tagId && onAddTag) onAddTag(tagId);
  };

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
        isEdit &&
          h(
            'div',
            { className: 'contact-form-field' },
            h('label', null, 'Tags'),
            h(
              'div',
              { className: 'tag-list' },
              (contact.tags || []).length > 0
                ? contact.tags.map((tag) =>
                    h(
                      'span',
                      { key: tag.id, className: 'tag', style: { backgroundColor: tag.color || undefined } },
                      tag.name,
                      onRemoveTag &&
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'tag-remove',
                            onClick: () => onRemoveTag(tag.id),
                            title: `Remover tag "${tag.name}"`,
                            'aria-label': `Remover tag ${tag.name}`,
                          },
                          h(Icon, { name: 'x', size: 10 }),
                        ),
                    ),
                  )
                : h('span', { className: 'info-label' }, 'Sem tags'),
            ),
            onAddTag &&
              selectableTags.length > 0 &&
              h(
                'select',
                {
                  className: 'tag-add-select',
                  value: tagToAdd,
                  onChange: handleAddTag,
                  'aria-label': 'Adicionar tag ao contato',
                },
                h('option', { value: '' }, '+ Adicionar tag…'),
                selectableTags.map((tag) => h('option', { key: tag.id, value: tag.id }, tag.name)),
              ),
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
