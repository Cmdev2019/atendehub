# PADRÕES ARQUITETURAIS — ATENDEHUB

> **Nome de arquivo:** este documento segue `docs/00-Governanca/CONVENCAO-DE-NOMENCLATURA.md` §2.3
> (documento normativo dentro de `docs/` → `SCREAMING-KEBAB-CASE.md`, hífen — não underscore). Ver
> `INCLUSAO_PADROES_ARQUITETURAIS_ATENDEHUB.md` (raiz do repo) para o registro completo dessa decisão.

## Objetivo

Este documento centraliza os **padrões oficiais de desenvolvimento** do backend do AtendeHub, como guia
de consulta rápida. Ele **não substitui** as ADRs (`docs/05-ADR/`) — a relação entre os dois é:

| | Registra | Profundidade | Quando ler |
|---|---|---|---|
| **ADR** (`docs/05-ADR/`) | A decisão: alternativas comparadas, prós/contras, por que esta e não outra | Completa, imutável depois de aceita | Antes de questionar ou reverter uma decisão |
| **Este documento** | O padrão já decidido, pronto para aplicar | Resumida — problema, quando usar, como implementar, exemplo real | Ao escrever código novo, ao revisar PR |

Se este documento e uma ADR divergirem em algum ponto, **a ADR é a fonte da verdade** — abra uma issue
apontando a divergência para este documento ser corrigido (ver Fase 5 do relatório de inclusão).

---

## Índice

