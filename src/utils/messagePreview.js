// Prévia de uma mensagem na fila de conversas (B-60): o texto, ou o rótulo do
// tipo quando não há texto. Módulo puro (sem serviços) — usado pelo hook
// useConversations e pelo ConversationQueue. Mesma tabela do backend
// (apps/api/src/modules/conversation/message-preview.ts): mudar uma exige
// mudar a outra. Sem emoji, conforme a convenção do projeto.
const PREVIEW_LABELS = {
  IMAGE: 'Imagem',
  VIDEO: 'Vídeo',
  AUDIO: 'Áudio',
  DOCUMENT: 'Documento',
  STICKER: 'Figurinha',
  LOCATION: 'Localização',
  CONTACT_CARD: 'Contato',
  REACTION: 'Reação',
};

export function messagePreview(message) {
  const text = message?.text?.trim();
  if (text) return text;
  return PREVIEW_LABELS[message?.mediaType] ?? 'Mensagem';
}
