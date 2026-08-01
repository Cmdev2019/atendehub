# ADR-0006 — DLQ apenas na fila de webhook

- **Status:** Aceita
- **Data:** 2026-08-01 (formaliza decisão já implementada em B-39, 2026-07-29)
- **Decisores:** Engenharia
- **Contexto técnico:** `apps/api/src/modules/webhook/webhook-dlq.*`, `apps/api/src/shared/queues/queue-names.ts`

## Contexto

Das 4 filas do projeto, só `webhook` tem uma dead-letter queue (`webhook-dlq`). `sla-check` e `auto-attendance-inactivity` não têm. É uma lacuna ou uma decisão de escopo?

## Alternativas consideradas

### Alternativa A — DLQ em toda fila, por padronização
- **Prós:** uniformidade; qualquer job perdido, de qualquer fila, fica retido em algum lugar.
- **Contras:** `sla-check`/`auto-attendance-inactivity` processam jobs cuja falha definitiva, na prática, é quase sempre um bug de código (a fonte de dado é o próprio Postgres/Redis do projeto, não uma API externa instável) — uma DLQ ali acumularia jobs que precisam de correção de código, não de reprocessamento manual; o valor de "reprocessar depois" é baixo porque o estado de origem (`conversationId`, `maxWaitSecs`) pode já ter mudado.
- **Custo estimado:** baixo de implementar, mas resolve um problema que essas duas filas não têm hoje.

### Alternativa B — DLQ só onde a falha definitiva é plausivelmente recuperável por reprocessamento (fonte externa instável)
- **Prós:** `webhook` depende de uma API externa (Evolution) com instabilidade real e documentada (matriz de resiliência validada em B-39: 429/5xx/timeout/ECONNRESET/DNS) — uma falha definitiva ali é frequentemente "a Evolution estava fora do ar por mais tempo que as N tentativas cobrem", não um bug; reprocessar manualmente da DLQ depois resolve de verdade. Mensagem de cliente perdida em silêncio é o pior desfecho possível pro produto — vale a complexidade extra.
- **Contras:** nenhuma fila nova ganha a proteção automaticamente; se `sla-check`/`auto-attendance-inactivity` um dia ganharem uma dependência externa real, precisam de decisão própria.
- **Custo estimado:** baixo — só a fila que precisa carrega o custo.

## Decisão

**Alternativa B**, já em produção desde B-39. DLQ (`webhook-dlq`, sem `@Process` — só acumula, sai por reprocessamento manual via `WebhookDlqService`) existe exclusivamente pra fila `webhook`.

## Consequências

### Positivas
- Sem overhead de DLQ em filas que não precisam.
- A DLQ que existe é rica em contexto (payload, headers, erro, stack, tentativas, tenant, `conversationId`/`messageId` resolvidos) porque foi desenhada pro caso de uso real (reprocessar um evento de webhook perdido), não genérica.

### Negativas
- Se `sla-check` falhar definitivamente hoje, o job simplesmente se perde (mesma política antiga do Bull) — aceitável porque o processor reconsulta o status atual antes de agir (idempotente por natureza) e o próximo ciclo de verificação de SLA não depende do job perdido especificamente.

### Neutras / a observar
- B-46 (estado em memória impedindo réplicas) não tem relação com DLQ — não confundir os dois temas numa leitura rápida do backlog.

## Quando usar DLQ (diretriz derivada)

Criar DLQ para uma fila quando: (1) a fonte do job é externa e tem histórico de instabilidade real; (2) perder o job silenciosamente tem custo de negócio alto; (3) reprocessar manualmente depois é uma operação que faz sentido (o estado de origem não expira/muda rápido demais pra isso ter valor).

## Critérios de reavaliação

Se `auto-attendance-inactivity` passar a depender de uma chamada de rede que hoje não existe (ex.: uma IA externa decidindo a mensagem de inatividade), reavaliar.

## Referências

- ADR-0005. `ROADMAP_ESTABILIZACAO.md`, changelog B-39 (matriz de resiliência validada).
