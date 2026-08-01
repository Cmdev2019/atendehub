# ADR-0008 — Observabilidade: correlação via AsyncLocalStorage no HTTP, threading explícito na fila

- **Status:** Aceita
- **Data:** 2026-08-01
- **Decisores:** Engenharia (ACR, formaliza decisões de B-39/B-48/B-49)
- **Contexto técnico:** `apps/api/src/shared/logging/`, `apps/api/src/modules/webhook/webhook-metrics.service.ts`

## Contexto

O projeto precisa correlacionar logs da mesma operação (mesma requisição HTTP, ou mesmo job de fila) sem exigir que cada service receba e repasse manualmente um id de correlação em toda chamada. Dois mundos coexistem: o ciclo de vida síncrono de uma requisição HTTP (controller → service → Prisma, tudo na mesma call stack/continuação async) e o processamento assíncrono de um job Bull (roda depois, possivelmente em outro tick de evento ou outro processo). Vale um único `CorrelationContext` cobrindo os dois?

## Alternativas consideradas

### Alternativa A — Um único `CorrelationContext` via `AsyncLocalStorage`, também dentro do processor de fila
- **Prós:** um só mecanismo pra entender.
- **Contras:** tecnicamente inviável sem um passo intermediário — `AsyncLocalStorage.run()` só propaga para a continuação assíncrona que ele efetivamente envolve; quando o `WebhookController` enfileira um job e devolve `200` (B-39: fire-and-forget, resposta HTTP não espera o processamento), a requisição HTTP original **termina** ali. O job Bull é pego por um worker depois — minutos depois, possivelmente em outro processo/réplica — fora de qualquer continuação da requisição original. Não existe `AsyncLocalStorage` que atravesse essa fronteira sozinho.
- **Custo estimado:** N/A — não resolve o problema sem um segundo mecanismo de qualquer forma.

### Alternativa B — `AsyncLocalStorage` pro ciclo HTTP (já existe: `request-context.ts`) + threading explícito do `requestId` no payload do job pra continuar a correlação do outro lado
- **Prós:** cada mecanismo resolve exatamente o problema do seu mundo. HTTP: `RequestIdMiddleware` cria/reaproveita o `x-request-id`, `requestContext.run()` disponibiliza via `getRequestId()` pra qualquer log emitido durante a requisição (incluindo o Winston global, que injeta `requestId` automaticamente em todo log — `winston.logger.ts`). Na borda exata onde a requisição HTTP vira um job assíncrono (`WebhookController`, ao enfileirar), o valor de `getRequestId()` é lido uma vez e gravado explicitamente em `WebhookJobData.requestId` — a "ponte" entre os dois mundos. Do lado do processor, `WebhookProcessor` usa esse campo explicitamente em todo log estruturado (`formatStructuredLog`), sem tentar (nem poder) reconstituir o `AsyncLocalStorage` original.
- **Contras:** dois mecanismos, não um — exige entender a fronteira pra saber qual usar onde.
- **Custo estimado:** baixo — já implementado, testado.

## Decisão

**Alternativa B**, já em produção desde B-39. Esta ADR formaliza por que não existe (nem deveria existir) um único `CorrelationContext` cobrindo os dois mundos: a fronteira HTTP→fila é uma fronteira real de continuação assíncrona, não uma escolha de design arbitrária.

## Consequências

### Positivas
- Correlação completa e correta nos dois mundos, sem gambiarra tentando forçar `AsyncLocalStorage` a atravessar uma fronteira de processo/fila.
- Estrutura de log única (`formatStructuredLog`, relocado de `modules/webhook/` para `shared/logging/` nesta ACR — usado hoje também pelas colisões de `P2002` de `MessageService`/`ConversationService`, ver ADR-0002) — mesmo formato chave=valor em toda parte do projeto que loga evento estruturado.

### Negativas — risco residual identificado nesta ACR
- Os logs de `IdempotencyCollisionResolved` (B-48/B-49, `MessageService`/`ConversationService`) usam `externalId`/`contactId` como chave de correlação, **não** `requestId`. Isso é uma limitação real: `MessageService#createUnique` e `ConversationService#upsertFromWebhook` são chamados de dentro de `WebhookService#handleEvent`, que roda dentro de `WebhookProcessor` (job Bull) — fora do `AsyncLocalStorage` da requisição HTTP original (mesma fronteira desta ADR) — e hoje **não recebem** o `requestId` do job como parâmetro explícito (diferente de como `WebhookProcessor` já faz pros seus próprios logs). Threading completo exigiria alterar a assinatura de `createUnique`/`upsertFromWebhook` e todos os chamadores (incluindo `SendMessageService`, que não tem um `requestId` de job — só um ciclo HTTP síncrono). Avaliado e adiado nas PRRs de B-48 e B-49: `externalId`/`contactId` já são chave de correlação natural suficiente pra investigar uma colisão específica; o ganho de threading completo é incerto até haver volume real de colisões em produção que justifique o esforço.

### Neutras / a observar
- `WebhookMetricsService` (contadores em memória, formato Prometheus) é a única métrica agregada do projeto — não correlaciona por request, é global ao processo. Sofre do mesmo problema de estado por réplica que B-46 documenta pra outros `Map`s em memória (`avatarFetchedAt`, `connectedClients`) — métricas de réplicas diferentes não se somam sozinhas hoje.

## Quando implementar observabilidade nova (diretriz derivada)

- Log estruturado: sempre `formatStructuredLog(evento, campos)`, nunca string interpolada à mão — grep/parse consistente em qualquer coletor.
- Dentro do ciclo HTTP síncrono: `getRequestId()` já funciona automaticamente via Winston, não precisa passar nada explicitamente.
- Atravessando uma fronteira de fila/job: threadar o id de correlação explicitamente no payload do job, como `WebhookJobData.requestId` já faz — não presumir que `AsyncLocalStorage` atravessa sozinho.
- `P2002`/colisão de idempotência: sempre `logger.warn` (não `error` — é o mecanismo de defesa funcionando), sempre com a chave de domínio (`externalId`/`contactId`/equivalente) nos campos.

## Critérios de reavaliação

Se o volume de colisões de `P2002` em produção justificar investigação caso a caso correlacionada ao request original, revisitar o threading de `requestId` até `MessageService`/`ConversationService` (residual desta ADR). Se o projeto ganhar múltiplas réplicas de verdade, `WebhookMetricsService` precisa de agregação central (Redis, conforme já recomendado por B-46) antes de ser confiável.

## Referências

- `apps/api/src/shared/logging/request-context.ts`, `request-id.middleware.ts`, `winston.logger.ts`, `structured-log.util.ts`.
- `apps/api/src/modules/webhook/webhook.controller.ts:121` (ponte requestId HTTP→job).
- `B48_AUDITORIA_POS_HARDENING.pdf`, `B49_AUDITORIA_POS_HARDENING.pdf` (achado de observabilidade em cada PRR).
