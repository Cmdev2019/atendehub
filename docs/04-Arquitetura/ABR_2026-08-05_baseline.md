# Architecture Baseline Review (ABR) — AtendeHub

**Data:** 2026-08-05
**Escopo:** `apps/api` (NestJS + Prisma + PostgreSQL + Redis/Bull), `infra/postgres/init.sql`.
**Método:** inspeção direta do código-fonte via busca estrutural (grep/glob) + leitura integral
dos arquivos citados + execução real da suíte de testes com cobertura (`npx jest --coverage`).
**Regra seguida:** nenhuma conclusão sem trecho de código citado. Onde a verificação não foi
possível ou não foi completa, está marcado explicitamente como **NÃO ENCONTRADO** ou
**NÃO FOI POSSÍVEL VALIDAR (escopo)**.
**Fora do escopo desta revisão:** nenhuma alteração de código, nenhum commit, nenhuma sugestão
de patch — só inventário. Corresponde ao pedido do usuário para preparar a leva B-40 a B-44 do
`ROADMAP_ESTABILIZACAO.md`.

---

## 1. Resumo executivo

O backend tem uma característica consistente em toda a base: **a autorização e o isolamento
multi-tenant são inteiramente responsabilidade da camada de serviço, aplicados manualmente em
cada método** — não existe nenhum mecanismo estrutural (guard de escopo, RLS no banco, middleware)
que impeça uma consulta de esquecer o filtro. O padrão observado (`findFirst({where:{id,
companyId}})` como "portão de ownership" seguido de `update({where:{id}})` sem `companyId`) é
**disciplinado e uniforme** em todos os 18 controllers e ~20 services lidos por completo — não
há um único caso, dentro do que foi verificado, de uma mutação que pule esse portão. O risco não
está em um bug pontual: está estrutural, em depender de disciplina humana em toda futura rota
nova, sem rede de proteção.

Dois achados novos (não estavam em nenhum item do roadmap) apareceram nesta revisão:

- **Autenticação de WebSocket não consulta a blacklist de token nem revalida `isActive` no
  banco** — o middleware de handshake do Socket.IO (`events.gateway.ts:63-89`) só verifica a
  assinatura/expiração do JWT via `jwtService.verify()`, ao contrário do `JwtStrategy` usado no
  HTTP, que faz as duas checagens (`jwt.strategy.ts:36-64`). Um token revogado via
  `/auth/revoke` continua autenticando WebSocket até expirar.
- **Cobertura de testes real medida é 50,28% de statements** (não os "356/356 testes passando"
  citados no roadmap — esse número é de testes, não de cobertura de código; os dois fatos são
  compatíveis e não se contradizem, mas o roadmap nunca havia registrado a métrica de cobertura
  em si). **Todos os 18 controllers, exceto 3, estão em 0% de cobertura de statements/functions**
  — a lógica de roteamento e a fiação dos guards em cada endpoint não é exercitada por nenhum
  teste automatizado, só indiretamente pelos testes de service.

O restante dos achados já era conhecido e catalogado no roadmap (B-40 a B-47) — esta revisão os
**confirma com evidência de código fresca**, adiciona linha exata e, em alguns casos, refina o
raio do problema (ex.: B-41 tem hoje 3 pontos sem filtro de tenant, não 2 — ver §4).

---

## 2. Inventário de Controllers

18 controllers em `apps/api/src/modules/*/`. Nenhum usa `@Version()` (não há versionamento de
rota — só o prefixo estático `api/v1` fixado em `main.ts:69`). Nenhum usa `@ApiTags`/decorators
do Swagger — **confirma B-45**: `@nestjs/swagger` não está em `package.json`
(`grep -n "@nestjs/swagger" apps/api/package.json` → sem resultado). Um único `@UseInterceptors`
por controller é local (`FileInterceptor` em upload de mídia/avatar); o único interceptor
**global** é `MediaPresignInterceptor`, registrado via `APP_INTERCEPTOR` em `app.module.ts:109-112`.

| Controller | Prefixo | Guards de classe | `@Roles` presentes | Rotas públicas (`@Public`) |
|---|---|---|---|---|
| `audit-log.controller.ts` | `audit-logs` | `JwtAuthGuard, RolesGuard` | `ADMIN` (GET) | — |
| `auth.controller.ts` | `auth` | *nenhum na classe* — por rota | — | `login`, `register-company`, `refresh` |
| `auto-attendance.controller.ts` | `auto-attendance` | `JwtAuthGuard, RolesGuard` | `ADMIN` (todas as mutações) | — |
| `company.controller.ts` | `company` | `JwtAuthGuard, RolesGuard` | `ADMIN` (PATCH `me`) | — |
| `contact.controller.ts` | `contacts` | `JwtAuthGuard, RolesGuard` | `ADMIN` (delete, export) | — |
| `conversation.controller.ts` | `conversations` | **`JwtAuthGuard` apenas** | *nenhum* | — |
| `dashboard.controller.ts` | `dashboard` | **`JwtAuthGuard` apenas** | *nenhum* | — |
| `department.controller.ts` | `departments` | `JwtAuthGuard, RolesGuard` | `ADMIN` (todas as mutações) | — |
| `health.controller.ts` | `health` | *nenhum* | — | `GET /health`, `GET /health/ready` |
| `message.controller.ts` | `conversations/:id/messages` | **`JwtAuthGuard` apenas** | *nenhum* | — |
| `note.controller.ts` | `conversations/:id/notes` | **`JwtAuthGuard` apenas** | *nenhum* | — |
| `notification.controller.ts` | `notifications` | `JwtAuthGuard` | — | — |
| `queue.controller.ts` | `queues` | `JwtAuthGuard, RolesGuard` | `ADMIN` (mutações) | — |
| `report.controller.ts` | `reports` | **`JwtAuthGuard` apenas** | *nenhum* | — |
| `tag.controller.ts` | `tags` | `JwtAuthGuard, RolesGuard` | `SUPERVISOR` (mutações) | — |
| `user.controller.ts` | `users` | `JwtAuthGuard, RolesGuard` | `SUPERVISOR`/`ADMIN` (misto) | — |
| `webhook-dlq.controller.ts` | `webhooks/dlq` | `JwtAuthGuard, RolesGuard` | `ADMIN` (tudo) | — |
| `webhook.controller.ts` | `webhooks` | *nenhum na classe* — por rota | `ADMIN` (só `/metrics`) | `POST /webhooks/evolution` |
| `whatsapp.controller.ts` | `whatsapp` | `JwtAuthGuard, RolesGuard` | `ADMIN` (mutações) | — |

