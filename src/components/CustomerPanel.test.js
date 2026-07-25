import { render, screen, fireEvent } from '@testing-library/react';
import { createElement as h } from 'react';
import { CustomerPanel } from './CustomerPanel';

const baseConversation = {
  contact: 'Marina Alves',
  phone: '+5511982340091',
  agent: 'Camila',
  channel: 'WhatsApp',
  wait: '5min',
  tags: [{ id: 'tag-1', name: 'Entrega', color: '#ef4444' }],
  timeline: [],
};

// B-27: backend de tags já existia, mas nada no frontend consumia — este é
// o 1º teste do componente (0 testes antes desta sessão).
describe('CustomerPanel — tags (B-27)', () => {
  it('renderiza as tags já atribuídas à conversa', () => {
    render(h(CustomerPanel, { conversation: baseConversation }));
    expect(screen.getByText('Entrega')).toBeInTheDocument();
  });

  it('mostra "Sem tags" quando a conversa não tem nenhuma', () => {
    render(h(CustomerPanel, { conversation: { ...baseConversation, tags: [] } }));
    expect(screen.getByText('Sem tags')).toBeInTheDocument();
  });

  it('chama onRemoveTag com o id da tag ao clicar no botão de remover', () => {
    const onRemoveTag = jest.fn();
    render(h(CustomerPanel, { conversation: baseConversation, onRemoveTag }));

    fireEvent.click(screen.getByRole('button', { name: /Remover tag Entrega/ }));

    expect(onRemoveTag).toHaveBeenCalledWith('tag-1');
  });

  it('não renderiza botão de remover sem onRemoveTag (ex.: sem permissão futura)', () => {
    render(h(CustomerPanel, { conversation: baseConversation }));
    expect(screen.queryByRole('button', { name: /Remover tag/ })).not.toBeInTheDocument();
  });

  it('lista só as tags ainda não atribuídas no seletor de adicionar', () => {
    const availableTags = [
      { id: 'tag-1', name: 'Entrega', color: '#ef4444' },
      { id: 'tag-2', name: 'Prioridade', color: '#f59e0b' },
    ];
    render(h(CustomerPanel, { conversation: baseConversation, availableTags, onAddTag: jest.fn() }));

    const select = screen.getByLabelText('Adicionar tag à conversa');
    expect(screen.queryByText('Entrega', { selector: 'option' })).not.toBeInTheDocument();
    expect(select).toHaveTextContent('Prioridade');
  });

  it('chama onAddTag com o id escolhido no seletor', () => {
    const onAddTag = jest.fn();
    const availableTags = [{ id: 'tag-2', name: 'Prioridade', color: '#f59e0b' }];
    render(h(CustomerPanel, { conversation: baseConversation, availableTags, onAddTag }));

    fireEvent.change(screen.getByLabelText('Adicionar tag à conversa'), { target: { value: 'tag-2' } });

    expect(onAddTag).toHaveBeenCalledWith('tag-2');
  });

  it('não mostra o seletor de adicionar quando não há tags disponíveis', () => {
    render(h(CustomerPanel, {
      conversation: baseConversation,
      availableTags: [{ id: 'tag-1', name: 'Entrega', color: '#ef4444' }],
      onAddTag: jest.fn(),
    }));

    expect(screen.queryByLabelText('Adicionar tag à conversa')).not.toBeInTheDocument();
  });
});
