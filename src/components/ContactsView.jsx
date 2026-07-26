import { createElement as h, useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { Icon } from './icons';
import { ContactFormDialog } from './ContactFormDialog';

const CHANNEL_LABELS = { WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', EMAIL: 'E-mail', CHAT: 'Chat do site' };
const PAGE_LIMIT = 20;

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

export function ContactsView() {
  const [contacts, setContacts] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const response = await apiClient.getContacts({ search: search || undefined, page, limit: PAGE_LIMIT });
      setContacts(response?.data || []);
      setMeta(response?.meta || { total: 0, page: 1, totalPages: 1 });
    } catch (error) {
      setListError(error?.message || 'Não foi possível carregar os contatos.');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const openCreate = () => {
    setEditingContact(null);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (contact) => {
    setEditingContact(contact);
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingContact(null);
    setFormError(null);
  };

  const handleSave = async (payload) => {
    setFormSaving(true);
    setFormError(null);
    try {
      if (editingContact) {
        await apiClient.updateContact(editingContact.id, payload);
      } else {
        await apiClient.createContact(payload);
        setPage(1); // contato novo precisa estar visível — garante que a página exibida o inclui
      }
      closeDialog();
      load();
    } catch (error) {
      setFormError(error?.message || 'Não foi possível salvar o contato.');
    } finally {
      setFormSaving(false);
    }
  };

  return h(
    'div',
    { className: 'contacts-view' },
    h(
      'div',
      { className: 'section-header' },
      h('h2', null, h(Icon, { name: 'users', size: 16 }), ' Contatos'),
    ),
    h(
      'div',
      { className: 'contacts-toolbar' },
      h(
        'form',
        { className: 'contacts-search-form', onSubmit: handleSearchSubmit },
        h('input', {
          type: 'search',
          className: 'search-input',
          placeholder: 'Buscar por nome, telefone ou e-mail...',
          value: searchInput,
          onChange: (e) => setSearchInput(e.target.value),
          'aria-label': 'Buscar contato',
        }),
      ),
      h(
        'button',
        { type: 'button', className: 'primary-button', onClick: openCreate },
        h(Icon, { name: 'plus', size: 14 }),
        ' Novo contato',
      ),
    ),
    listError && h('div', { className: 'send-error', role: 'alert' }, h(Icon, { name: 'warning', size: 15 }), ` ${listError}`),
    loading
      ? h('p', { className: 'dashboard-loading' }, 'Carregando contatos…')
      : contacts.length === 0
      ? h('p', { className: 'reports-empty' }, search ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado ainda.')
      : h(
          'div',
          { className: 'reports-table-wrap' },
          h(
            'table',
            { className: 'reports-table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                ['Nome', 'Telefone', 'E-mail', 'Canal', 'Conversas', 'Cadastrado em', ''].map((label) =>
                  h('th', { key: label || 'actions' }, label),
                ),
              ),
            ),
            h(
              'tbody',
              null,
              contacts.map((c) =>
                h(
                  'tr',
                  { key: c.id },
                  h('td', null, c.name),
                  h('td', null, c.phone),
                  h('td', null, c.email || '—'),
                  h('td', null, CHANNEL_LABELS[c.channel] || c.channel),
                  h('td', null, String(c._count?.conversations ?? 0)),
                  h('td', null, formatDate(c.createdAt)),
                  h(
                    'td',
                    null,
                    h('button', { type: 'button', className: 'btn-secondary', onClick: () => openEdit(c) }, 'Editar'),
                  ),
                ),
              ),
            ),
          ),
        ),
    meta.totalPages > 1 &&
      h(
        'div',
        { className: 'contacts-pagination' },
        h(
          'button',
          { type: 'button', className: 'btn-secondary', disabled: page <= 1, onClick: () => setPage((p) => p - 1) },
          'Anterior',
        ),
        h('span', null, `Página ${meta.page} de ${meta.totalPages} (${meta.total} contatos)`),
        h(
          'button',
          {
            type: 'button',
            className: 'btn-secondary',
            disabled: page >= meta.totalPages,
            onClick: () => setPage((p) => p + 1),
          },
          'Próxima',
        ),
      ),
    h(ContactFormDialog, {
      open: dialogOpen,
      contact: editingContact,
      onSave: handleSave,
      onCancel: closeDialog,
      saving: formSaving,
      error: formError,
    }),
  );
}
