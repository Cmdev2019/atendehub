# ADR-0005 — Retry: política por fila, não global única

- **Status:** Aceita
- **Data:** 2026-08-01 (formaliza decisão já implementada em B-39, 2026-07-29)
- **Decisores:** Engenharia
- **Contexto técnico:** `apps/api/src/app.module.ts` (`BullModule.forRootAsync`), `apps/api/src/modules/webhook/webhook-queue.config.ts`, `apps/api/src/modules/sla/`, `apps/api/src/modules/auto-attendance/`

## Contexto

O projeto tem 4 filas Bull (`webhook`, `webhook-dlq`, `sla-check`, `auto-attendance-inactivity`). `webhook` processa eventos de um sistema externo (Evolution API) sujeitos a falha transitória de rede/timeout; `sla-check` e `auto-attendance-inactivity` processam jobs agendados sobre dado que já está no nosso Postgres. É a mesma política de retry (`attempts`/`backoff`) apropriada pras duas?

## Alternativas consideradas

### Alternativa A — Uma política única e global para todas as filas
- **Prós:** simples, um único lugar de configuração.
- **Contras:** falha transitória de rede externa (webhook) e falha ao reconsultar uma linha do próprio Postgres (SLA) têm perfis de causa e de custo de retry completamente diferentes — uma política dimensionada pra aguentar a Evolution instável (8 tentativas, backoff longo) é exagero pra um job interno; uma política dimensionada pro job interno (3 tentativas, backoff curto) é curta demais pra sobreviver a uma instabilidade real da Evolution.
- **Custo estimado:** baixo de implementar, alto de manutenção (uma mudança futura nas necessidades de uma fila força decisão de trade-off pras outras).

### Alternativa B — Política default global (Bull) + override explícito por fila que precisar de algo diferente
- **Prós:** filas "simples" (SLA, auto-atendimento) usam o default sem nenhum código extra; a fila com requisito real e documentado de resiliência (`webhook`, dependente de serviço externo + tem DLQ) declara sua própria política, parametrizável por ENV (`WEBHOOK_ATTEMPTS`, `WEBHOOK_BACKOFF_INITIAL`, `WEBHOOK_BACKOFF_MULTIPLIER`, `WEBHOOK_TIMEOUT`).
- **Contras:** duas configurações de retry coexistindo no código pode, à primeira vista, parecer duplicação — precisa do comentário certo (já existe) deixando claro que é intencional, não esquecimento.
- **Custo estimado:** baixo — já implementado (B-39).

## Decisão

**Alternativa B**, já em produção desde B-39: `attempts: 3`/`backoff: exponential 2s` como default global (`app.module.ts`, usado por `sla-check` e `auto-attendance-inactivity` sem override); `webhook` com política própria e configurável via ENV (`webhook-queue.config.ts`), incluindo `timeout` (nenhuma outra fila tem) e um backoff exponencial com multiplicador parametrizável (o `type:'exponential'` nativo do Bull tem multiplicador fixo em 2, insuficiente pra parametrizar).

## Consequências

### Positivas
- Cada fila carrega só a complexidade que sua origem de falha justifica.
- Mudar a política do webhook (ex.: aumentar tentativas numa incidência real) não exige tocar código, só ENV.

### Negativas
- Duas filas de configuração de retry no código-fonte — precisa do comentário de intenção (já presente) pra não ser lido como duplicação acidental numa auditoria futura (esta ADR formaliza isso).

### Neutras / a observar
- Nenhuma fila além de `webhook` tem DLQ — ver ADR-0006 (por quê).

## Quando usar retry (diretriz derivada)

Usar retry quando a causa da falha é plausivelmente transitória (rede, serviço externo fora do ar momentaneamente, timeout) — nunca para erro de validação/dado malformado (não muda ao tentar de novo). Ver `webhook.errors.ts#classifyWebhookError` como referência de implementação: falha de rede/Prisma de conexão/HTTP 429/5xx = retry; HTTP 4xx (exceto 429) = `job.discard()`, sem gastar tentativa.

## Critérios de reavaliação

Se `sla-check`/`auto-attendance-inactivity` ganharem uma dependência externa real (hoje não têm — só leem/escrevem no próprio Postgres/Redis), reavaliar se precisam de política própria.

## Referências

- `ROADMAP_ESTABILIZACAO.md`, changelog de B-39.
- ADR-0006 (DLQ).