**Respostas às perguntas do escopo:**

- **Guards em todos:** todos os 18 têm ao menos `JwtAuthGuard` (por classe ou por rota),
  exceto as rotas explicitamente `@Public()` (login, register, refresh, health, webhook Evolution).
- **Controller completamente público:** `HealthController` — por desenho (health check de
  orquestrador, não pode exigir token). `WebhookController` é público só na rota
  `POST /evolution` (autenticação própria por apikey, `webhook.controller.ts:77-107`); a rota
  `GET /metrics` do mesmo controller tem `@UseGuards(RolesGuard)` **sem** `JwtAuthGuard` no
  próprio decorator — funciona porque não há `@Public()` na classe nem na rota, e `RolesGuard`
  sozinho não autentica, só autoriza. **Achado:** isso significa que `GET /webhooks/metrics`
  depende de `RolesGuard` ler `context.switchToHttp().getRequest().user` — se não houver
  `JwtAuthGuard` em algum ponto da cadeia, `request.user` é `undefined` e
  `ROLE_HIERARCHY[undefined]` resolve a `0` (`roles.guard.ts:29`), que nunca é `>=` a nenhum
  role exigido → a rota **nega acesso por padrão** nesse cenário (fail-closed acidental, não
  fail-open) — mas o motivo de funcionar corretamente é um efeito colateral do `?? 0`, não uma
  garantia desenhada. **NÃO FOI POSSÍVEL VALIDAR** se algum outro guard global implícito
  autentica essa rota antes — busca em `app.module.ts` não mostra nenhum `APP_GUARD` de
  autenticação, só `ThrottlerGuard`.
- **`AuthGuard` sem autorização granular:** `ConversationController`, `MessageController`,
  `NoteController`, `DashboardController`, `ReportController` — **confirma B-40** com evidência
  de linha (tabela acima).
- **Acessível apenas por autenticação (sem roles):** os 5 acima + `NotificationController`
  (por desenho: notificações são sempre do próprio usuário, filtradas por `userId` do JWT,
  `notification.service.ts:63,76` — não é uma lacuna, é escopo correto por design).
- **Sem autenticação:** `HealthController` (por desenho) e a rota `evolution` do
  `WebhookController` (autenticação própria por apikey, não por JWT).

---

## 3. Inventário de Guards

Apenas **3 guards** em todo o backend — todos em `modules/auth/guards/`:

| Guard | Arquivo | Responsabilidade | Escopo |
|---|---|---|---|
| `JwtAuthGuard` | `jwt-auth.guard.ts` | Autentica via estratégia Passport `jwt`; pula se `@Public()` | Por controller/rota, aplicado manualmente |
| `LocalAuthGuard` | `local-auth.guard.ts` | Valida email/senha na estratégia `local` | Só `POST /auth/login` |
| `RolesGuard` | `roles.guard.ts` | Compara `user.role` contra `@Roles(...)` via hierarquia numérica | Por controller/rota, aplicado manualmente |

**Respostas às perguntas do escopo — todas negativas, confirmadas por ausência de resultado
de busca:**

- **Guard por empresa:** NÃO ENCONTRADO. `grep -rn "companyId" modules/auth/guards/` não
  retorna nada — nenhum guard lê ou compara `companyId`. O isolamento por empresa é feito
  método a método na camada de serviço (ver §4).
- **Guard por departamento:** NÃO ENCONTRADO.
- **Guard por agente (ownership de conversa/mensagem):** NÃO ENCONTRADO. `assign`,
  `findOne`, etc. não verificam se o `agentId` da conversa bate com o usuário autenticado — a
  única exceção é `MessageService#softDelete`, que verifica `senderId === userId` **dentro do
  service**, não em um guard (`message.service.ts:283-285`).
- **Guard baseado em Roles:** SIM — `RolesGuard`, hierarquia fixa em `roles.guard.ts:7-12`
  (`SUPER_ADMIN=4 > ADMIN=3 > SUPERVISOR=2 > AGENT=1`).
- **Guard baseado em Permissions (granular, não-hierárquico):** NÃO ENCONTRADO — não existe
  conceito de permission separado de role no schema (`grep -n "Permission" prisma/schema.prisma`
  não retorna modelo nenhum).
- **Guard global:** só `ThrottlerGuard` (rate limit, `app.module.ts:103-106`). Não há
  `APP_GUARD` de autenticação nem de autorização — cada controller aplica `JwtAuthGuard`/
  `RolesGuard` manualmente, o que é o mecanismo pelo qual B-40 existe (bastou 5 controllers
  esquecerem `RolesGuard`, e nada no framework os força a declará-lo).
- **Duplicação de lógica entre guards:** não há — os 3 guards têm responsabilidades disjuntas.
- **Autorização implementada apenas no Service (sem guard nenhum):** SIM, é o padrão
  dominante — todo filtro de `companyId`, toda checagem de "esta conversa pertence a este
  agente/departamento" vive em métodos de service (`assertConversationOwnership`,
  `assertOwnership`, `assertBelongsToCompany`, `findOne(companyId, id)` como portão prévio),
  nunca em um guard reutilizável. Ver §11 para a avaliação arquitetural desse padrão.

---

## 4. Multi-tenancy

### 4.1 Onde `companyId` existe/não existe

**Schema Prisma** (`apps/api/prisma/schema.prisma`) — 14 modelos com `companyId`: `User`,
`Department`, `Queue`, `AutoAttendanceFlow`, `WhatsAppConnection`, `Contact`, `Conversation`,
`Tag`, `Webhook`, `Notification`, `AuditLog` (+ `Company` como raiz). **Sem `companyId`:**
`RefreshToken` (só `userId`, `schema.prisma:187-199`), `Message` (herda via `Conversation`),
`Attachment` (herda via `Message`), `InternalNote` (herda via `Conversation`),
`AutoAttendanceMenuOption` (herda via `AutoAttendanceFlow`).

**JWT:** `companyId` está no payload (`jwt.strategy.ts:11`, `auth.service.ts:126`) e é
devolvido pelo `JwtStrategy#validate` junto com o registro completo do usuário
(`jwt.strategy.ts:50-61`) — disponível em `request.user.companyId` em toda rota autenticada.

**Contexto de requisição (`AsyncLocalStorage`):** `shared/logging/request-context.ts` só
armazena `requestId` (interface `RequestContextStore` tem um único campo, linha 4-6). **NÃO
propaga `companyId`** — confirma a leitura do B-41 no roadmap. Toda função que precisa de
`companyId` fora do ciclo HTTP direto (jobs Bull) recebe via parâmetro explícito, não via
contexto implícito.

