import { MessageType } from '../../generated/prisma/client';
import { buildMessagePreview } from './message-preview';

describe('buildMessagePreview (B-42/B-60)', () => {
  it('usa o texto (ou a legenda) quando houver', () => {
    expect(buildMessagePreview(MessageType.TEXT, 'Oi')).toBe('Oi');
    expect(buildMessagePreview(MessageType.IMAGE, '  Foto do pedido  ')).toBe('Foto do pedido');
  });

  it.each([
    [MessageType.AUDIO, 'Áudio'],
    [MessageType.IMAGE, 'Imagem'],
    [MessageType.VIDEO, 'Vídeo'],
    [MessageType.DOCUMENT, 'Documento'],
    [MessageType.STICKER, 'Figurinha'],
    [MessageType.LOCATION, 'Localização'],
    [MessageType.CONTACT_CARD, 'Contato'],
  ])('sem texto, %s vira "%s"', (type, label) => {
    expect(buildMessagePreview(type, '')).toBe(label);
    expect(buildMessagePreview(type, null)).toBe(label);
  });

  it('tipo sem rótulo próprio vira "Mensagem" (nunca prévia vazia)', () => {
    expect(buildMessagePreview(MessageType.TEXT, '   ')).toBe('Mensagem');
  });
});
