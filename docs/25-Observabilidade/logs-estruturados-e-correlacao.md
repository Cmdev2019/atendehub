# Logs estruturados, correlação e métricas

> Decisão arquitetural correspondente: [ADR-0008](../05-ADR/ADR-0008-observabilidade.md).

## Estratégia de instrumentação

Sem OpenTelemetry/APM no projeto hoje (ver ADR-0008) — a correlação é feita com 2 mecanismos
complementares, cada um cobrindo um mundo diferente:

| Mundo | Mecanismo | Arquivo |
|---|---|---|
| Ciclo síncrono de requisição HTTP | `AsyncLocalStorage` (`requestContext`), injeta `requestId` automaticamente em todo log via Winston | `shared/logging/request-context.ts`, `request-id.middleware.ts`, `winston.logger.ts` |
| Job assíncrono de fila (Bull) | Threading explícito — `requestId` copiado do `AsyncLocalStorage` pro payload do job na hora de enfileirar | `webhook.controller.ts:121` (bridge), `webhook.processor.ts` (consumo) |

**Nunca** presuma que `getRequestId()` funciona dentro de um `@Process()`/processor — ele só enxerga o
contexto de uma requisição HTTP em andamento. Um job Bull roda fora dessa continuação.

## Padrão de log estruturado

Todo log de evento nomeado (não uma mensagem solta de debug) usa `formatStructuredLog(evento, campos)`,
de `shared/logging/structured-log.util.ts`:

```ts
this.logger.warn(formatStructuredLog('IdempotencyCollisionResolved', { resource: 'Message', externalId }));
// → "IdempotencyCollisionResolved | resource=Message externalId=wa-123"
```

Formato `Evento | chave=valor chave=valor`, `-` para campo ausente — parseável por qualquer coletor de
log (ELK, CloudWatch, Loki) sem parsing customizado. Consolidado nesta ACR: existia só em
`modules/webhook/` (B-39); relocado pra `shared/logging/` porque nunca foi específico de webhook (a
assinatura só pede nome de evento + record de campos) e já é reusado por `MessageService`/
`ConversationService` (colisão de `P2002`, B-48/B-49).

## Catálogo de eventos estruturados hoje

| Evento | Onde | Nível |
|---|---|---|
| `WebhookJobStarted` | `webhook.processor.ts` | debug |
| `WebhookJobSucceeded` | `webhook.processor.ts` | log |
| `WebhookRetry` / `WebhookFailed` | `webhook.processor.ts` | error |
| `WebhookMovedToDLQ` | `webhook.processor.ts` | error |
| `WebhookStalled` | `webhook.processor.ts` | warn |
| `WebhookReprocessed` | `webhook-dlq.service.ts` | log |
| `IdempotencyCollisionResolved` | `MessageService#createUnique`, `ConversationService#upsertFromWebhook` | **warn** — é o mecanismo de proteção funcionando como projetado, nunca `error` |

## Política de dado sensível em log

Nunca logar e-mail, telefone completo, conteúdo de mensagem ou qualquer PII. Convenção já seguida no
projeto (ver `auth.service.ts`: "Nunca logar o e-mail (PII) — id já é suficiente pra correlacionar").
`IdempotencyCollisionResolved` loga `externalId` (id técnico da mensagem no WhatsApp, não dado do
cliente) e `contactId` (id interno, não telefone) — seguro por construção.

## Catálogo de métricas expostas

Único serviço de métricas do projeto hoje: `WebhookMetricsService` (`modules/webhook/`) — contadores em
memória (sucesso/falha/retry/DLQ da fila de webhook), expostos em `GET /webhooks/metrics` no formato de
exposição do Prometheus, sem depender da lib `prom-client`.

**Limitação conhecida (mesma classe do achado B-46):** contadores são por processo — com múltiplas
réplicas, cada uma reporta só a própria fatia, sem soma automática. Ver `ROADMAP_ESTABILIZACAO.md`, B-46,
para o padrão recomendado (Redis com TTL) quando isso for endereçado.

## Correlação entre trace, log e métrica — guia de investigação

1. Requisição HTTP com problema → pegar `x-request-id` da resposta (sempre presente, gerado ou
   reaproveitado pelo `RequestIdMiddleware`).
2. Se o problema envolve processamento de webhook → o mesmo `requestId` aparece em todo log
   `WebhookJob*`/`WebhookFailed`/`WebhookMovedToDLQ` daquele evento (threading explícito, ver acima).
3. Se o problema é uma duplicata suspeita de `Message`/`Conversation` → grep por
   `IdempotencyCollisionResolved` com o `externalId`/`contactId` em questão — confirma se a proteção foi
   exercitada (e portanto não deveria ter duplicata) ou se o evento nunca chegou a colidir.
4. `WORKER_ID` (`hostname:pid`) em todo log de processor distingue qual réplica/processo tratou o job —
   único substituto de tracing distribuído disponível hoje.
