import { render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { EmptyChatState } from './EmptyChatState';

describe('EmptyChatState (B-36)', () => {
  it('mostra a mensagem de nenhuma conversa selecionada', () => {
    render(h(EmptyChatState));
    expect(screen.getByText('Nenhuma mensagem no momento')).toBeInTheDocument();
  });
});
