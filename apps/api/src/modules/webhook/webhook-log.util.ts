import { hostname } from 'os';

// ── B-39: logs estruturados padronizados do fluxo de webhook ───────────────
// Um formatador só, reaproveitado por todo evento nomeado (WebhookJobStarted,
// WebhookRetry, WebhookJobSucceeded, WebhookFailed, WebhookMovedToDLQ,
// WebhookReprocessed) — cada chamador passa só os campos que fazem sentido
// naquele momento (ex.: `conversationId` não existe ainda em
// WebhookJobStarted), mas o formato de saída (chave=valor, `-` para
// ausente) é sempre o mesmo, parseável por qualquer coletor de log.
export function formatWebhookLog(event: string, fields: Record<string, unknown>): string {
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
