import { render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { ConversationQueue } from './ConversationQueue';

const conversations = [
  { id: '1', contact: 'Maria Silva', messages: [], summary: 'Oi' },
  { id: '2', contact: 'João Souza', messages: [], summary: 'Olá' },
];

// B-14: a conversa aberta na fila só era indicada por CSS (.active) — sem
// aria-current, leitor de tela não sabia qual conversa estava selecionada.
describe('ConversationQueue — aria-current na conversa ativa (B-14)', () => {
  it('marca aria-current="true" só na conversa selecionada', () => {
    render(h(ConversationQueue, { activeId: '1', conversations, onSelect: jest.fn() }));

    const activeItem = screen.getByTitle('Maria Silva');
    const otherItem = screen.getByTitle('João Souza');

    expect(activeItem).toHaveAttribute('aria-current', 'true');
    expect(otherItem).not.toHaveAttribute('aria-current');
  });

  it('nenhuma conversa marcada quando activeId não corresponde a nenhum item', () => {
    render(h(ConversationQueue, { activeId: 'inexistente', conversations, onSelect: jest.fn() }));

    expect(screen.getByTitle('Maria Silva')).not.toHaveAttribute('aria-current');
    expect(screen.getByTitle('João Souza')).not.toHaveAttribute('aria-current');
  });
});
