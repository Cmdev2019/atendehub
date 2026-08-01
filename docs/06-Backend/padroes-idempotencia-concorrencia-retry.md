# Diretrizes oficiais — idempotência, concorrência, retry e persistência atômica

> Consolidado na Architecture Consolidation Review de 2026-08-01, a partir do que foi implementado e
> validado em B-38/B-39/B-48/B-49. Decisões arquiteturais correspondentes: [ADR-0002](../05-ADR/ADR-0002-estrategia-de-idempotencia.md)
> a [ADR-0008](../05-ADR/ADR-0008-observabilidade.md). Este documento é o **guia de quem escreve código**
> em `apps/api` — não repete o "porquê" (isso é ADR), foca no "como fazer igual da próxima vez".

## Como implementar idempotência (criar-ou-reaproveitar sob concorrência)

Toda vez que um recurso precisa ser "criado se não existir, reaproveitado se já existir" a partir de um
evento que pode chegar duplicado ou concorrente (webhook, retry de fila, eco de uma ação própria):

1. **Nunca confie só em `findFirst()`/`findUnique()` seguido de `create()`.** É uma janela TOCTOU —
   sob concorrência real, dois processos podem ler "não existe" antes de qualquer `create()` terminar.
2. Modele a invariante de unicidade como constraint do PostgreSQL:
   - Unicidade de uma **coluna inteira** (nunca se repete, nunca) → `@@unique([campo])` no
     `schema.prisma`.
   - Unicidade **condicional** (só entre linhas que satisfazem uma condição, ex. só status ativos) →
     índice único **parcial**, `CREATE UNIQUE INDEX ... WHERE <condição>`, escrito à mão em SQL na
     migration (o Prisma não expressa `WHERE` na sintaxe de `@@unique`/`@@index`). Documentar a
     dependência no ponto mais provável de uma edição futura quebrar isso — ver `enum ConversationStatus`
     no `schema.prisma` como exemplo (comentário cruzado com a migration e com o código que lê o status).
3. `try { create() } catch { if (isUniqueConstraintViolation(err)) { recupera a linha vencedora } else { throw } }`
   — usar `isUniqueConstraintViolation` de `shared/prisma/prisma-errors.util.ts`, nunca reescrever o
   `instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'` à mão.
4. Se um consumidor precisar saber "isso é novo ou já existia" (ex.: pra não duplicar efeito colateral
   num retry — mídia baixada de novo, evento reemitido), devolva um `isNew: boolean` explícito. **Nunca**
   infira isso por heurística de timestamp (`createdAt` recente) — frágil sob latência real.
5. Se o caminho comum (maioria das chamadas) for "recurso já existe", mantenha um `findFirst()` como
   *fast-path* antes do `try/create` — evita tentar um `INSERT` fadado a falhar na maioria das chamadas.
   Se o caminho comum for "recurso não existe ainda", pule direto pro `create()` (não vale a leitura
   prévia). Ver `MessageService#createUnique` (sem fast-path) vs. `ConversationService#upsertFromWebhook`
   (com fast-path) — a escolha é sobre qual caminho é mais frequente no domínio, não uma regra fixa.

## Quando usar `UNIQUE` de coluna inteira vs. índice parcial

- **Coluna inteira**: a invariante não depende de nenhum outro campo da linha (ex.: `Message.externalId`
  — um ID do WhatsApp nunca deveria repetir, independente de status/tipo/remetente).
- **Índice parcial**: a invariante só vale para um subconjunto de linhas, e linhas fora desse subconjunto
  devem poder coexistir livremente (ex.: `Conversation` — só uma ativa por contato, mas várias fechadas/
  resolvidas do mesmo contato são o histórico normal).

## Quando usar `P2002` vs. transação vs. lock

- **`P2002` (constraint + catch)**: primeira escolha sempre que a invariante for expressável como
  `UNIQUE`/índice parcial (ver ADR-0002). Atômico, sem lock explícito de aplicação, sem infraestrutura
  nova.