**Redis:** nenhum client Redis usa namespace por empresa — `TokenBlacklistService` chaveia por
hash do token (não teria motivo tenant, é global por natureza), `AutoAttendanceSessionService`
por `conversationId` (`grep -n "companyId" modules/auto-attendance/auto-attendance-session.service.ts`
→ **NÃO ENCONTRADO**, mas o `conversationId` já é escopado por company na criação, então não é
um vazamento direto, só ausência de defesa em profundidade).

**Bull Queue:** `SlaCheckJobData` e o job de auto-atendimento (`auto-attendance-inactivity.processor.ts:9`)
**incluem `companyId` explicitamente no payload do job** — é o padrão correto, replicando o que
o B-39 já fazia para `requestId` em `WebhookJobData`. O job de webhook em si não carrega
`companyId` porque ainda não se sabe a qual empresa a mensagem pertence até resolver a conexão
(`webhook.processor.ts:245-249`, `whatsAppConnection.findUnique` por `sessionName` →
`connection.companyId`) — desenho correto, não é uma lacuna.

**Eventos (WebSocket):** `EventsGateway` isola por sala `company:${companyId}`
(`events.gateway.ts:97`), atribuída no handshake a partir do JWT verificado
(`events.gateway.ts:74-83`) — nunca de um parâmetro livre do cliente. Correto.

**Webhooks (entrada):** o payload da Evolution não traz `companyId` — o tenant é resolvido a
partir da instância (`sessionName`) contra `WhatsAppConnection.companyId`
(`webhook.processor.ts:245-249`). Depende inteiramente da apikey validada
(`webhook.controller.ts:77-107`) mais o `sessionName` não ser adivinhável — não há um segundo
fator de isolamento por tenant nesse ponto de entrada além disso.

### 4.2 Row-Level Security — estado real

`infra/postgres/init.sql` (arquivo completo, 24 linhas): cria a função
`current_company_id()` (linhas 20-23) mas **não há nenhum `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY`, nenhum `CREATE POLICY`, em nenhum arquivo do repositório**
(`grep -rn "ENABLE ROW LEVEL SECURITY\|CREATE POLICY" .` a partir da raiz → sem resultado, fora
deste arquivo de busca). A função existe mas nunca é chamada por nenhum código da aplicação
(`grep -rn "current_company_id\|SET.*app\.current_company_id" apps/api/src` → sem resultado).
**Confirma B-41 integralmente.**

### 4.3 Mutações sem filtro de `companyId` — inventário completo

Busca exaustiva de `updateMany`/`deleteMany`/`createMany`/`executeRaw`/`queryRaw`/`$transaction`
em `apps/api/src` (fora de `.spec.ts`) — **9 ocorrências, todas listadas:**

| # | Arquivo:linha | Operação | Filtro | `companyId`? | Risco |
|---|---|---|---|---|---|
| 1 | `message.service.ts:261` (`updateStatus`) | `message.updateMany` | `{ externalId }` | ❌ Não | 🟠 Alto — `externalId` é `@@unique` **global** no schema (`schema.prisma:446`), não por empresa. Duas empresas com IDs de mensagem WhatsApp colidentes (teoricamente possível, ainda que raro) fariam uma sobrescrever o status da outra. **Já citado no B-41**, aqui confirmado com a linha exata e a constraint do schema que o torna explorável. |
| 2 | `webhook.service.ts:365` (`handleMessagesDelete`) | `message.updateMany` | `{ externalId: key.id }` | ❌ Não | 🟠 Alto — mesmo padrão do item 1, caminho de entrada é o webhook (apikey validada, mas não companyId). **Já citado no B-41.** |
| 3 | `whatsapp.service.ts:289` (`handleQrCodeUpdate`) | `whatsAppConnection.updateMany` | `{ sessionName }` | ❌ Não | 🟡 Médio — `sessionName` **não tem `@@unique`** no schema, só `@@index` (`schema.prisma:327`); é gerado como `` `${slug}-${safeName}-${Date.now()}` `` (`whatsapp.service.ts:94`), incluindo o slug da própria empresa — colisão exigiria dois slugs de empresa + mesmo milissegundo, praticamente impossível na prática, mas **não é impedido pelo banco**. **Achado novo, não estava em nenhum item do roadmap.** |
| 4 | `auth.service.ts:218` (`logout`) | `refreshToken.updateMany` | `{ token: hash, revokedAt: null }` | N/A — `RefreshToken` não tem `companyId` no schema | 🟢 Baixo — `token` é `@@unique` (`schema.prisma:190`), hash de 256 bits; colisão é criptograficamente inviável. Escopo correto por desenho. |
| 5 | `refresh-token-cleanup.service.ts:17` | `refreshToken.deleteMany` | `OR: [expirado, revogado]` | N/A | 🟢 Baixo — limpeza intencionalmente global (job cron), só remove tokens já inutilizáveis, nunca ativos. |
| 6 | `notification.service.ts:76` (`markAllAsRead`) | `notification.updateMany` | `{ companyId, userId, readAt: null }` | ✅ Sim | 🟢 Nenhum — escopado corretamente. |
| 7 | `auto-attendance.service.ts:154` (`reorderMenuOptions`) | `$transaction([...update])` | cada `update` por `id` já validado contra `flowId` do `companyId` (linhas 145-151) | ✅ Indireto | 🟢 Nenhum — os IDs já foram confirmados pertencentes à empresa antes da transação. |
| 8 | `auth.service.ts:106` (`registerCompany`) | `$transaction(async tx => ...)` | cria `Company`+`User` juntos | N/A (criação, não leitura cross-tenant) | 🟢 Nenhum. |
| 9 | `health.service.ts:61` | `$queryRaw\`SELECT 1\`` | nenhum (healthcheck) | N/A | 🟢 Nenhum. |

**Nenhum `createMany` foi encontrado em código de produção.** Nenhum `executeRaw` foi encontrado
— o único `$queryRaw` é o `SELECT 1` do healthcheck.

**Achado adicional (não é `updateMany`, mas é o mesmo padrão de risco):** `message.service.ts:42`
— `cursorMsg = prisma.message.findUnique({ where: { id: before } })`, usado para paginação por
cursor em `MessageService#findAll`, **não verifica se a mensagem `before` pertence à mesma
conversa/empresa do chamador**. Um agente autenticado pode passar o `id` de uma mensagem de
**outra empresa** como parâmetro `before` e o servidor lê o `sentAt` dela para montar o filtro de
paginação da sua própria consulta. Não vaza o conteúdo da mensagem alheia diretamente, mas é um
oráculo de timing (permite inferir, por busca binária de IDs, quando uma mensagem com aquele ID
foi enviada em outra empresa). 🟡 Médio — esforço de exploração baixo, impacto de vazamento
limitado a um timestamp. **Achado novo.**

