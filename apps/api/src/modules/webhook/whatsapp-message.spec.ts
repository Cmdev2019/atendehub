import { classifyMessage, isNonContactJid, unwrapMessage } from './whatsapp-message';

describe('classifyMessage', () => {
  const content = (message: any) => {
    const result = classifyMessage(message);
    if (result.kind !== 'content') throw new Error(`esperado content, veio ${result.kind}`);
    const { kind: _k, ...rest } = result;
    return rest;
  };

  // Tipos que já eram reconhecidos (antes testados via extractMessageContent)
  it('texto simples e estendido', () => {
    expect(content({ conversation: 'Olá' })).toEqual({ type: 'TEXT', content: 'Olá' });
    expect(content({ extendedTextMessage: { text: 'Com link' } })).toEqual({ type: 'TEXT', content: 'Com link' });
  });

  // B-50: a URL do payload nunca é extraída — a mídia só vem da Evolution.
  it('imagem com legenda, sem expor a URL do payload', () => {
    expect(content({ imageMessage: { caption: 'Legenda', mimetype: 'image/jpeg', url: 'https://x/img.enc' } })).toEqual({
      type: 'IMAGE',
      content: 'Legenda',
      mimeType: 'image/jpeg',
    });
  });

  it('figurinha, documento e localização', () => {
    expect(content({ stickerMessage: { url: 'x' } })).toEqual({ type: 'STICKER', content: '', mimeType: 'image/webp' });
    expect(content({ documentMessage: { title: 'contrato.pdf', mimetype: 'application/pdf' } })).toEqual({
      type: 'DOCUMENT',
      content: 'contrato.pdf',
      mimeType: 'application/pdf',
      fileName: 'contrato.pdf',
    });
    expect(content({ locationMessage: { degreesLatitude: -23.5, degreesLongitude: -46.6 } })).toEqual({
      type: 'LOCATION',
      content: '-23.5,-46.6',
    });
  });

  it('tipo desconhecido cai em texto vazio; mensagem ausente é ignorada', () => {
    expect(content({})).toEqual({ type: 'TEXT', content: '' });
    expect(classifyMessage(undefined)).toEqual({ kind: 'ignore', reason: 'sem conteúdo' });
  });

  // ── B-81 (M-02): tipos que viravam texto vazio ou mensagem indevida ──────
  it.each([
    ['temporária', { ephemeralMessage: { message: { conversation: 'some em 7 dias' } } }],
    ['visualização única', { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg', caption: 'some em 7 dias' } } } }],
    ['temporária + visualização única', { ephemeralMessage: { message: { viewOnceMessage: { message: { conversation: 'some em 7 dias' } } } } }],
  ])('desembrulha mensagem %s', (_label, message) => {
    expect(content(message).content).toBe('some em 7 dias');
  });

  it('documento com legenda: legenda no conteúdo, nome do arquivo preservado, mídia baixável', () => {
    expect(
      content({
        documentWithCaptionMessage: {
          message: { documentMessage: { caption: 'Segue o laudo', fileName: 'laudo.pdf', mimetype: 'application/pdf' } },
        },
      }),
    ).toEqual({ type: 'DOCUMENT', content: 'Segue o laudo', mimeType: 'application/pdf', fileName: 'laudo.pdf' });
  });

  it('reação aponta a mensagem original (texto vazio = reação removida)', () => {
    expect(classifyMessage({ reactionMessage: { key: { id: 'wa-1' }, text: '👍' } })).toEqual({
      kind: 'reaction',
      targetId: 'wa-1',
      text: '👍',
    });
    expect(classifyMessage({ reactionMessage: { key: { id: 'wa-1' }, text: '' } })).toEqual({
      kind: 'reaction',
      targetId: 'wa-1',
      text: '',
    });
  });

  it.each([
    ['protocolMessage', { protocolMessage: { type: 14, key: { id: 'wa-1' }, editedMessage: { conversation: 'texto novo' } } }],
    [
      'editedMessage',
      { editedMessage: { message: { protocolMessage: { type: 'MESSAGE_EDIT', key: { id: 'wa-1' }, editedMessage: { extendedTextMessage: { text: 'texto novo' } } } } } },
    ],
  ])('edição via %s troca o texto da mensagem original', (_label, message) => {
    expect(classifyMessage(message)).toEqual({ kind: 'edit', targetId: 'wa-1', content: 'texto novo' });
  });

  it.each([
    ['apagar para todos', { protocolMessage: { type: 0, key: { id: 'wa-1' } } }],
    ['ajuste de mensagens temporárias', { protocolMessage: { type: 3 } }],
    ['troca de chaves', { senderKeyDistributionMessage: { groupId: 'x' } }],
    ['voto em enquete', { pollUpdateMessage: { vote: {} } }],
  ])('mensagem de controle (%s) é ignorada', (_label, message) => {
    expect(classifyMessage(message).kind).toBe('ignore');
  });

  it('enquete mostra pergunta e opções', () => {
    expect(
      content({ pollCreationMessageV3: { name: 'Melhor horário?', options: [{ optionName: 'Manhã' }, { optionName: 'Tarde' }] } }),
    ).toEqual({ type: 'TEXT', content: 'Enquete: Melhor horário?\n- Manhã\n- Tarde' });
  });

  it.each([
    ['botão', { buttonsResponseMessage: { selectedDisplayText: 'Quero agendar' } }],
    ['lista', { listResponseMessage: { title: 'Quero agendar' } }],
    ['template', { templateButtonReplyMessage: { selectedDisplayText: 'Quero agendar' } }],
  ])('resposta de %s vira o texto escolhido', (_label, message) => {
    expect(content(message)).toEqual({ type: 'TEXT', content: 'Quero agendar' });
  });

  it('messageContextInfo junto de texto não atrapalha', () => {
    expect(content({ conversation: 'Oi', messageContextInfo: { deviceListMetadata: {} } }).content).toBe('Oi');
  });

  it('unwrapMessage para em mensagem sem invólucro', () => {
    const msg = { conversation: 'x' };
    expect(unwrapMessage(msg)).toBe(msg);
  });
});

describe('isNonContactJid (B-81)', () => {
  it.each([['123@g.us'], ['status@broadcast'], ['123@broadcast'], ['123@newsletter']])('%s não é conversa com contato', (jid) => {
    expect(isNonContactJid(jid)).toBe(true);
  });

  it.each([['5511999999999@s.whatsapp.net'], ['123456@lid']])('%s é contato', (jid) => {
    expect(isNonContactJid(jid)).toBe(false);
  });
});