- **Transação (`$transaction`)**: use quando múltiplas escritas precisam ser tudo-ou-nada juntas (ex.:
  criar `Company` + `User` admin no cadastro público — ver `AuthService#registerCompany`), não como
  substituto de constraint única.
- **`SELECT ... FOR UPDATE`**: só cogitar se a invariante não for expressável como constraint (ex.:
  precisa agregar/somar múltiplas linhas antes de decidir) — não é o caso de nenhum recurso do projeto
  hoje. Exige transação aberta durante toda a decisão; aumenta contenção.
- **Lock distribuído (Redis)**: evitar. Resolve o mesmo problema que uma constraint resolve nativamente,
  com o custo de uma dependência de coordenação externa a mais. Só cogitar se a invariante genuinamente
  não puder ser expressa no PostgreSQL.

## Como implementar retry

- Falha **transitória** (rede, serviço externo fora do ar momentaneamente, timeout, conexão de banco
  caiu) → deixe o Bull re-tentar (`attempts`/`backoff`).
- Falha **permanente** (payload malformado, credencial inválida, HTTP 4xx exceto 429) → **não** gaste
  tentativas — `job.discard()` explícito. Retentar um erro que não muda é desperdício e atrasa a DLQ.
- Erro **não reconhecido** → sempre trate como transitório (retenta). Perder um evento por classificação
  errada é pior que gastar uma tentativa à toa.
- Referência de implementação: `webhook.errors.ts#classifyWebhookError`.
- Cada fila com requisito de retry diferente do default global (`attempts: 3`, backoff exponencial 2s,
  em `app.module.ts`) declara sua própria política — ver ADR-0005. Não mude o default global pra
  acomodar uma fila específica.

## Quando usar backoff exponencial (e quando não)

Use backoff exponencial sempre que a causa provável da falha for **carga/instabilidade temporária** de
um serviço externo — dar mais tempo entre tentativas aumenta a chance de o serviço já ter se recuperado.
Não use backoff longo pra falha que é quase sempre bug de código (ex.: jobs internos que só tocam o
próprio Postgres) — backoff curto e poucas tentativas já é suficiente, e um backoff longo só atrasa a
detecção de um bug real.

## Quando usar DLQ

Ver [ADR-0006](../05-ADR/ADR-0006-dead-letter-queue.md). Resumo: só quando a fonte do evento é externa e
historicamente instável, perder o evento tem custo de negócio alto, e reprocessar manualmente depois faz
sentido (o estado de origem não expira rápido demais pra isso ter valor).

## Como tratar exceções

Ver [ADR-0007](../05-ADR/ADR-0007-tratamento-de-erros.md). Resumo: `ValidationPipe` global cuida de shape
de request; `SentryExceptionFilter` global cuida de reporte externo; `classifyWebhookError` (ou
equivalente, se um novo processor de fila precisar) cuida de política de retry — são 3 perguntas
diferentes, não escreva um 4º mecanismo genérico tentando unificá-las sem necessidade comprovada.

## Como implementar observabilidade / logs estruturados

Ver [`docs/25-Observabilidade/logs-estruturados-e-correlacao.md`](../25-Observabilidade/logs-estruturados-e-correlacao.md)
e [ADR-0008](../05-ADR/ADR-0008-observabilidade.md).

## Como implementar testes de concorrência

Ver [`docs/23-Testes/Stress/concorrencia-real.md`](../23-Testes/Stress/concorrencia-real.md).

## Camadas do backend (referência rápida)

Controller → Service (regra de negócio + acesso a dado via `this.prisma.<model>.*` direto — **não existe
camada de repository separada no projeto**, decisão implícita já consolidada: Prisma Client injetado é o
próprio ponto de acesso a dado, sem indireção extra) → PostgreSQL. Filas Bull são consumidas por
`*.processor.ts` dedicados, nunca direto por um controller.
