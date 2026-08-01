# Padrões arquiteturais consolidados — Architecture Consolidation Review (2026-08-01)

> Resultado completo em `ARQUITETURA_CONSOLIDADA_ATENDEHUB.pdf` (raiz do repo). Este documento é a
> versão viva/editável do inventário e das decisões de consolidação; o PDF é a fotografia formal da
> revisão.

## Padrões identificados e onde aparecem

| Padrão | Onde | Observação |
|---|---|---|
| Idempotência (criar-ou-reaproveitar sob concorrência) | `MessageService` (B-48), `ConversationService` (B-49) | Ver ADR-0002. 2 ocorrências reais, mesma receita, recuperação diferente. |
| Persistência atômica via constraint | `Message.externalId` (unique de coluna), `Conversation` (índice parcial) | Ver ADR-0002/0003. |
| Retry com backoff | Fila `webhook` (política própria, configurável) vs. default global (`sla-check`, `auto-attendance-inactivity`) | Ver ADR-0005. Divergência intencional, não duplicação. |
| DLQ | Só fila `webhook` | Ver ADR-0006. Escopo intencional. |
| Classificação de erro | `ValidationPipe` (shape), `SentryExceptionFilter` (reporte), `classifyWebhookError` (retry) | Ver ADR-0007. 3 camadas complementares. |
| Log estruturado | `shared/logging/structured-log.util.ts` (relocado nesta ACR) | Consumido por webhook, `MessageService`, `ConversationService`. |
| Correlação de requisição | `AsyncLocalStorage` (HTTP) + threading explícito (`WebhookJobData.requestId`) | Ver ADR-0008. |
| Métricas | `WebhookMetricsService` — único no projeto, escopo de webhook, em memória por processo | Limitação conhecida sob múltiplas réplicas (mesma classe do B-46). |
| Estado efêmero por chave com TTL | `TokenBlacklistService`, `AutoAttendanceSessionService` (Redis, `maxRetriesPerRequest: 3`) | Padrão repetido — ver "Duplicações" abaixo. |
| Deduplicação de nome/telefone | `Contact` (`@@unique([companyId, phone])`), `Department`/`Queue`/`Tag` (`@@unique([companyId, name])`) | Todos já com `@@unique`; TOCTOU teórico e aceito (ação humana isolada, sem retry automático) — ver Fase 12. |
| Rate limiting | `@Throttle` em `auth.controller.ts` (3 rotas) e `webhook.controller.ts` (1 rota) | Cada limite dimensionado ao risco da rota (login mais restrito que webhook). |
| Validação de entrada | `ValidationPipe` global (`forbidNonWhitelisted`) + `shared/validators/safe-media-url.validator.ts` (SSRF) | Consistente em todo o projeto. |
| Transação multi-tabela | `AuthService#registerCompany` (`$transaction`) | Único uso de transação Prisma explícita hoje. |
| Repository | **Não existe** — `PrismaService` injetado direto em todo service de domínio | Decisão implícita já consolidada; ver seção "Não fazer" abaixo. |

## Duplicações encontradas

| # | Local | Quantidade | Impacto | Risco | Ação |
|---|---|---|---|---|---|
| 1 | `err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'` | 2 (`MessageService`, `ConversationService`) | Baixo — 2 linhas idênticas | Baixo — mudança de API do Prisma exigiria achar as 2 ocorrências manualmente | **Consolidado** nesta ACR: `shared/prisma/prisma-errors.util.ts#isUniqueConstraintViolation`. |
| 2 | Log de colisão de idempotência com string interpolada à mão (não `formatStructuredLog`) | 2 (`MessageService`, `ConversationService`, adicionados nas PRRs de B-48/B-49) | Médio — inconsistência de formato de log dentro do mesmo projeto | Baixo funcional, médio operacional (dificulta parsing por coletor de log) | **Consolidado** nesta ACR: `formatStructuredLog` relocado de `modules/webhook/` pra `shared/logging/`, reusado pelos dois. |
| 3 | Client Redis instanciado com `new Redis({host, port, password})` idêntico | 2 hoje (`TokenBlacklistService`, `AutoAttendanceSessionService`), tende a virar 3+ (B-46 propõe explicitamente seguir "o mesmo padrão") | Médio — cada consumidor novo copia o boilerplate; N conexões TCP redundantes ao mesmo Redis | Médio — nenhum ponto único pra tunar política de reconexão de app-data | **Não consolidado nesta sessão** — ver justificativa abaixo. Recomendado como parte do escopo do B-46. |
| 4 | Extração de telefone de JID do WhatsApp | Já resolvido antes desta ACR (B-39): 3 ocorrências consolidadas em `shared/whatsapp/jid.util.ts` | — | — | Nenhuma ação — já é o exemplo de consolidação bem-sucedida a seguir como referência. |

### Por que o client Redis (duplicação #3) não foi consolidado nesta sessão

