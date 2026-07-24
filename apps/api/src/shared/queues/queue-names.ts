// ─────────────────────────────────────────────────────────────────────────────
// Nomes das queues do BullMQ
// Centralizados para evitar typos e facilitar refatoração
// ─────────────────────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  WEBHOOK: 'webhook',
  SLA_CHECK: 'sla-check',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
