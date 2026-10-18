// ─────────────────────────────────────────────────────────────────────────────
// Nomes das queues do BullMQ
// Centralizados para evitar typos e facilitar refatoração
// ─────────────────────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  WEBHOOK: 'webhook',
  // B-39: dead letter queue do webhook — jobs que esgotaram as tentativas
  // (ou foram classificados como falha permanente) caem aqui. Ninguém
  // consome automaticamente (sem @Process nesta queue); só sai por
  // reprocessamento manual via WebhookDlqService.
  WEBHOOK_DLQ: 'webhook-dlq',
  // B-76: download da mídia recebida, com retry próprio (MediaDownloadProcessor)
  MEDIA_DOWNLOAD: 'media-download',
  SLA_CHECK: 'sla-check',
  AUTO_ATTENDANCE_INACTIVITY: 'auto-attendance-inactivity',
  // B-78: reações do robô (saudação, resposta de menu, atividade), fora do
  // worker do webhook (AutoAttendanceProcessor)
  AUTO_ATTENDANCE: 'auto-attendance',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