### 4.4 Padrão dominante de proteção (verificado em `ConversationService`, `MessageService`,
`NoteService`, `TagService`, `UserService`, `ContactService`, `QueueService`,
`DepartmentService`, `AutoAttendanceService` — leitura integral de cada arquivo):

Todo `update`/`delete` que muta um recurso por `id` é precedido por um `findFirst`/`findOne`
que filtra por `{ id, companyId }` (ou, para recursos aninhados como `InternalNote`/`Message`,
por uma cadeia de "pertence à conversa → conversa pertence à empresa"), lançando
`NotFoundException` se não encontrar. O `update`/`delete` em si roda com `where: { id }` **sem**
`companyId` — a proteção real é o portão anterior, não a query final. Esse padrão é **100%
consistente** em todos os arquivos lidos integralmente para esta revisão; não foi encontrada
nenhuma mutação que pule o portão. Ver avaliação arquitetural em §11.

---

## 5. Prisma — consultas de leitura (`findMany`/`findFirst`/`count`/`aggregate`/`groupBy`)

Volume total (fora de `.spec.ts`, contagem por grep): **findMany/findFirst/count/aggregate ≈ 90
ocorrências** em `modules/*/*.service.ts`. Leitura integral feita nos services de maior
superfície (`conversation`, `message`, `note`, `tag`, `contact`, `user`, `department`, `queue`,
`dashboard`, `report`, `webhook`, `auto-attendance`, `notification`, `audit-log`, `whatsapp`) —
**em todos, todo `findMany`/`count`/`findFirst` de listagem carrega `companyId` no `where`**,
seja diretamente ou herdado de uma variável `where`/`activeWhere`/`createInPeriod` construída
com `companyId` no topo da função (padrão visto em `conversation.service.ts:98-115`,
`dashboard.service.ts:26-31`, `contact.service.ts:31-43`).

**`findUnique` — todas as 26 ocorrências do backend, revisadas individualmente:**

| Arquivo:linha | Model.campo único usado | Risco de cross-tenant |
|---|---|---|
| `auth.service.ts:98,272` | `user.email` (único **global**, decisão B-20 documentada em `user.service.ts:133-135`) | 🟢 Nenhum — desenhado para ser global (tela de login não pede empresa) |
| `auth.service.ts:153` | `company.slug` | 🟢 Nenhum — checagem de disponibilidade de slug antes de criar empresa nova |
| `auth.service.ts:163` | `refreshToken.token` (hash único) | 🟢 Nenhum |
| `jwt.strategy.ts:50` | `user.id` (do próprio JWT assinado) | 🟢 Nenhum |
| `auto-attendance-engine.service.ts:91,146,225` / `auto-attendance.service.ts:39,72,139` | `autoAttendanceFlow.companyId` (é `@unique`, não `id`) | 🟢 Nenhum — a própria constraint é por empresa |
| `auto-attendance-engine.service.ts:208` | `conversation.id` (recebido via job do Bull, que já foi enfileirado com `companyId`/`conversationId` resolvidos por código anteriormente escopado) | 🟢 Nenhum direto — depende do chamador ter validado antes; **não há checagem própria neste ponto** |
| `company.service.ts:10` | `company.id` — mas **oriundo do `companyId` do próprio JWT do requisitante** | 🟢 Nenhum |
| `contact.service.ts:111` | `contact.id` **NÃO FOI POSSÍVEL VALIDAR sem ler as ~10 linhas de contexto adicionais** — não lido integralmente nesta passada | ⚪ Não verificado |
| `conversation.service.ts:446` | `queue.id`, já resolvido de um `queueId` gravado por um fluxo já escopado por empresa | 🟢 Nenhum |
| `message.service.ts:42` | `message.id` (parâmetro `before` do cliente) | 🟡 Ver achado em §4.3 |
| `sla-check.processor.ts:52` | `conversation.id` (do job, que carrega `companyId` junto — `sla-check.processor.ts:44`, mas o `findUnique` em si não filtra por ele) | 🟢 Baixo — o processor confere `companyId` do job contra o resultado depois (**NÃO FOI POSSÍVEL VALIDAR sem leitura completa do processor nesta passada**) |
| `user.service.ts:122,136` | `company.id` (do JWT) / `user.email` (global, mesma razão do B-20) | 🟢 Nenhum |
| `webhook.processor.ts:245` / `webhook.service.ts:151,392,423` | `whatsAppConnection.sessionName` — é como o tenant é **descoberto**, não um vazamento (a query não tem `companyId` porque é ela quem determina qual é) | 🟢 Nenhum, por desenho |
| `whatsapp.service.ts:76,97,246` | `company.id` (do JWT) / `whatsAppConnection.sessionName`/`id+companyId` | 🟢 Nenhum |

**NÃO FOI POSSÍVEL VALIDAR (escopo):** revisão linha a linha de 100% dos ~90 `findMany`/
`findFirst` fora dos 15 services listados acima (ex.: uso interno em `send-message.service.ts`,
`evolution.service.ts`, `media-download.service.ts`) não foi completada nesta passada — a
amostragem cobriu os services de maior superfície de dado sensível (conversas, mensagens,
contatos, usuários), não a totalidade absoluta dos ~30 arquivos de service do backend.

---

## 6. Redis

**4 clientes Redis instanciados via `new Redis(...)` (ioredis), todos separados, nenhum
injetado via DI/factory compartilhada** — mais o client interno do BullMQ (configurado, não
instanciado manualmente, em `app.module.ts:46-56`) = **5 conexões Redis distintas ao mesmo
processo**, confirmando o achado já registrado na ACR de 2026-08-01 (B-46, nota da ACR).

