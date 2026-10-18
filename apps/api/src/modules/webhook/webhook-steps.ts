// ── B-76 (M-01): etapas do webhook depois de gravar a mensagem ──────────────
// Antes, um retry do job via `isNew=false` e pulava tudo: se a prévia, o
// auto-atendimento ou os eventos falhassem depois de a mensagem ser gravada,
// ficavam sem acontecer para sempre. Agora a mensagem guarda a lista do que
// falta (Message.pendingWebhookSteps); cada etapa sai da lista ao terminar e
// o retry roda só o que sobrou. A decisão de cada etapa (ex.: conversa nova →
// saudação) é tomada uma vez, na primeira tentativa, e fica gravada — no
// retry a conversa já existe e `isNew` viria falso.
export const WEBHOOK_STEP = {
  MEDIA: 'media',
  PREVIEW: 'preview',
  AUTO_GREETING: 'auto_greeting',
  AUTO_REPLY: 'auto_reply',
  AUTO_ACTIVITY: 'auto_activity', // B-78: mídia do cliente com menu aberto
  EVENT_CONVERSATION_CREATED: 'event_conversation_created',
  EVENT_MESSAGE_NEW: 'event_message_new',
} as const;

export type WebhookStep = (typeof WEBHOOK_STEP)[keyof typeof WEBHOOK_STEP];

export function planWebhookSteps(params: {
  hasMedia: boolean;
  fromMe: boolean;
  isNewConversation: boolean;
  isTextReply: boolean;
}): WebhookStep[] {
  const { hasMedia, fromMe, isNewConversation, isTextReply } = params;
  const steps: WebhookStep[] = [];

  if (hasMedia) steps.push(WEBHOOK_STEP.MEDIA);
  steps.push(WEBHOOK_STEP.PREVIEW);
  // Auto-atendimento nunca reage a fromMe (o próprio negócio respondendo pelo
  // celular). Só texto conta como resposta de menu.
  if (!fromMe && isNewConversation) steps.push(WEBHOOK_STEP.AUTO_GREETING);
  else if (!fromMe && isTextReply) steps.push(WEBHOOK_STEP.AUTO_REPLY);
  // B-78: qualquer outra mensagem do cliente renova o prazo do menu
  else if (!fromMe) steps.push(WEBHOOK_STEP.AUTO_ACTIVITY);
  if (isNewConversation) steps.push(WEBHOOK_STEP.EVENT_CONVERSATION_CREATED);
  steps.push(WEBHOOK_STEP.EVENT_MESSAGE_NEW);

  return steps;
}
