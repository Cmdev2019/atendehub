import { MessageType } from '../../generated/prisma/client';

// Rótulo da prévia quando a mensagem não tem texto (B-42/B-60). Sem emoji,
// conforme a convenção do projeto. O front usa a mesma tabela em
// src/utils/messagePreview.js — mudar um exige mudar o outro.
const PREVIEW_LABELS: Partial<Record<MessageType, string>> = {
  IMAGE: 'Imagem',
  VIDEO: 'Vídeo',
  AUDIO: 'Áudio',
  DOCUMENT: 'Documento',
  STICKER: 'Figurinha',
  LOCATION: 'Localização',
  CONTACT_CARD: 'Contato',
  REACTION: 'Reação',
};

/**
 * Texto da prévia da conversa na fila: o conteúdo (ou a legenda) quando
 * houver; senão, o rótulo do tipo. Antes, mídia sem legenda (áudio, o caso
 * mais comum) não gerava prévia nenhuma — e por isso nem atualizava a
 * conversa (B-42).
 */
export function buildMessagePreview(type: MessageType, content?: string | null): string {
  const text = content?.trim();
  if (text) return text;
  return PREVIEW_LABELS[type] ?? 'Mensagem';
}