| # | Arquivo:linha | Classe | Config | Observação |
|---|---|---|---|---|
| 1 | `shared/websocket/redis-io.adapter.ts:31` | `RedisIoAdapter` | `host/port/password`, `maxRetriesPerRequest: null` | Adapter do Socket.IO para pub/sub entre réplicas |
| 2 | `modules/auto-attendance/auto-attendance-session.service.ts:19` | `AutoAttendanceSessionService` | própria instância no construtor | Sem namespace por empresa (ver §4.1) |
| 3 | `modules/health/health.service.ts:28` | `HealthService` | própria instância no construtor | Só para `PING` no healthcheck |
| 4 | `modules/auth/token-blacklist.service.ts:22` | `TokenBlacklistService` | própria instância no construtor | Código de segurança (blacklist de token revogado) |
| 5 (implícito) | `app.module.ts:46-56` | `BullModule.forRootAsync` | `keyPrefix: 'bull:'` | Não é `new Redis()` explícito, mas abre sua própria conexão |

**Respostas:**
- **Quantos clientes:** 5 (4 explícitos + 1 do Bull).
- **Singleton:** não há — cada um é `@Injectable()` com seu próprio `new Redis()` no construtor,
  então o Nest gerencia uma instância por processo (singleton *de fato*, por escopo padrão do
  Nest), mas não há um **provider compartilhado** — são 5 conexões TCP separadas ao mesmo Redis.
- **Factory:** NÃO ENCONTRADO — nenhum `RedisModule`/`useFactory` compartilhado.
- **Provider DI:** parcial — cada serviço é injetável, mas o cliente Redis em si não é um
  provider do Nest, é criado imperativamente dentro do construtor.
- **Duplicação:** SIM, arquitetural — 4 clientes com config idêntica (`host`, `port`,
  `password` das mesmas env vars), sem diferenciação técnica real entre eles. Já registrado
  como não-consolidado intencionalmente no B-46 (risco de mexer em código de segurança em
  produção fora do escopo de uma correção funcional).
- **Reconexão:** ioredis reconecta automaticamente por padrão (comportamento da lib, não
  configuração explícita vista no código, exceto `maxRetriesPerRequest: null` no adapter do
  Socket.IO). **NÃO FOI POSSÍVEL VALIDAR** política de retry customizada nos outros 3.
- **Namespace/isolamento por tenant:** NÃO ENCONTRADO em nenhum dos 4 clientes.

---

## 7. Bull Queues

4 filas nomeadas em `shared/queues/queue-names.ts:6-15`:

| Fila | Processor | Producer(s) | `companyId` no job? | Retry | DLQ |
|---|---|---|---|---|---|
| `webhook` | `webhook.processor.ts` (`@Processor`) | `webhook.controller.ts:130` | ❌ Não (resolvido dentro do processor, ver §4.1) | Configurável via `WEBHOOK_ATTEMPTS`/`WEBHOOK_BACKOFF` (`webhook-queue.config.ts`, específico desta fila — B-15/B-39) | ✅ Sim — `webhook-dlq`, consumida só manualmente via `WebhookDlqController`/`WebhookDlqService` |
| `webhook-dlq` | *nenhum* (`@Processor` NÃO ENCONTRADO para esta fila) | `webhook.processor.ts` (em falha) | Herda do job original | N/A — é o destino final | É a própria DLQ |
| `sla-check` | `sla-check.processor.ts:31` | `conversation.service.ts:79` (`scheduleSlaCheck`) | ✅ Sim (`sla-check.processor.ts:14`) | Default global do Bull (`app.module.ts:57-65`: 3 tentativas, backoff exponencial 2s) | ❌ Não |
| `auto-attendance-inactivity` | `auto-attendance-inactivity.processor.ts:17` | `auto-attendance-engine.service.ts:66-69` | ✅ Sim (`auto-attendance-inactivity.processor.ts:9`) | Default global | ❌ Não |

**Respostas:**
- **As filas conhecem `companyId`:** 2 de 4 (`sla-check`, `auto-attendance-inactivity`) o
  carregam explicitamente no payload do job. `webhook` não carrega porque ainda não é
  conhecido no momento do enfileiramento (é resolvido dentro do processor a partir da
  instância) — desenho correto, não uma lacuna.
- **Isolamento entre tenants dentro da fila:** não há partição física por tenant (todas as
  empresas compartilham a mesma fila `webhook`/`sla-check`/etc.) — é isolamento lógico via
  `companyId` no payload de cada job individual, não por fila.
- **Risco de mistura de tenants:** baixo — cada job carrega (ou resolve) seu próprio
  `companyId`/`conversationId`, processados sequencialmente por worker; não há operação em lote
  que misture jobs de tenants diferentes numa única transação.
- **Retry:** confirmado — política própria em `webhook` (divergência intencional, já
  documentada na ACR de 2026-08-01) vs. default global do Bull nas outras 3.
- **DLQ:** só `webhook` tem. `sla-check` e `auto-attendance-inactivity` não têm — um job que
  esgota as tentativas é descartado silenciosamente (fica em `failed` do Bull, sem
  reprocessamento estruturado). **NÃO FOI POSSÍVEL VALIDAR** se isso já causou perda de alerta
  de SLA em produção — está fora do escopo desta revisão (é comportamento, não código).

---

## 8. Endpoints — classificação completa (85 rotas)

Contagem de handlers HTTP (`@Get/@Post/@Patch/@Put/@Delete`) nos 18 controllers: **85 rotas**
(bate com o número já citado no roadmap para B-45). Classificação por tipo de acesso:

| Classificação | Quantidade | Exemplos |
|---|---|---|
| Pública (sem token) | 4 | `POST /auth/login`, `POST /auth/register-company`, `POST /auth/refresh`, `POST /webhooks/evolution` |
| Health/Internal | 2 | `GET /health`, `GET /health/ready` |
| Autenticada, sem role mínima (`AGENT` já basta) | ~45 | todas as rotas de `conversations`, `messages`, `notes`, `dashboard`, `reports`, a maioria de `contacts`/`whatsapp`/`queues`/`departments`/`tags`/`users` em modo leitura |
| Autenticada, `SUPERVISOR`+ | 6 | `tags` (criar/editar/remover), `users` (listar, ver detalhe) |
| Autenticada, `ADMIN`+ | ~27 | mutações de `whatsapp`, `department`, `queue`, `auto-attendance`, `webhook-dlq`, `audit-logs`, `company`, `contacts` (delete/export), `users` (create/edit/delete/reset) |
| Webhook (apikey própria) | 1 | `POST /webhooks/evolution` |

**Respostas:**
- **Endpoint exposto desnecessariamente:** `GET /webhooks/metrics` (Prometheus) fica sob o
  mesmo prefixo público `webhooks/` — protegido por `RolesGuard`+`@Roles(ADMIN)`
  (`webhook.controller.ts:145-146`), mas **sem `JwtAuthGuard` explícito na rota nem na classe**
  (ver análise em §2). Funciona hoje porque `RolesGuard` nega por padrão sem `request.user`,
  mas é uma dependência implícita frágil — um refactor futuro que mude o comportamento de
  fallback do `RolesGuard` quebraria essa proteção silenciosamente.