Encontrados **5 clients Redis instanciados separadamente** no projeto: `TokenBlacklistService`,
`AutoAttendanceSessionService`, `HealthService`, `RedisIoAdapter` (Socket.IO), e a conexão própria do
BullMQ. Analisados individualmente:

- `HealthService`: **propositalmente separado** — tunado pra falhar rápido (`maxRetriesPerRequest: 1`,
  `connectTimeout: 2000`), porque um health check precisa detectar Redis fora do ar rapidamente, sem
  herdar a política de retry paciente de um client de aplicação. Consolidar quebraria essa garantia.
- `RedisIoAdapter`: **exigência da biblioteca** (`@socket.io/redis-adapter` precisa de clients próprios
  pub/sub, `maxRetriesPerRequest: null`). Não é um client de dado de aplicação comum.
- `TokenBlacklistService` e `AutoAttendanceSessionService`: **duplicação real, sem diferenciação
  técnica** — mesma config exata (`maxRetriesPerRequest: 3`, mesmo host/port/password), ambos são
  "chave com TTL", nenhum requisito de latência/fail-fast como o Health. Candidatos genuínos a um
  `RedisModule`/`RedisAppDataService` compartilhado.

**Decisão:** não consolidar TokenBlacklistService/AutoAttendanceSessionService nesta sessão de ACR —
`TokenBlacklistService` é código de segurança (blacklist de token JWT) já testado e em produção; um
refatoração puramente não-funcional carrega risco desproporcional ao benefício de ser feita como efeito
colateral de uma revisão arquitetural. **Recomendado explicitamente como parte do escopo de B-46**
(que já vai tocar exatamente esta área do código pra mover o throttle de avatar pra Redis) — nesse
momento, criar o client compartilhado e migrar os 2 consumidores existentes junto do 3º que o B-46 adiciona,
com testes de regressão cobrindo os 3 de uma vez. Ver `docs/06-Backend/README.md` (a criar/atualizar
quando B-46 for implementado) para o design recomendado.

## O que NÃO foi consolidado (e por quê)

- **`AtomicPersistenceHelper` genérico** — ver ADR-0003. 2 consumidores, recuperação já divergente entre
  eles, generics do Prisma não compensam.
- **`IdempotencyService` genérico** — mesma razão do item acima; a "receita" já está documentada em
  `docs/06-Backend/padroes-idempotencia-concorrencia-retry.md`, não precisa de um serviço.
- **`RetryPolicy`/`RetryClassifier` genérico entre filas** — ver ADR-0005/0007. Cada fila tem requisito
  de retry genuinamente diferente; um classificador genérico esconderia essa diferença em vez de
  expressá-la.
- **`ConcurrencyGuard`** — não existe (nem precisa existir) como componente: a garantia de concorrência
  vem da constraint do banco (ADR-0002), não de um guard de aplicação.
- **`DomainInvariantValidator` genérico** — cada invariante (unicidade de `Message`, de `Conversation`,
  de `Contact`/`Department`/`Queue`/`Tag`) já é expressa como constraint do Prisma/PostgreSQL; um
  validador de aplicação por cima seria uma 2ª fonte de verdade competindo com o banco.
- **`WebhookPipelineHelper`** — o pipeline de webhook (`Controller → Queue → Processor → Service`) já é
  a estrutura padrão do NestJS/Bull; não há lógica repetida entre estágios que justifique uma abstração
  própria por cima.
- **`RepositoryBase`** — o projeto não usa camada de repository (Prisma Client injetado é o próprio
  ponto de acesso a dado). Introduzir uma agora, sem nenhum problema concreto que resolva (nenhuma
  duplicação de query encontrada entre services), seria abstração sem benefício comprovado.
- **`TraceContext`** — não há tracing distribuído (OpenTelemetry/APM) no projeto; `CorrelationContext`
  já existe de fato como `request-context.ts` (AsyncLocalStorage) + threading explícito em job — ver
  ADR-0008. Nenhum componente novo necessário, só a documentação da fronteira entre os dois mundos
  (feita nesta ACR).
- **`MetricsService` genérico** — `WebhookMetricsService` é hoje o único consumidor de métricas;
  generalizar antes de um 2º caso real seria especulativo.

## Componentes efetivamente criados nesta ACR

| Componente | Arquivo | Motivo |
|---|---|---|
| `isUniqueConstraintViolation` | `apps/api/src/shared/prisma/prisma-errors.util.ts` | Duplicação #1 acima. |
| `formatStructuredLog`/`WORKER_ID` (relocados) | `apps/api/src/shared/logging/structured-log.util.ts` | Duplicação #2 acima; generalização de um util já existente. |

## Referência: exemplo de consolidação bem-sucedida anterior a esta ACR

`shared/whatsapp/jid.util.ts` — extração de telefone de JID do WhatsApp, consolidada em B-39 a partir de
3 ocorrências duplicadas. Mesmo critério usado aqui: duplicação real, comportamento idêntico, sem
divergência entre os consumidores — diferente do caso do client Redis, onde 2 dos 5 têm requisitos
genuinamente diferentes.
