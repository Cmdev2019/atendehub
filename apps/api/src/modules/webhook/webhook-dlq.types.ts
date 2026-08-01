// ── B-39: shape de uma entrada da dead letter queue (webhook-dlq) ──────────
// Preenchida por WebhookProcessor#onFailed no momento da falha definitiva;
// consumida por WebhookDlqService (listagem/reprocessamento/descarte).
export interface WebhookDlqEntry {
  originalQueue: string;
  originalJobId: string;
  payload: { event: string; instance: string; data: any };
  headers: Record<string, string>;
  error: string;
  stack: string | null;
  attempts: number;
  lastException: string;
  timestamp: string;
  requestId: string | null;
  tenant: string | null;
  conversationId: string | null;
  messageId: string | null;
  status: 'MOVED_TO_DLQ';
  reason: string;
}