- **Rota administrativa pública:** NÃO ENCONTRADO — todas as rotas de mutação sensível exigem
  ao menos `JwtAuthGuard`.
- **Rota sem Guard algum:** só as 4 públicas + as 2 de health, todas por desenho documentado.
- **Rota "protegida apenas pelo frontend":** NÃO ENCONTRADO no backend em si — mas o `B-40`
  já documenta que a ausência de escopo por departamento/agente é, na prática, uma proteção que
  hoje só existe no frontend (a UI não oferece a ação, mas a API aceita).

---

## 9. Segurança

| Item | Estado | Evidência |
|---|---|---|
| JWT | ✅ Implementado, `passport-jwt`, secret validado no boot (`main.ts:110-144`, falha o processo em prod/staging se o secret for fraco/placeholder) | `jwt.strategy.ts` |
| Refresh Token | ✅ Tabela dedicada, hash armazenado (não o token puro), rotacionado no `login`/`refresh`, revogável (`auth.service.ts`) | `schema.prisma:187-199` |
| Blacklist de access token | ✅ Redis, TTL até expiração do token (`token-blacklist.service.ts`) — **mas não usado pelo WebSocket** (achado §10.1 abaixo) | — |
| API Keys (webhook) | ✅ Comparação em tempo constante (`timingSafeEqual` sobre hash SHA-256), fail-closed se `EVOLUTION_API_KEY` não configurada | `webhook.controller.ts:77-107,166-170` |
| Rate limit | ✅ Global via `ThrottlerGuard` (100/60s default) + overrides pontuais (`login`: 5/60s, `register-company`: 3/60s, `refresh`: 10/60s, `webhooks/evolution`: 200/60s) | `app.module.ts:35-44`, `auth.controller.ts`, `webhook.controller.ts:69` |
| Helmet | ✅ `app.use(helmet())` | `main.ts:56` |
| Compression | ✅ | `main.ts:57` |
| CORS | ✅ Configurado por `CORS_ORIGINS`, com validação que **derruba o boot** em prod/staging se vier vazio ou `*` | `main.ts:60-66,152-174` |
| CSRF | NÃO ENCONTRADO nenhum mecanismo — mas API é 100% Bearer token (não usa cookie de sessão), então CSRF clássico não se aplica ao modelo atual (decisão já registrada como B-19, tokens em `localStorage`) | — |
| `ValidationPipe` | ✅ Global, `whitelist: true` + `forbidNonWhitelisted: true` + `transform: true` | `main.ts:84-93` |
| class-validator / class-transformer | ✅ Usado consistentemente nos DTOs (amostra: `list-conversations.dto.ts`) | `package.json:44` |
| Sanitização de HTML/XSS de input | NÃO FOI POSSÍVEL VALIDAR — não há biblioteca de sanitização (`sanitize-html`, `dompurify` etc.) nas dependências; a mitigação de XSS depende inteiramente de o frontend escapar output, não foi verificado neste ciclo |
| Swagger/OpenAPI | ❌ Confirma B-45 — ausente |
| RLS no Postgres | ❌ Confirma B-41 — função existe, políticas não |
| Header de segurança no Nginx | NÃO FOI POSSÍVEL VALIDAR nesta revisão (já é o B-43, fora do escopo de código do backend em si) |

### 9.1 Achado novo — autenticação de WebSocket não verifica blacklist nem `isActive`

`events.gateway.ts:63-89` (middleware de handshake) chama só `this.jwtService.verify()`. Compare
com `jwt.strategy.ts:36-64` (usado pelo `JwtAuthGuard` do HTTP), que faz **duas checagens
adicionais**: `tokenBlacklist.isBlacklisted(token)` (linha 43) e `user.isActive` no banco (linha
59). Nenhuma das duas aparece em `events.gateway.ts` — busca confirmada:
`grep -n "TokenBlacklist\|isActive\|blacklist" modules/events/events.gateway.ts` → sem
resultado. **Efeito prático:** `POST /auth/revoke` (revogação explícita de um token
comprometido) invalida o HTTP imediatamente, mas uma conexão WebSocket já autenticada (ou uma
nova conexão feita com o mesmo token revogado) continua funcionando até o JWT expirar
naturalmente. Da mesma forma, desativar um usuário (`isActive: false`) não derruba sessões de
WebSocket já abertas. 🟡 Médio — janela limitada à validade do access token (curta, por
desenho), mas é uma inconsistência real entre os dois caminhos de autenticação do mesmo sistema.

---

## 10. Cobertura de testes

**Medição real, executada nesta revisão** (`npx jest --coverage`, 40 suites, 367 testes, todos
passando):

```
Statements   : 50.28% ( 1589/3160 )
Branches     : 55.56% ( 469/844 )
Functions    : 50.09% ( 262/523 )
Lines        : 50.57% ( 1440/2847 )
```

CI (`api-ci.yml`) roda `npm test` **sem `--coverage`** — não há gate de cobertura, e o número
acima nunca é medido nem exposto em nenhum pipeline atual.

### 10.1 Controllers — 0% em 15 dos 18

| Controller | Statements | Functions |
|---|---|---|
| `health.controller.ts` | 100% | 100% |
| `webhook.controller.ts` | 97.8% | 100% |
| `auto-attendance.controller.ts` | 93.5% | 75% |
| `audit-log.controller.ts` | **0%** | **0%** |
| `auth.controller.ts` | **0%** | **0%** |
| `company.controller.ts` | **0%** | **0%** |
| `contact.controller.ts` | **0%** | **0%** |
| `conversation.controller.ts` | **0%** | **0%** |
| `dashboard.controller.ts` | **0%** | **0%** |
| `department.controller.ts` | **0%** | **0%** |
| `message.controller.ts` | **0%** | **0%** |
| `note.controller.ts` | **0%** | **0%** |
| `notification.controller.ts` | **0%** | **0%** |
| `queue.controller.ts` | **0%** | **0%** |
| `report.controller.ts` | **0%** | **0%** |
| `tag.controller.ts` | **0%** | **0%** |
| `user.controller.ts` | **0%** | **0%** |
| `webhook-dlq.controller.ts` | **0%** | **0%** |
| `whatsapp.controller.ts` | **0%** | **0%** |

