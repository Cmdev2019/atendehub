import { messagePreview } from './messagePreview';

describe('messagePreview (B-60)', () => {
  it('usa o texto quando houver', () => {
    expect(messagePreview({ text: 'Oi', mediaType: 'TEXT' })).toBe('Oi');
    expect(messagePreview({ text: '  legenda  ', mediaType: 'IMAGE' })).toBe('legenda');
  });

  it.each([
    ['AUDIO', 'Áudio'],
    ['IMAGE', 'Imagem'],
    ['VIDEO', 'Vídeo'],
    ['DOCUMENT', 'Documento'],
    ['STICKER', 'Figurinha'],
  ])('sem texto, %s vira "%s"', (mediaType, label) => {
    expect(messagePreview({ text: '', mediaType })).toBe(label);
  });

  it('nunca devolve prévia vazia', () => {
    expect(messagePreview({ text: '', mediaType: 'TEXT' })).toBe('Mensagem');
    expect(messagePreview(null)).toBe('Mensagem');
  });
});
