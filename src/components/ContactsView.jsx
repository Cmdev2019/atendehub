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
  const [tagFilter, setTagFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  // Organização por tag (B-34) — mesmo catálogo de tags já usado em
  // conversas (B-27); alimenta tanto o filtro da lista quanto o seletor de
  // "adicionar tag" dentro do diálogo de edição.
  const [availableTags, setAvailableTags] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const response = await apiClient.getContacts({
        search: search || undefined,
        tagId: tagFilter || undefined,
        page,
        limit: PAGE_LIMIT,
      });
      setContacts(response?.data || []);
      setMeta(response?.meta || { total: 0, page: 1, totalPages: 1 });
    } catch (error) {
      setListError(error?.message || 'Não foi possível carregar os contatos.');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [search, tagFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const response = await apiClient.getTags();
        setAvailableTags(Array.isArray(response) ? response : response?.data ?? []);
      } catch (error) {
        console.warn('⚠️ Erro ao buscar tags:', error.message);
      }
    })();
  }, []);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleTagFilterChange = (event) => {
    setPage(1);
    setTagFilter(event.target.value);
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

  // Adicionar/remover tag aplica na hora (sem depender do botão "Salvar" do
  // form) — mesma ergonomia do CustomerPanel pra tags de conversa (B-27).
  // Atualiza o contato aberto no diálogo E a lista por trás dele, já que a
  // linha da tabela também mostra as tags.
  const handleAddTag = async (tagId) => {
    if (!editingContact) return;
    setFormError(null);
    try {
      await apiClient.addContactTag(editingContact.id, tagId);
      const refreshed = await apiClient.getContact(editingContact.id);
      setEditingContact(refreshed);
      load();
    } catch (error) {
      setFormError(error?.message || 'Não foi possível adicionar a tag.');
    }
  };

  const handleRemoveTag = async (tagId) => {
    if (!editingContact) return;
    setFormError(null);
    try {
      await apiClient.removeContactTag(editingContact.id, tagId);
      const refreshed = await apiClient.getContact(editingContact.id);
      setEditingContact(refreshed);
      load();
    } catch (error) {
      setFormError(error?.message || 'Não foi possível remover a tag.');
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
        'select',
        {
          className: 'contacts-tag-filter',
          'aria-label': 'Filtrar por tag',
          value: tagFilter,
          onChange: handleTagFilterChange,
        },
        h('option', { value: '' }, 'Todas as tags'),
        availableTags.map((tag) => h('option', { key: tag.id, value: tag.id }, tag.name)),
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
      ? h('p', { className: 'reports-empty' }, search || tagFilter ? 'Nenhum contato encontrado.' : 'Nenhum contato cadastrado ainda.')
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
                ['Nome', 'Telefone', 'E-mail', 'Canal', 'Tags', 'Conversas', 'Cadastrado em', ''].map((label) =>
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
                  h(
                    'td',
                    null,
                    (c.tags || []).length > 0
                      ? h(
                          'div',
                          { className: 'tag-list contacts-tag-list-cell' },
                          c.tags.map((tag) =>
                            h('span', { key: tag.id, className: 'tag', style: { backgroundColor: tag.color || undefined } }, tag.name),
                          ),
                        )
                      : '—',
                  ),
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
      availableTags,
      onAddTag: handleAddTag,
      onRemoveTag: handleRemoveTag,
      onSave: handleSave,
      onCancel: closeDialog,
      saving: formSaving,
      error: formError,
    }),
  );
}