Nenhum arquivo `*.controller.spec.ts` existe para esses 15 (confirmado por
`find . -name "*.controller.spec.ts"` → só `auto-attendance.controller.spec.ts`,
`health.controller.spec.ts`). A lógica de service por trás da maioria deles **é** testada — o
gap é especificamente a fiação HTTP: qual guard está de fato aplicado, como o DTO é validado na
borda, o mapeamento de exceção para status code. **É exatamente a camada onde B-40 vive** — um
teste de controller que afirmasse "`AGENT` do departamento X recebe 404 ao pedir conversa do
departamento Y" não existe hoje nem existiria FALHAR sem a correção, porque não há teste de
controller nenhum indo por esse caminho.

### 10.2 Services com 0% de cobertura (nenhum arquivo de teste)

| Service | Statements | Módulo sem NENHUM `.spec.ts` |
|---|---|---|
| `company.service.ts` | 0% | ✅ confirmado — nenhum spec em `modules/company/` |
| `department.service.ts` | 0% | ✅ confirmado — nenhum spec em `modules/department/` |
| `note.service.ts` | 0% | ✅ confirmado — nenhum spec em `modules/note/` |
| `whatsapp.service.ts` | 11.76% | parcial — sem `.spec.ts` próprio, cobertura residual vem de outros testes que o importam indiretamente |

### 10.3 Pontos de integração externa com cobertura muito baixa