1. [Idempotência](#1-idempotência)
2. [Persistência Atômica](#2-persistência-atômica)
3. [Concorrência](#3-concorrência)
4. [Retry](#4-retry)
5. [DLQ](#5-dlq)
6. [Tratamento de Erros](#6-tratamento-de-erros)
7. [Observabilidade](#7-observabilidade)
8. [Banco de Dados](#8-banco-de-dados)
9. [Mensageria](#9-mensageria)
10. [Testes](#10-testes)
11. [Segurança](#11-segurança)
12. [Documentação](#12-documentação)

---

## 1. Idempotência

**Problema que resolve:** um mesmo evento externo (webhook, eco de uma ação própria) processado mais de
uma vez não pode duplicar o recurso que ele cria.

**Quando utilizar:** sempre que um recurso for criado a partir de um evento que pode chegar duplicado ou
concorrente — webhook, retry de fila, reenvio de terceiro.

**Quando NÃO utilizar:** operações que já são naturalmente idempotentes por design (`update` por `id`
conhecido, `delete`) não precisam deste padrão — só "criar-ou-reaproveitar" precisa.

**Implementação oficial:** `create()` direto contra uma constraint `UNIQUE` (coluna inteira ou índice
parcial), captura de `P2002` via `isUniqueConstraintViolation()`, devolve `isNew: boolean` explícito.
Nunca `findFirst()` como único mecanismo de proteção — só como fast-path opcional (ver seção 3).

**Exemplos existentes no projeto:**
- `MessageService#createUnique` (`apps/api/src/modules/message/message.service.ts`) — `Message.externalId`.
- `ConversationService#upsertFromWebhook` (`apps/api/src/modules/conversation/conversation.service.ts`) — conversa ativa por contato.

**ADR relacionada:** [ADR-0002](../05-ADR/ADR-0002-estrategia-de-idempotencia.md).

---

## 2. Persistência Atômica

**Problema que resolve:** garantir que uma escrita condicional ("cria se não existir") seja atômica sob
qualquer grau de concorrência, sem depender de nenhum código de aplicação lembrar de usar um lock.

**Quando utilizar:** toda vez que a idempotência (seção 1) depender de uma constraint do banco.

**Quando NÃO utilizar:** não crie um helper genérico cross-domain só porque existe mais de um caso —
ver ADR-0003: 2 consumidores hoje, com consultas de recuperação estruturalmente diferentes, não
justificam a complexidade de generics de um helper único.

**Implementação oficial:**
- Unicidade de **coluna inteira** → `@@unique([campo])` no `schema.prisma`.
- Unicidade **condicional** (só entre linhas que satisfazem uma condição) → índice único **parcial**,
  `CREATE UNIQUE INDEX ... WHERE <condição>`, escrito à mão em SQL na migration (Prisma não expressa
  `WHERE` em `@@unique`/`@@index`).
- Predicado de erro sempre via `shared/prisma/prisma-errors.util.ts#isUniqueConstraintViolation` — nunca
  reescrever `err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'` à mão.

**Exemplos existentes no projeto:**
- `Message.externalId` — `@@unique` de coluna inteira.
- `Conversation` — índice parcial `conversations_active_per_contact_key`
  (`WHERE status IN ('WAITING','OPEN')`), documentado também no comentário do `enum ConversationStatus`
  em `schema.prisma`.

**ADR relacionada:** [ADR-0002](../05-ADR/ADR-0002-estrategia-de-idempotencia.md) e
[ADR-0003](../05-ADR/ADR-0003-persistencia-atomica.md).

---

## 3. Concorrência

**Problema que resolve:** provar que a garantia de atomicidade (seção 2) realmente segura sob
concorrência genuína (múltiplos workers, múltiplas réplicas), não só sob mock.

**Quando utilizar:** todo recurso protegido por idempotência precisa de validação de concorrência real
antes de ser considerado pronto para produção.

**Quando NÃO utilizar:** não é substituto de teste de carga formal (k6/Artillery) se o objetivo for medir
throughput/latência sob tráfego realista — objetivo diferente (ver ADR-0004).

**Implementação oficial:** `findFirst()` como *fast-path* é aceitável quando o caminho comum é "recurso
já existe" (ex.: `Conversation` — maioria das mensagens cai numa conversa já aberta). Quando o caminho
comum é "recurso novo", pular o `findFirst()` e ir direto pro `create()` (ex.: `Message` — cada mensagem
tem um `externalId` novo). Validação: script standalone com `Promise.all` (nunca sequencial) contra
Postgres real, progressão 2/5/10/50/100, medindo contagem de linhas + `isNew` + IDs distintos
convergindo.

**Exemplos existentes no projeto:**
- `apps/api/scripts/validate-b48-concurrency.ts`, `apps/api/scripts/validate-b49-concurrency.ts`.
- Guia de implementação: `docs/23-Testes/Stress/concorrencia-real.md`.

**ADR relacionada:** [ADR-0004](../05-ADR/ADR-0004-estrategia-de-concorrencia-e-seus-testes.md).

---

## 4. Retry

**Problema que resolve:** falha transitória (rede, serviço externo momentaneamente fora do ar) não deve
perder um evento — mas falha permanente não deve gastar tentativas à toa.

**Quando utilizar:** processamento assíncrono de evento cuja origem pode falhar de forma transitória
(chamada a API externa, timeout de rede).

**Quando NÃO utilizar:** não usar retry (ou usar o mínimo, via default global) para jobs cuja falha
definitiva é quase sempre bug de código interno, não instabilidade externa (ex.: jobs que só tocam o
próprio Postgres/Redis).

**Implementação oficial:** classificar o erro antes de decidir — transitório (rede, Prisma de conexão,
HTTP 429/5xx, timeout) → deixa o Bull re-tentar; permanente (HTTP 4xx exceto 429, payload malformado) →
`job.discard()` explícito, sem gastar tentativa; não reconhecido → trata como transitório (nunca desiste
sozinho por classificação errada). Backoff exponencial só quando a causa provável é instabilidade
temporária de serviço externo.

**Exemplos existentes no projeto:**
- `webhook.errors.ts#classifyWebhookError` — matriz completa de códigos.
- `webhook-queue.config.ts` — política própria e configurável via ENV para a fila `webhook`.
- Default global (`attempts: 3`, backoff exponencial 2s) em `app.module.ts`, usado por `sla-check` e
  `auto-attendance-inactivity` sem override.

**ADR relacionada:** [ADR-0005](../05-ADR/ADR-0005-estrategia-de-retry.md).

---

## 5. DLQ

**Problema que resolve:** falha definitiva de um evento externo importante não pode se perder em
silêncio — precisa ficar retida em algum lugar reprocessável.

**Quando utilizar:** fila cuja fonte é externa, historicamente instável, onde perder o evento tem custo
de negócio alto e reprocessar manualmente depois faz sentido.

**Quando NÃO utilizar:** não crie DLQ para toda fila "por padronização" — se a falha definitiva é quase
sempre bug de código (não instabilidade externa), a DLQ só acumula lixo que precisa de correção de
código, não de reprocessamento.

**Implementação oficial:** fila Bull dedicada, sem `@Process` próprio (só acumula), populada em
`@OnQueueFailed` quando não há mais tentativas restantes; reprocessamento/descarte manual via service e
controller dedicados, com contexto rico (payload, headers, erro, stack, tentativas, tenant, ids
resolvidos).

**Exemplos existentes no projeto:**
- `webhook-dlq.service.ts`, `webhook-dlq.controller.ts`, `webhook-dlq.types.ts` — única fila com DLQ no
  projeto hoje (`sla-check`/`auto-attendance-inactivity` não têm, por decisão — ver ADR-0006).

**ADR relacionada:** [ADR-0006](../05-ADR/ADR-0006-dead-letter-queue.md).

---

## 6. Tratamento de Erros

**Problema que resolve:** três perguntas diferentes — "a requisição é aceitável?", "o que reportar
externamente?", "vale tentar de novo?" — não devem ser resolvidas por um único mecanismo genérico.

**Quando utilizar:** cada camada resolve sua própria pergunta — não misture.

**Quando NÃO utilizar:** não crie um `ErrorClassifier` único tentando unificar validação de DTO, reporte
de exceção HTTP e política de retry de fila — são decisões independentes (ver ADR-0007).

**Implementação oficial:**
- Shape de request inválido → `ValidationPipe` global (`forbidNonWhitelisted`), automático, sem código
  extra por rota.
- Exceção HTTP não tratada → `SentryExceptionFilter` global, automático.
- Decisão de retry de fila → classificador dedicado (ex.: `classifyWebhookError`), só dentro de
  processors que precisam decidir isso.

**Exemplos existentes no projeto:** `main.ts` (registro dos globais), `webhook.errors.ts`.

**ADR relacionada:** [ADR-0007](../05-ADR/ADR-0007-tratamento-de-erros.md).

---

## 7. Observabilidade

**Problema que resolve:** correlacionar logs da mesma operação sem exigir que todo service receba e
repasse manualmente um id de correlação.

**Quando utilizar:** sempre — todo log de evento nomeado usa o formato estruturado; toda operação
protegida por idempotência (seção 1) loga quando a proteção é exercitada.

**Quando NÃO utilizar:** não presuma que `AsyncLocalStorage` atravessa uma fronteira de fila/job
sozinho — não existe tracing distribuído automático no projeto hoje (ver ADR-0008).

**Implementação oficial:**
- Log estruturado: sempre `formatStructuredLog(evento, campos)` de `shared/logging/structured-log.util.ts`,
  nunca string interpolada à mão.
- Correlação dentro do ciclo HTTP: automática via `AsyncLocalStorage` (`request-context.ts`) + Winston.
- Correlação atravessando fila: threading explícito do id no payload do job (ex.:
  `WebhookJobData.requestId`).
- Colisão de idempotência: sempre `logger.warn` (nunca `error` — é o mecanismo de defesa funcionando),
  sempre com a chave de domínio (`externalId`/`contactId`) nos campos.

**Exemplos existentes no projeto:**
- `IdempotencyCollisionResolved` — `MessageService#createUnique`, `ConversationService#upsertFromWebhook`.
- `WebhookJobStarted`/`WebhookRetry`/`WebhookMovedToDLQ` — `webhook.processor.ts`.
- Guia completo: `docs/25-Observabilidade/logs-estruturados-e-correlacao.md`.

**ADR relacionada:** [ADR-0008](../05-ADR/ADR-0008-observabilidade.md).

---

## 8. Banco de Dados

**Problema que resolve:** acesso a dado consistente, multi-tenant seguro, e migrations rastreáveis.

**Quando utilizar:** toda query de domínio.

**Quando NÃO utilizar:** não crie uma camada de `Repository` — o projeto não usa (decisão implícita já
consolidada, ver `docs/04-Arquitetura/padroes-consolidados-2026-08.md`); `PrismaService` injetado direto
no service de domínio já é o ponto de acesso a dado.

**Implementação oficial:**
- Toda query multi-tenant filtra por `companyId` explicitamente (não há RLS habilitada hoje — ver B-41
  no roadmap, pendente).
- Migration de índice parcial é sempre SQL manual, nunca `prisma migrate dev` (que não gera `WHERE`).
- Nomenclatura de schema segue `docs/00-Governanca/CONVENCAO-DE-NOMENCLATURA.md` §5.

**Exemplos existentes no projeto:** todo `*.service.ts` em `apps/api/src/modules/`; migrations de B-48
(`20260801204336_b48_message_external_id_unique`) e B-49
(`20260801211919_b49_conversation_active_unique_per_contact`) como referência de migration manual.

**ADR relacionada:** [ADR-0002](../05-ADR/ADR-0002-estrategia-de-idempotencia.md),
[ADR-0003](../05-ADR/ADR-0003-persistencia-atomica.md). Ver também `docs/08-Banco-de-Dados/` (estrutura
existe, conteúdo detalhado ainda não escrito — ver Fase 4 do relatório de inclusão).

---

## 9. Mensageria

**Problema que resolve:** processamento assíncrono desacoplado do ciclo de resposta HTTP.

**Quando utilizar:** operação que não precisa bloquear a resposta HTTP (processar webhook, checar SLA,
disparar timeout de inatividade).

**Quando NÃO utilizar:** não crie uma fila nova para operação síncrona simples que cabe numa única
requisição/resposta (ex.: envio de mensagem pelo agente é síncrono por decisão de produto — `send-message.service.ts`,
sem fila).

**Implementação oficial:** nomes de fila centralizados em `shared/queues/queue-names.ts`
(`QUEUE_NAMES`); cada fila declara sua própria política de retry só se divergir do default global (ver
seção 4); processor dedicado por fila (`*.processor.ts`), nunca consumido direto por controller.

**Exemplos existentes no projeto:** 4 filas — `webhook`, `webhook-dlq`, `sla-check`,
`auto-attendance-inactivity`. Ver `docs/10-Webhooks/` (estrutura existe, conteúdo detalhado do contrato
de entrada/saída ainda não escrito).

**ADR relacionada:** [ADR-0005](../05-ADR/ADR-0005-estrategia-de-retry.md),
[ADR-0006](../05-ADR/ADR-0006-dead-letter-queue.md).

---

## 10. Testes

**Problema que resolve:** confiança de que uma garantia (idempotência, concorrência, retry) realmente se
sustenta, não só que o código "parece certo".

**Quando utilizar:** unitário (mock) sempre, em todo PR. Concorrência real (script contra Postgres real)
sempre que uma correção depender de constraint de banco.

**Quando NÃO utilizar:** não confie só em teste unitário mockado para provar uma garantia de
concorrência — mock nunca "colide de verdade" (ver ADR-0004).

**Implementação oficial:** `*.spec.ts` para lógica de decisão (rápido, todo PR); `*.e2e-spec.ts` para
fluxo real contra infraestrutura real (Postgres/Redis/MinIO); scripts standalone
(`scripts/validate-*-concurrency.ts`) para prova de concorrência, rodados manualmente a cada
PRR/auditoria, não automatizados no CI ainda.

**Exemplos existentes no projeto:** `apps/api/test/sla.e2e-spec.ts`, `apps/api/test/storage.e2e-spec.ts`
(prova real contra MinIO, não mock — achou o achado crítico do hardening do B-38).

**ADR relacionada:** [ADR-0004](../05-ADR/ADR-0004-estrategia-de-concorrencia-e-seus-testes.md). Guia:
`docs/23-Testes/Stress/concorrencia-real.md`.

---

## 11. Segurança

**Problema que resolve:** exposição não intencional de dado de cliente, autenticação/autorização
consistente, defesa contra payload malicioso.

**Quando utilizar:** todo endpoint, todo recurso que armazena mídia, toda validação de entrada vinda do
usuário.

**Quando NÃO utilizar:** não implemente validação de segurança ad-hoc por controller — use os mecanismos
globais já registrados.

**Implementação oficial:**
- Autenticação: `JwtAuthGuard` global (`@Public()` para exceção explícita).
- Autorização por papel: `RolesGuard` global + `@Roles()`.
- Mídia: bucket privado por padrão, nunca policy pública — `StorageService#onModuleInit` **revoga**
  ativamente qualquer policy herdada a cada boot (não só evita criar uma nova — lição do hardening do
  B-38, ver seção 6). Acesso só via URL assinada, TTL configurável.
- Validação de entrada: `ValidationPipe` global (`forbidNonWhitelisted`) + validadores customizados
  quando necessário (ex.: `shared/validators/safe-media-url.validator.ts`, proteção SSRF).
- Rate limiting: `@Throttle` por rota sensível (login, registro, refresh, webhook), dimensionado ao risco
  de cada uma — nunca um único limite global para todas.

**Exemplos existentes no projeto:** `apps/api/src/shared/storage/storage.service.ts`,
`apps/api/src/modules/auth/guards/`, `apps/api/src/shared/validators/safe-media-url.validator.ts`.

**Relação com correções recentes:** B-38 (ver seção "Relação com B-38/B-39/B-48/B-49" abaixo). Ver também
`docs/19-Seguranca/` (estrutura existe, conteúdo detalhado ainda não escrito).

---

## 12. Documentação

**Problema que resolve:** decisão arquitetural e padrão de implementação precisam ser encontráveis por
quem não estava na sessão em que foram definidos.

**Quando utilizar:** toda decisão arquitetural relevante vira ADR; todo padrão de implementação
recorrente vira uma entrada neste documento; todo bug/correção relevante vira item numerado no roadmap
com evidência no changelog.

**Quando NÃO utilizar:** não crie estrutura documental paralela à numeração de `docs/` já existente (ver
Fase 2 do relatório de inclusão) — isso é, em si, a mesma classe de duplicação que este documento existe
para evitar em código.

**Implementação oficial:** `docs/` em 41 áreas numeradas (`docs/00-Governanca/PLANO-DE-REESTRUTURACAO.md`);
ADR imutável após aceita, superada por outra que a referencia; `ROADMAP_ESTABILIZACAO.md` (raiz) como
documento vivo de status; `CHANGELOG.md` (raiz) como fonte de verdade de versões liberadas.

**Exemplos existentes no projeto:** este próprio documento, `docs/05-ADR/INDICE.md`.

**ADR relacionada:** [ADR-0001](../05-ADR/ADR-0001-estrutura-do-repositorio.md).

---

## Matriz — situação → padrão oficial → implementação → ADR

| Situação | Padrão oficial | Implementação | ADR |
|---|---|---|---|
| Mensagem de webhook duplicada | UNIQUE + `P2002` | `MessageService#createUnique` | [ADR-0002](../05-ADR/ADR-0002-estrategia-de-idempotencia.md) |
| Duas conversas ativas pro mesmo contato | Índice único PARCIAL + `P2002` | `ConversationService#upsertFromWebhook` | [ADR-0002](../05-ADR/ADR-0002-estrategia-de-idempotencia.md) |
| Predicado de erro de unicidade repetido | Extrair função pura compartilhada | `isUniqueConstraintViolation` | [ADR-0003](../05-ADR/ADR-0003-persistencia-atomica.md) |
| Provar ausência de duplicata sob concorrência | Script `Promise.all` contra Postgres real | `scripts/validate-*-concurrency.ts` | [ADR-0004](../05-ADR/ADR-0004-estrategia-de-concorrencia-e-seus-testes.md) |
| Evolution API instável (timeout/5xx) | Retry com backoff exponencial configurável | `webhook-queue.config.ts` | [ADR-0005](../05-ADR/ADR-0005-estrategia-de-retry.md) |
| Job de webhook falha definitivamente | Mover pra DLQ com contexto completo | `webhook-dlq.service.ts` | [ADR-0006](../05-ADR/ADR-0006-dead-letter-queue.md) |
| DTO de request malformado | Rejeitar antes de qualquer lógica | `ValidationPipe` global | [ADR-0007](../05-ADR/ADR-0007-tratamento-de-erros.md) |
| Colisão de idempotência precisa ser monitorável | Log estruturado, nível `warn` | `formatStructuredLog('IdempotencyCollisionResolved', ...)` | [ADR-0008](../05-ADR/ADR-0008-observabilidade.md) |
| Bucket de mídia não pode ficar público | Revogar policy a cada boot, nunca só "não aplicar" | `StorageService#onModuleInit` | (B-38 — ADR formal prevista em `docs/05-ADR/INDICE.md`) |
| Estado por chave com TTL, um consumidor novo | Reusar client Redis compartilhado (recomendado, não implementado ainda) | Ver B-46 no roadmap | — |

---

## Anti-padrões (práticas proibidas)

| Anti-padrão | Por que é proibido | Onde já aconteceu no projeto (histórico, corrigido) |
|---|---|---|
| `findFirst()` + `create()` como único mecanismo de proteção em fluxo concorrente | Janela TOCTOU — sob concorrência real, duplica o recurso | B-48 (`Message`), B-49 (`Conversation`) — os dois corrigidos, ver seção 1-2 |
| `catch` silencioso (engole exceção sem relançar nem logar) | Falha vira sucesso aparente — Bull marca job como concluído mesmo tendo falhado | B-39: `WebhookService#handleEvent` engolia a exceção antes do processor vê-la, `attempts`/`backoff` nunca tinham efeito |
| Bucket de storage com policy pública, ou correção que só "para de aplicar" sem revogar a existente | Exposição de dado de cliente (LGPD Art. 46); uma correção que só evita piorar não desfaz o que uma versão anterior já aplicou | B-38 original (policy pública no boot) + achado do hardening (policy legada nunca revogada) |
| Duplicar lógica idêntica em vez de extrair | Two arquivos divergem silenciosamente com o tempo | Predicado `P2002` e log de colisão, antes da ACR de 2026-08-01 — ambos consolidados |
| Abstração genérica sem necessidade comprovada (`Service`/`Helper`/`Manager` genérico "pra já deixar pronto") | Complexidade paga antes do benefício existir; generics difíceis de ler por um ganho especulativo | Avaliado e rejeitado conscientemente: `AtomicPersistenceHelper`, `RetryPolicy` genérico, `RepositoryBase` — ver ADR-0003 e `docs/04-Arquitetura/padroes-consolidados-2026-08.md` |
| `data`/`info`/`manager`/`helper`/`util`/`handler` como nome de classe | Não comunica responsabilidade — proibido por `CONVENCAO-DE-NOMENCLATURA.md` §3.2 | — |
| Verbo no caminho de rota REST (`/getConversations`) | O método HTTP já é o verbo | — |

---

## Checklist para Pull Request

Toda nova implementação que cria ou modifica um recurso de domínio deve validar:

- [ ] Existe concorrência? (dois processos podem tentar a mesma operação ao mesmo tempo?)
- [ ] Existe idempotência? (reprocessar o mesmo evento produz o mesmo estado final?)
- [ ] Existe retry? (a falha é transitória e vale re-tentar, ou é permanente e deve desistir já?)
- [ ] Existe persistência atômica? (a garantia vem de uma constraint do banco, não de lock de aplicação?)
- [ ] Existe observabilidade? (log estruturado via `formatStructuredLog`, nível correto — `warn` para
      proteção funcionando, `error` para falha real?)
- [ ] Existem testes? (unitário da lógica +, se depender de constraint, validação de concorrência real?)
- [ ] Existe documentação? (ADR se for decisão nova; entrada neste documento se for padrão recorrente?)
- [ ] Atualizou roadmap? (`ROADMAP_ESTABILIZACAO.md`, item com ID, evidência no changelog do documento)
- [ ] Atualizou changelog? (`CHANGELOG.md`, categoria correta — Adicionado/Corrigido/Segurança)

---

## Relação com B-38, B-39, B-48 e B-49

| Item | Padrão(ões) desta referência envolvidos | Resumo |
|---|---|---|
| **B-38** | Segurança (§11) | Bucket de mídia do MinIO deixou de ser público; acesso só via URL assinada (`StorageService#presignUrl`/`presignDeep`, `MediaPresignInterceptor` global). Hardening pós-auditoria: `onModuleInit` passou a **revogar** ativamente qualquer policy herdada a cada boot — não bastava só parar de aplicar uma nova (achado real, comprovado com E2E contra MinIO real). |
| **B-39** | Retry (§4), DLQ (§5), Observabilidade (§7) | Retry da fila de webhook estava inoperante (exceção engolida antes do processor); corrigido com `throw` explícito + classificação de erro transitório/permanente + DLQ nova + logs estruturados (`WebhookJobStarted`/`WebhookRetry`/`WebhookMovedToDLQ`/etc.) + `WebhookMetricsService`. |
| **B-48** | Idempotência (§1), Persistência Atômica (§2), Concorrência (§3) | Race condition em `MessageService#createFromWebhook` — `findFirst`+`create` não atômico duplicava mensagem sob concorrência real. Corrigido com `@@unique([externalId])` + `MessageService#createUnique` (create direto + captura de `P2002`). Validado com 2 a 100 chamadas concorrentes reais. |
| **B-49** | Idempotência (§1), Persistência Atômica (§2), Concorrência (§3) | Mesma classe de race condition em `ConversationService#upsertFromWebhook`, mas com invariante condicional (não coluna inteira) — índice único **parcial** no Postgres (`WHERE status IN ('WAITING','OPEN')`). Validado com concorrência real; todos os chamadores convergindo pro mesmo `conversationId`. |

Relatórios técnicos completos: `VALIDACAO_OPERACIONAL_B39_ATENDEHUB.pdf`, `B38_AUDITORIA_POS_HARDENING.pdf`,
`B48_AUDITORIA_POS_HARDENING.pdf`, `B49_AUDITORIA_POS_HARDENING.pdf`, `ARQUITETURA_CONSOLIDADA_ATENDEHUB.pdf`
(todos na raiz do repositório).

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md). Decisões arquiteturais profundas em
> [`docs/05-ADR/`](../05-ADR/).
