import { MessageType } from '../../generated/prisma/client';

// ── B-81 (M-02): o que uma mensagem recebida do WhatsApp representa ─────────
// Antes, só os tipos "simples" eram reconhecidos; o resto virava texto vazio
// e a mídia não era baixada: documento com legenda, mensagens temporárias, de
// visualização única, editadas, de protocolo, enquetes, botões e listas. E a
// reação criava uma mensagem nova — numa conversa encerrada, abria conversa
// nova com saudação e menu. Aqui a mensagem é desembrulhada e classificada
// antes de qualquer gravação.

export type ClassifiedMessage =
  | { kind: 'content'; type: MessageType; content: string; mimeType?: string; fileName?: string }
  // Reação a uma mensagem existente — atualiza a original, não cria nada
  | { kind: 'reaction'; targetId: string; text: string }
  // Edição de uma mensagem existente — troca o texto da original
  | { kind: 'edit'; targetId: string; content: string }
  // Mensagem de controle (apagar, ajuste de mensagens temporárias, troca de
  // chaves...) — não é conteúdo de conversa
  | { kind: 'ignore'; reason: string };

// JIDs que não são conversas com um contato: grupos, status (stories),
// listas de transmissão e canais. Só grupo era filtrado.
export function isNonContactJid(jid: string): boolean {
  return (
    jid.endsWith('@g.us') ||
    jid === 'status@broadcast' ||
    jid.endsWith('@broadcast') ||
    jid.endsWith('@newsletter')
  );
}

// Invólucros que só carregam outra mensagem dentro (`{ message: {...} }`).
const WRAPPERS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
] as const;

export function unwrapMessage(message: any): any {
  let current = message;
  for (let depth = 0; depth < 5 && current; depth++) {
    const wrapper = WRAPPERS.find((w) => current[w]?.message);
    if (!wrapper) break;
    current = current[wrapper].message;
  }
  return current;
}

// protocolMessage.type: o WhatsApp manda número (14) ou o nome do enum
const isEditProtocol = (type: unknown) => type === 14 || type === 'MESSAGE_EDIT';

function editedText(edited: any): string {
  const inner = unwrapMessage(edited) ?? {};
  return (
    inner.conversation ??
    inner.extendedTextMessage?.text ??
    inner.imageMessage?.caption ??
    inner.videoMessage?.caption ??
    inner.documentMessage?.caption ??
    ''
  );
}

export function classifyMessage(raw: any): ClassifiedMessage {
  const message = unwrapMessage(raw);
  if (!message) return { kind: 'ignore', reason: 'sem conteúdo' };

  // Edição: chega como protocolMessage (tipo MESSAGE_EDIT) ou embrulhada em
  // editedMessage, sempre apontando a mensagem original pela key
  const protocol = message.protocolMessage ?? message.editedMessage?.message?.protocolMessage;
  if (protocol) {
    if (isEditProtocol(protocol.type) && protocol.key?.id) {
      return { kind: 'edit', targetId: protocol.key.id, content: editedText(protocol.editedMessage) };
    }
    return { kind: 'ignore', reason: `protocolMessage ${protocol.type ?? ''}`.trim() };
  }

  if (message.reactionMessage) {
    const { key, text } = message.reactionMessage;
    if (!key?.id) return { kind: 'ignore', reason: 'reação sem mensagem de origem' };
    return { kind: 'reaction', targetId: key.id, text: text ?? '' };
  }

  if (message.conversation) {
    return { kind: 'content', type: MessageType.TEXT, content: message.conversation };
  }
  if (message.extendedTextMessage?.text) {
    return { kind: 'content', type: MessageType.TEXT, content: message.extendedTextMessage.text };
  }

  if (message.imageMessage) {
    return {
      kind: 'content',
      type: MessageType.IMAGE,
      content: message.imageMessage.caption ?? '',
      mimeType: message.imageMessage.mimetype,
    };
  }
  if (message.videoMessage) {
    return {
      kind: 'content',
      type: MessageType.VIDEO,
      content: message.videoMessage.caption ?? '',
      mimeType: message.videoMessage.mimetype,
    };
  }
  if (message.audioMessage) {
    return { kind: 'content', type: MessageType.AUDIO, content: '', mimeType: message.audioMessage.mimetype };
  }
  if (message.documentMessage) {
    const doc = message.documentMessage;
    return {
      kind: 'content',
      type: MessageType.DOCUMENT,
      // Legenda (documentWithCaptionMessage) quando houver; senão o título
      content: doc.caption ?? doc.title ?? doc.fileName ?? '',
      mimeType: doc.mimetype,
      fileName: doc.fileName ?? doc.title,
    };
  }
  if (message.stickerMessage) {
    return { kind: 'content', type: MessageType.STICKER, content: '', mimeType: 'image/webp' };
  }
  if (message.locationMessage) {
    const { degreesLatitude, degreesLongitude } = message.locationMessage;
    return { kind: 'content', type: MessageType.LOCATION, content: `${degreesLatitude},${degreesLongitude}` };
  }
  if (message.contactMessage) {
    return { kind: 'content', type: MessageType.CONTACT_CARD, content: message.contactMessage.displayName };
  }

  // Enquete: o atendente vê a pergunta e as opções (sem suporte a votar daqui)
  const poll = message.pollCreationMessage ?? message.pollCreationMessageV2 ?? message.pollCreationMessageV3;
  if (poll) {
    const options = (poll.options ?? []).map((o: any) => `- ${o.optionName}`).join('\n');
    return { kind: 'content', type: MessageType.TEXT, content: `Enquete: ${poll.name ?? ''}${options ? `\n${options}` : ''}` };
  }
  if (message.pollUpdateMessage) {
    // Voto em enquete vem criptografado — não há o que mostrar
    return { kind: 'ignore', reason: 'voto em enquete' };
  }

  // Respostas a botões e listas: o que o cliente escolheu, em texto
  const choice =
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.templateButtonReplyMessage?.selectedDisplayText ??
    message.listResponseMessage?.title ??
    message.listResponseMessage?.singleSelectReply?.selectedRowId ??
    message.interactiveResponseMessage?.body?.text;
  if (choice) return { kind: 'content', type: MessageType.TEXT, content: choice };

  if (message.senderKeyDistributionMessage || message.messageContextInfo) {
    return { kind: 'ignore', reason: 'mensagem de controle' };
  }

  // Tipo desconhecido: registra como texto vazio (o atendente vê que chegou
  // algo) — melhor do que perder a mensagem em silêncio
  return { kind: 'content', type: MessageType.TEXT, content: '' };
}
