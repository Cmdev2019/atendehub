import { hostname } from 'os';

// ── Log estruturado padronizado (originalmente B-39, escopado a webhook;
// relocado de modules/webhook/webhook-log.util.ts na ACR de 2026-08-01) ────
// Formatador único, reaproveitado por qualquer evento nomeado do projeto que
// precise de log parseável por coletor (WebhookJobStarted, WebhookRetry,
// WebhookFailed, WebhookMovedToDLQ, IdempotencyCollisionResolved em
// MessageService/ConversationService...) — cada chamador passa só os campos
// que fazem sentido naquele momento, mas o formato de saída (chave=valor,
// `-` para ausente) é sempre o mesmo. Nunca foi específico de webhook de
// verdade (a assinatura só pede um nome de evento + um record de campos) —
// só morava na pasta errada até esta consolidação.
export function formatStructuredLog(event: string, fields: Record<string, unknown>): string {
  const parts = Object.entries(fields)
    .map(([key, value]) => `${key}=${value ?? '-'}`)
    .join(' ');
  return `${event} | ${parts}`;
}

// Identifica o processo/worker que processou o job — melhor esforço na
// ausência de infraestrutura de tracing distribuído (sem OpenTelemetry/APM
// no projeto hoje): hostname+pid já basta pra distinguir réplicas numa
// investigação de produção.
export const WORKER_ID = `${hostname()}:${process.pid}`;