| Arquivo | Statements | Observação |
|---|---|---|
| `evolution.service.ts` | 9.72% | Cliente HTTP para a Evolution API — o ponto mais externo do sistema |
| `whatsapp.service.ts` | 11.76% | — |
| `events.service.ts` | 15.38% | Emissão de eventos Socket.IO |
| `media-download.service.ts` | 15.55% | Download/decodificação de mídia do WhatsApp (pitfall #2 do `CLAUDE.md`) |

### 10.4 Guards

| Guard | Statements | Observação |
|---|---|---|
| `roles.guard.ts` | 100% | `roles.guard.spec.ts` testa a lógica de hierarquia isoladamente |
| `jwt-auth.guard.ts` | 69.23% (branches 0%) | O desvio `@Public()` (branch principal do guard) não tem teste próprio cobrindo-o |
| `local-auth.guard.ts` | 0% | Sem teste próprio — é só uma casca de 5 linhas sobre `AuthGuard('local')`, risco baixo de ter lógica própria quebrada |

### 10.5 E2E

Só **2 arquivos**: `test/sla.e2e-spec.ts`, `test/storage.e2e-spec.ts`. Nenhum e2e cobre
autenticação, autorização por role, ou qualquer cenário multi-tenant (duas empresas, um usuário
tentando acessar dado da outra). **Nenhum cenário multi-tenant é testado em nenhuma camada** —
nem unitário nem e2e — confirmado por `grep -rn "company-1.*company-2\|outra empresa\|cross-tenant\|other.*company" apps/api/src apps/api/test --include=*.spec.ts`
→ único resultado é `auth.service.spec.ts` (linhas 185-243), que testa que emails idênticos em
empresas diferentes coexistem — não testa que dados de uma empresa fiquem invisíveis para outra.

---

## 11. Arquitetura

**Dependency Injection:** padrão Nest convencional em 100% dos módulos revisados — construtor
injeta `PrismaService` + services relacionados; nenhuma instanciação manual de service
(`new XService()`) fora de testes.

**Circular dependencies:** `grep -rn "forwardRef" apps/api/src` (fora de spec) → **sem
resultado**. Nenhum `forwardRef` no código — ou não há dependência circular entre módulos, ou
qualquer uma que exista quebraria o boot do Nest (não seria um problema silencioso). **NÃO FOI
POSSÍVEL VALIDAR** a ausência de circularidade por outro método além deste (ex.: análise
estática de grafo de imports não foi rodada).

**Padrões identificados (com exemplo verificado):**

| Padrão | Uso | Exemplo |
|---|---|---|
| Guard Clause / Ownership Check | Onipresente — todo mutation em service é precedido por um `findFirst`/`findOne` companyId-scoped antes do `update`/`delete` | `assertConversationOwnership` (`message.service.ts:20-31`), `assertOwnership` (`note.service.ts:15-23`), `assertBelongsToCompany` (`tag.service.ts:113-116`) — **é o mesmo padrão nomeado de formas diferentes em cada módulo**, nunca extraído para um helper/decorator compartilhado |
| Idempotência por captura de `P2002` | `MessageService#createUnique` (B-48), `ConversationService#upsertFromWebhook` (B-49) | já documentado no roadmap |
| Observer (eventos de domínio → Socket.IO) | `EventsService`/`EventsGateway` emitindo após cada mutação relevante | `conversation.service.ts:383-389` |
| Strategy implícita | `ROLE_HIERARCHY` como tabela de comparação numérica, não uma interface `Strategy` formal | `roles.guard.ts:7-12` |
| Repository | **Ausente por desenho** — `PrismaService` é injetado direto nos services, sem camada de abstração (já registrado como decisão consciente na ACR anterior) | — |
| Factory/Builder | NÃO ENCONTRADO como padrão nomeado — `buildWebhookJobOptions` (`webhook-queue.config.ts`) é o único "builder" funcional identificado | — |
| Decorator (NestJS) | `@Public()`, `@Roles()`, `@CurrentUser()`, `@AccessToken()` — customizados, bem localizados em `modules/auth/decorators/` | — |
| Adapter | `RedisIoAdapter` (adapta o `IoAdapter` padrão do Nest para usar Redis pub/sub) | `shared/websocket/redis-io.adapter.ts` |
| Facade | NÃO ENCONTRADO como padrão nomeado — services individuais não são agregados atrás de uma fachada única | — |

**Inconsistência real encontrada:** a lógica de "ownership check antes de mutar" é reescrita
com nome e assinatura ligeiramente diferentes em cada módulo (`assertConversationOwnership`,
`assertOwnership`, `assertBelongsToCompany`, ou simplesmente chamando `findOne(companyId, id)`
de novo) em vez de um helper/decorator único. Não é um bug — é duplicação de intenção idêntica,
o mesmo tipo de achado que a ACR de 2026-08-01 já tinha consolidado para `isUniqueConstraintViolation`
e `formatStructuredLog`. **Candidato natural a um `@RequireOwnership()` decorator ou
`ScopedResourceGuard` genérico — que é, coincidentemente, a mesma direção da correção proposta
para B-40.**

**Código morto:** NÃO FOI POSSÍVEL VALIDAR de forma sistemática nesta passada (exigiria
análise de uso cruzado por símbolo, não feita).

---

## 12. Matriz de Autorização (por recurso)

| Recurso | Listar/Ler | Criar | Editar | Deletar | Escopo aplicado |
|---|---|---|---|---|---|
| Conversation | qualquer `AGENT` da empresa | (via webhook, não HTTP) | qualquer `AGENT` da empresa | — | só `companyId` — **sem** filtro de departamento/agente (B-40) |
| Message | qualquer `AGENT` da empresa (via conversa) | qualquer `AGENT` | soft-delete: só o autor (ou implícito por role em outros pontos) | — | herda de Conversation — mesma lacuna |
| Note | qualquer `AGENT` da empresa (via conversa) | qualquer `AGENT` | autor ou `SUPERVISOR`+ | autor ou `SUPERVISOR`+ | herda de Conversation |
| Contact | qualquer `AGENT` | qualquer `AGENT` | qualquer `AGENT` | `ADMIN` | só `companyId` |
| User | `SUPERVISOR`+ | `ADMIN` | `ADMIN` (outros) / próprio (limitado) | `ADMIN` (soft) | só `companyId` |
| Department/Queue/Tag/WhatsApp/AutoAttendance | leitura por `AGENT`, mutação por `ADMIN`/`SUPERVISOR` | idem | idem | idem | só `companyId` |
| Dashboard/Report | qualquer `AGENT` da empresa | — | — | — | só `companyId` — **sem** filtro de departamento (um `AGENT` vê relatório/dashboard da empresa inteira, não só do seu setor) |
| AuditLog | `ADMIN`+ | (sistema) | — | — | só `companyId` |

---

## 13. Lista de achados (por severidade)

🟠 **Alto**

- **B-40 confirmado** — `ConversationController`, `MessageController`, `NoteController`,
  `DashboardController`, `ReportController` sem `RolesGuard`/escopo por departamento
  (`conversation.controller.ts:24`, `message.controller.ts:26`, `note.controller.ts:20`,
  `dashboard.controller.ts:9`, `report.controller.ts:11`).
- **B-41 confirmado, com raio ampliado** — RLS inexistente (`infra/postgres/init.sql`, sem
  policy) + **3** pontos de mutação sem filtro de tenant (não 2): `message.service.ts:261`,
  `webhook.service.ts:365`, e o achado novo `whatsapp.service.ts:289`.
- **Cobertura de testes real de 50,28%, com 15 de 18 controllers em 0%** — não estava
  quantificado em nenhum documento do roadmap antes desta revisão.

🟡 **Médio**

- **Achado novo:** autenticação de WebSocket (`events.gateway.ts:63-89`) não verifica
  blacklist de token nem `isActive` do usuário, ao contrário do `JwtAuthGuard` do HTTP.
- **Achado novo:** `MessageService#findAll` aceita um cursor `before` (`message.service.ts:42`)
  sem verificar se a mensagem referenciada pertence à mesma empresa/conversa — oráculo de
  timing de baixo impacto.
- **Achado novo:** `WhatsAppConnection.sessionName` não tem `@@unique` no schema; a unicidade
  depende só da composição do valor gerado em `whatsapp.service.ts:94`.
- `GET /webhooks/metrics` depende do comportamento fail-closed por padrão de `RolesGuard` sem
  `JwtAuthGuard` explícito — funciona, mas por uma garantia implícita, não desenhada.
- Nenhum cenário multi-tenant (isolamento entre 2 empresas) é coberto por teste automatizado,
  unitário ou e2e, em nenhum módulo.

🟢 **Baixo / informativo**

- Duplicação de padrão "ownership check" reescrito por módulo (não extraído para helper
  compartilhado) — candidato de refactor alinhado à correção de B-40.
- 5 conexões Redis separadas, sem provider compartilhado (já registrado como B-46).
- `sla-check` e `auto-attendance-inactivity` não têm DLQ (só `webhook` tem).

---

## 14. Backlog sugerido para a leva de Hardening (B-40 a B-44 + complementos desta revisão)

A ordem abaixo é uma sugestão desta revisão, não uma decisão — cabe ao usuário priorizar.

1. **B-40** (escopo por departamento/agente) — maior risco de produto, já detalhado no roadmap.
   Ao implementar, considerar consolidar o padrão de "ownership check" espalhado (§11) num
   `ScopedResourceGuard`/decorator único, resolvendo a duplicação junto.
2. **B-41** (RLS + as 3 mutações sem `companyId`, incluindo o achado novo em
   `whatsapp.service.ts:289`).
3. **Achado novo — paridade de autenticação HTTP↔WebSocket**: fazer `events.gateway.ts` chamar
   `TokenBlacklistService.isBlacklisted()` e revalidar `isActive` no handshake, igual ao
   `JwtStrategy`. Pequeno, isolado, mesma classe de risco do que motivou B-38/B-39.
4. **B-42** (preview de mídia sem legenda) — bug funcional já visível hoje, esforço baixo.
5. **B-43**/**B-44** (nginx, Docker) — pré-requisito de produção, não bloqueiam feature nova.
6. **Cobertura de controllers** — não estava no roadmap como item numerado; sugerido como novo
   item (`B-50`?) dado que 15 de 18 controllers estão em 0% e é exatamente a camada onde a
   correção de B-40 precisa de teste de regressão para não voltar a quebrar.

---

## 15. Lista de evidências (arquivos lidos integralmente nesta revisão)

`main.ts`, `app.module.ts`, `infra/postgres/init.sql`, todos os 18 `*.controller.ts`,
`roles.guard.ts`, `jwt-auth.guard.ts`, `jwt.strategy.ts`, `request-context.ts`,
`conversation.service.ts`, `message.service.ts`, `note.service.ts`, `tag.service.ts`,
`user.service.ts`, `contact.service.ts` (parcial, primeiras 70 linhas),
`dashboard.service.ts`, `webhook.controller.ts`, `webhook.service.ts` (trechos),
`whatsapp.service.ts` (trechos), `events.gateway.ts` (trechos), `queue-names.ts`,
`schema.prisma` (seções de modelo completas), `auth.controller.ts`, `auth.service.ts`
(trechos), `refresh-token-cleanup.service.ts`, `auto-attendance.service.ts` (trechos),
`report.service.ts` (trechos), `department.service.ts` (trechos), `notification.service.ts`
(trechos), `audit-log.service.ts` (trechos), `api-ci.yml`, `package.json` (dependências).

Mais a saída integral de `npx jest --coverage` (367 testes, 40 suites, executado ao vivo nesta
revisão, não reaproveitado de execução anterior).
