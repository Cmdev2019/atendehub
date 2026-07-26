import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createElement as h } from 'react';

jest.mock('../services/api', () => ({
  apiClient: {
    getContacts: jest.fn(),
    createContact: jest.fn(),
    updateContact: jest.fn(),
    getContact: jest.fn(),
    getTags: jest.fn(),
    addContactTag: jest.fn(),
    removeContactTag: jest.fn(),
  },
}));

import { ContactsView } from './ContactsView';

const contactsPage1 = [
  { id: 'c1', name: 'Ana Silva', phone: '5511900000001', email: 'ana@email.com', channel: 'WHATSAPP', createdAt: '2026-07-01T10:00:00.000Z', tags: [{ id: 'tag-1', name: 'Entrega', color: '#ef4444' }], _count: { conversations: 2 } },
  { id: 'c2', name: 'Bruno Costa', phone: '5511900000002', email: null, channel: 'EMAIL', createdAt: '2026-07-02T10:00:00.000Z', tags: [], _count: { conversations: 0 } },
];

const availableTags = [
  { id: 'tag-1', name: 'Entrega', color: '#ef4444' },
  { id: 'tag-2', name: 'Prioridade', color: '#f59e0b' },
];

describe('ContactsView (B-34)', () => {
  let mockApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = require('../services/api').apiClient;
    mockApiClient.getTags.mockResolvedValue(availableTags);
  });

  it('carrega e mostra os contatos da 1ª página', async () => {
    mockApiClient.getContacts.mockResolvedValueOnce({
      data: contactsPage1,
      meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
    });

    render(h(ContactsView));

    await waitFor(() => expect(screen.queryByText('Carregando contatos…')).not.toBeInTheDocument());

    expect(mockApiClient.getContacts).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
  });

  it('mostra a mensagem certa quando não há contatos', async () => {
    mockApiClient.getContacts.mockResolvedValueOnce({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } });

    render(h(ContactsView));

    await waitFor(() => expect(screen.getByText('Nenhum contato cadastrado ainda.')).toBeInTheDocument());
  });

  it('buscar refaz a busca com o termo e volta pra página 1', async () => {
    mockApiClient.getContacts.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } });

    render(h(ContactsView));
    await waitFor(() => expect(mockApiClient.getContacts).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Buscar contato'), { target: { value: 'Marina' } });
    fireEvent.submit(screen.getByLabelText('Buscar contato').closest('form'));

    await waitFor(() =>
      expect(mockApiClient.getContacts).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Marina', page: 1 })),
    );
  });

  it('paginação: botão Próxima avança a página e refaz a busca', async () => {
    mockApiClient.getContacts.mockResolvedValueOnce({
      data: contactsPage1,
      meta: { total: 40, page: 1, limit: 20, totalPages: 2 },
    });
    mockApiClient.getContacts.mockResolvedValueOnce({
      data: [],
      meta: { total: 40, page: 2, limit: 20, totalPages: 2 },
    });

    render(h(ContactsView));
    await waitFor(() => expect(screen.getByText('Ana Silva')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() => expect(mockApiClient.getContacts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('"Novo contato" abre o diálogo de cadastro e cria um contato real', async () => {
    mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });
    mockApiClient.createContact.mockResolvedValueOnce({ id: 'c3', name: 'Novo Contato' });

    render(h(ContactsView));
    await waitFor(() => expect(screen.getByText('Ana Silva')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Novo contato/ }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Novo Contato' } });
    fireEvent.change(within(dialog).getByLabelText('Telefone'), { target: { value: '5511999998888' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar contato' }));

    await waitFor(() =>
      expect(mockApiClient.createContact).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Novo Contato', phone: '5511999998888', channel: 'WHATSAPP' }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('clicar em "Editar" abre o diálogo pré-preenchido e salva a edição', async () => {
    mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });
    mockApiClient.updateContact.mockResolvedValueOnce({ id: 'c1', name: 'Ana Silva Atualizada' });

    render(h(ContactsView));
    await waitFor(() => expect(screen.getByText('Ana Silva')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Nome').value).toBe('Ana Silva');

    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Ana Silva Atualizada' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mockApiClient.updateContact).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Ana Silva Atualizada' })),
    );
  });

  it('mostra erro do backend no diálogo sem fechá-lo (ex.: telefone duplicado)', async () => {
    mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });
    mockApiClient.createContact.mockRejectedValueOnce({ message: 'Já existe um contato com este número de telefone' });

    render(h(ContactsView));
    await waitFor(() => expect(screen.getByText('Ana Silva')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Novo contato/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Duplicado' } });
    fireEvent.change(within(dialog).getByLabelText('Telefone'), { target: { value: '5511900000001' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar contato' }));

    await screen.findByText('Já existe um contato com este número de telefone');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // B-34 (ampliação): organização por tag/grupo.
  describe('tags', () => {
    it('carrega o catálogo de tags e popula o filtro', async () => {
      mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });

      render(h(ContactsView));
      await waitFor(() => expect(screen.getByText('Ana Silva')).toBeInTheDocument());

      const filterSelect = screen.getByLabelText('Filtrar por tag');
      const options = Array.from(filterSelect.querySelectorAll('option')).map((o) => o.textContent);
      expect(options).toEqual(['Todas as tags', 'Entrega', 'Prioridade']);
    });

    it('trocar o filtro de tag refaz a busca com tagId e volta pra página 1', async () => {
      mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });

      render(h(ContactsView));
      await waitFor(() => expect(screen.getByText('Ana Silva')).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText('Filtrar por tag'), { target: { value: 'tag-1' } });

      await waitFor(() =>
        expect(mockApiClient.getContacts).toHaveBeenLastCalledWith(expect.objectContaining({ tagId: 'tag-1', page: 1 })),
      );
    });

    it('mostra os chips de tag na linha do contato', async () => {
      mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });

      render(h(ContactsView));

      await waitFor(() => expect(screen.getAllByText('Entrega').length).toBeGreaterThan(0));
    });

    it('adicionar tag no diálogo chama addContactTag, atualiza o diálogo e recarrega a lista', async () => {
      mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });
      mockApiClient.addContactTag.mockResolvedValueOnce({ id: 'c2', tags: [{ id: 'tag-2', name: 'Prioridade', color: '#f59e0b' }] });
      mockApiClient.getContact.mockResolvedValueOnce({ ...contactsPage1[1], tags: [{ id: 'tag-2', name: 'Prioridade', color: '#f59e0b' }] });

      render(h(ContactsView));
      await waitFor(() => expect(screen.getByText('Bruno Costa')).toBeInTheDocument());

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1]); // Bruno Costa (sem tags)
      const dialog = await screen.findByRole('dialog');
      const callsBefore = mockApiClient.getContacts.mock.calls.length;

      fireEvent.change(within(dialog).getByLabelText('Adicionar tag ao contato'), { target: { value: 'tag-2' } });

      expect(mockApiClient.addContactTag).toHaveBeenCalledWith('c2', 'tag-2');
      await waitFor(() => expect(mockApiClient.getContact).toHaveBeenCalledWith('c2'));
      await waitFor(() => expect(within(dialog).getByText('Prioridade')).toBeInTheDocument());
      await waitFor(() => expect(mockApiClient.getContacts.mock.calls.length).toBeGreaterThan(callsBefore));
    });

    it('remover tag no diálogo chama removeContactTag e atualiza o diálogo', async () => {
      mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });
      mockApiClient.removeContactTag.mockResolvedValueOnce({ id: 'c1', tags: [] });
      mockApiClient.getContact.mockResolvedValueOnce({ ...contactsPage1[0], tags: [] });

      render(h(ContactsView));
      await waitFor(() => expect(screen.getByText('Ana Silva')).toBeInTheDocument());

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]); // Ana Silva (tag-1)
      const dialog = await screen.findByRole('dialog');

      fireEvent.click(within(dialog).getByRole('button', { name: 'Remover tag Entrega' }));

      expect(mockApiClient.removeContactTag).toHaveBeenCalledWith('c1', 'tag-1');
      await waitFor(() => expect(within(dialog).getByText('Sem tags')).toBeInTheDocument());
    });

    it('erro ao adicionar tag aparece no diálogo sem fechá-lo', async () => {
      mockApiClient.getContacts.mockResolvedValue({ data: contactsPage1, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } });
      mockApiClient.addContactTag.mockRejectedValueOnce({ message: 'Não foi possível adicionar a tag.' });

      render(h(ContactsView));
      await waitFor(() => expect(screen.getByText('Bruno Costa')).toBeInTheDocument());

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[1]);
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Adicionar tag ao contato'), { target: { value: 'tag-1' } });

      await screen.findByText('Não foi possível adicionar a tag.');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
