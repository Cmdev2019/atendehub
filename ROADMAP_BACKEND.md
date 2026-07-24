# 🔧 Roadmap Backend & Banco — AtendeHub

> **📌 DOCUMENTO VIVO — foco exclusivo em `apps/api`, Prisma/PostgreSQL, filas
> (Bull/Redis) e infraestrutura.** Nasceu em 2026-07-21 por decisão do usuário:
> fechar TODO o backend e banco antes de voltar ao frontend, para que a
> estrutura esteja 100% pronta quando o front for retomado. Mesmas regras de
> documento vivo do `ROADMAP_ESTABILIZACAO.md` (fonte canônica do projeto como
> um todo — este arquivo é um mergulho de execução na parte de backend).
> Itens de frontend continuam em `ROADMAP_ESTABILIZACAO.md`; quando um item
> daqui tiver uma contraparte no front (ex.: tela para gerenciar tags), isso é
> anotado como "depende do front" e fica de fora deste documento.
>
> **Última atualização:** 2026-07-24 · **🏁 FASE B4 CONCLUÍDA POR COMPLETO** (B4-1 a B4-7) — backend com 141 testes (era 0 antes desta fase) + o E2E do SLA isolado (`test:e2e`)
> **Próxima ação:** só faltam B3 (perfil próprio + avatar), B5 (segurança pré-produção), B6 (backend pronto para produção) e B7 (handoff) pra fechar o backend inteiro. B5 é a próxima recomendada — é pré-requisito de qualquer deploy real, e B3 é P2 (menor prioridade)

---

## 📊 Painel de status

| Fase | Objetivo | Prioridade | Progresso | Status |
|---|---|---|---|---|
| [Fase B1](#-fase-b1--dados-incompletos-schema-existe-api-não-expõe) | Dados incompletos (schema existe, API não expõe) | 🟠 P1 | 4/4 | ✅ Concluída |
| [Fase B2](#-fase-b2--filas-assíncronas-e-sla) | Filas assíncronas (Bull) e SLA | 🔴 P0 | 6/6 | ✅ Concluída |
| [Fase B3](#-fase-b3--perfil-de-usuário-completo) | Perfil de usuário completo | 🟡 P2 | 0/2 | ⬜ Não iniciada |
| [Fase B4](#-fase-b4--testes-de-backend) | Testes de backend | 🔴 P0 | 7/7 | ✅ Concluída |
| [Fase B5](#-fase-b5--segurança-pré-produção) | Segurança pré-produção | 🟠 P1 | 0/5 | ⬜ Não iniciada |
| [Fase B6](#-fase-b6--backend-pronto-para-produção) | Backend pronto para produção | 🟢 P2 | 0/4 | ⬜ Não iniciada |
| [Fase B7](#-fase-b7--fechamento-e-handoff-para-o-frontend) | Fechamento e handoff para o frontend | 🟢 P3 | 0/3 | ⬜ Não iniciada |
| **Total** | | | **17/31** | |

**Legenda de status:** ⬜ Pendente · 🔄 Em andamento · 🔍 Em validação · ✅ Concluído · ⛔ Bloqueado · 🚫 Cancelado

**Recomendação de ordem:** B2 (SLA + filas) é P0 porque é a maior lacuna funcional conhecida
(feature anunciada e nunca ativada) e destrava B4 parcialmente. B4 (testes) é P0 porque
é o maior risco do projeto hoje — zero cobertura num SaaS multi-tenant. B1/B3/B5/B6/B7
podem ficar em qualquer ordem depois, mas B5 (segurança) deve fechar antes de qualquer
deploy real.

**Dependências:** B2-3 (produtor de SLA por fila) precisa de B1-2 (CRUD de `Queue`) para
ter filas configuráveis de verdade — hoje nenhuma conversa tem `queueId` setado nunca.
B7 (handoff) é o gate final: só fecha quando B1–B6 estiverem ✅.

---

## 📖 Regras do documento vivo

Idênticas ao `ROADMAP_ESTABILIZACAO.md`: item novo ganha ID antes de ser corrigido,
conclusão exige critério de aceite + evidência no Changelog, atualizar painel e
"Próxima ação" ao fim de cada sessão, nunca remover itens (cancelados viram 🚫).

---

## 🟠 Fase B1 — Dados incompletos (schema existe, API não expõe)

**Problema:** o Prisma schema tem 4 modelos com toda a modelagem pronta (relações,
índices) mas **zero superfície de API** — nenhum controller, nenhum service, nenhuma
linha de código em todo `apps/api/src` que escreva nessas tabelas (confirmado por
varredura: `grep -r "prisma\.(tag|queue|notification|auditLog)\."` só retorna o
próprio schema/processor de SLA, nada mais).
**Meta:** os 4 recursos têm CRUD real, documentado em `docs/API_CONTRACT.md`.

| ID | Item | Referências | Status |
|---|---|---|---|
| B1-1 | **Tags** — `POST/GET/PATCH/DELETE /tags` + atribuir/remover tag em conversa (`POST/DELETE /conversations/:id/tags/:tagId`) e em contato (`POST/DELETE /contacts/:id/tags/:tagId`). Hoje o front já renderiza `conversation.tags`/mock com tags, mas não existe NENHUMA forma de criar uma tag ou atribuí-la — o campo está sempre vazio na prática. **Aceite:** criar tag, atribuir a uma conversa real, `GET /conversations/:id` retorna a tag na lista. | `apps/api/prisma/schema.prisma` (model `Tag`, `@@relation("ConversationTags")`) · `apps/api/src/modules/tag/` | ✅ |
| B1-2 | **Queues (filas de distribuição)** — CRUD `/queues` (`name`, `strategy`, `maxWaitSecs`, `greetingMsg`, `departmentId`), vínculo com `WhatsAppConnection` (`departmentId` no `CreateConnectionDto`, item também citado no `ROADMAP_ESTABILIZACAO.md` F8-8). Pré-requisito de B2-3 — hoje toda conversa nasce com `queueId = null`, então o SLA não tem em qual `maxWaitSecs` se basear. **Aceite:** criar fila com `maxWaitSecs=60`, nova conversa do departamento vinculado nasce com esse `queueId`. | `apps/api/prisma/schema.prisma` (model `Queue`) · novo módulo `apps/api/src/modules/queue/` · `apps/api/src/modules/whatsapp/dto/create-connection.dto.ts` | ✅ |
| B1-3 | **Notifications** — `GET /notifications` (paginado, próprias do usuário logado), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`. Pontos de criação a definir junto (mínimo: conversa atribuída a mim, SLA estourado — cobre o gancho que a Fase de SLA vai precisar para alertar). Herdado do backlog B-3 do roadmap principal. **Aceite:** atribuir conversa a um agente gera notificação; `GET /notifications` do agente retorna. | `apps/api/prisma/schema.prisma` (model `Notification`) · `apps/api/src/modules/notification/` | ✅ |
| B1-4 | **Audit Log** — decidir o conjunto mínimo de ações sensíveis a registrar (criação/remoção de usuário, mudança de role, exclusão de conversa/contato, atribuição de conversa) e implementar o write-path (interceptor global ou chamada explícita nos services — registrar a decisão). `GET /audit-logs` só para ADMIN/SUPER_ADMIN. Herdado do backlog B-3. **Aceite:** criar um usuário gera 1 linha em `audit_logs` com `before`/`after`; endpoint lista por empresa. **Decidido:** chamada explícita nos services (sem interceptor global) — ver Registro de decisões. | `apps/api/prisma/schema.prisma` (model `AuditLog`) · `apps/api/src/modules/audit-log/` | ✅ |

---

## 🔴 Fase B2 — Filas assíncronas e SLA

**Problema:** duas filas Bull existem no código com destinos opostos — `webhook`
está viva (produtor + processor), `message-send` tem processor mas **nenhum
produtor** (envio é 100% síncrono hoje). O `SlaCheckProcessor` é código morto:
nem processor nem produtor estão registrados em módulo algum. O Redis Adapter do
Socket.IO tem uma chamada que **falha silenciosamente** (confirmado lendo
`events.gateway.ts:80` — `server.adapter(...)` é chamado num objeto `Namespace`,
que não tem esse método; o `try/catch` ao redor esconde o erro nos logs).
**Meta:** SLA funcional de ponta a ponta; decisão explícita e documentada sobre
o caminho de envio de mensagem; Socket.IO multi-instância realmente funcional.

| ID | Item | Referências | Status |
|---|---|---|---|
| B2-1 | Decidir e implementar o caminho de envio de mensagem: (a) manter síncrono e **remover** o `MessageSendProcessor`/fila morta (simplicidade), ou (b) mover o envio para dentro do processor da fila `message-send` (retry/backoff automático do Bull, mensagem sobrevive a um restart da API). Registrar a decisão. Herdado do backlog B-6. **Aceite:** só existe UM caminho de envio no código; se (b), falha da Evolution gera retry visível no Bull. **Decidido: (a)** — ver Registro de decisões. | `apps/api/src/modules/message/send-message.service.ts` | ✅ |
| B2-2 | Registrar `SlaModule`: `SlaCheckProcessor` como provider + `BullModule.registerQueue({ name: QUEUE_NAMES.SLA_CHECK })` + importar `EventsModule`; adicionar ao `AppModule`. Herdado de F3-1. **Aceite:** log do Nest mostra o processor registrado no boot. | `apps/api/src/modules/sla/sla-check.processor.ts` · `apps/api/src/modules/sla/sla.module.ts` · `apps/api/src/app.module.ts` | ✅ |
| B2-3 | Produtor de jobs de SLA: quando uma conversa entra em `WAITING` numa `Queue` com `maxWaitSecs`, enfileirar `SlaCheckJobData` com `delay = maxWaitSecs * 1000`. **Depende de B1-2** (sem `Queue` configurável, não há `maxWaitSecs` real para usar). Herdado de F3-2. | `apps/api/src/modules/conversation/conversation.service.ts` · `apps/api/src/modules/conversation/conversation.module.ts` | ✅ |
| B2-4 | Idempotência e cancelamento: `jobId` determinístico por conversa; confirmar que atribuição antes do prazo cancela o alerta (o processor reconsulta o status — validar em teste, ver B4-7). Herdado de F3-3. | `apps/api/src/modules/sla/sla-check.processor.ts` · `apps/api/src/modules/conversation/conversation.service.ts` | ✅ |
| B2-5 | Teste E2E do SLA com tempo curto (`maxWaitSecs=10`): conversa não atribuída em 10s dispara `sla.breached`, marca `slaBreachedAt`, gera notificação (via B1-3) e registra auditoria (via B1-4). Herdado de F3-5. **Concluído:** `apps/api/test/sla.e2e-spec.ts` — fila `sla-check` real contra Redis local (Prisma/Events/AuditLog/Notification mockados; SLA=2s para o teste rodar rápido). 3 casos: (1) conversa segue `WAITING` após o delay real do Bull → `slaBreachedAt` marcado, `sla.breached` emitido, auditoria + notificação a todo `SUPERVISOR+`; (2) conversa atribuída antes do prazo → processor reconsulta e não dispara nada; (3) reprocessamento do mesmo job (retry) não duplica breach/auditoria/notificação. Roda isolado do `npm test` via `npm run test:e2e` (novo script + `test/jest-e2e.json`, convenção padrão Nest — sufixo `.e2e-spec.ts` não bate no `testRegex` do jest.config.js principal). **Achado no caminho:** a 1ª tentativa travava em timeout — faltava `await module.init()` (sem isso o `BullExplorer` do `@nestjs/bull` nunca registra o `@Process()` como consumer real); a 2ª causa foi jobs órfãos de execuções anteriores interrompidas ocupando o mesmo `jobId` determinístico no Redis — corrigido com `queue.obliterate({force:true})` no início/fim do teste. | `apps/api/test/sla.e2e-spec.ts` (novo) · `apps/api/test/jest-e2e.json` (novo) · `apps/api/package.json` (`test:e2e`) | ✅ 2026-07-24 |
| B2-6 | Corrigir o Redis Adapter do Socket.IO: em gateway com namespace (`/ws`), o `server` recebido em `afterInit` é o **Namespace**, não o `Server` raiz — `server.adapter(...)` falha (`server.adapter is not a function`, hoje engolido pelo try/catch). Aplicar o adapter no nível do `IoAdapter` customizado em `main.ts` em vez de dentro do gateway. Sem isso, Socket.IO só funciona single-instance (não escala horizontalmente). Herdado de F7-5. **Aceite:** log confirma adapter Redis ativo; teste com 2 instâncias da API recebendo o mesmo evento. | `apps/api/src/shared/websocket/redis-io.adapter.ts` · `apps/api/src/main.ts` · `apps/api/src/modules/events/events.gateway.ts` | ✅ (log de 2 instâncias fica para B2-5/B4, sem infra de teste ainda) |

---

## 🟡 Fase B3 — Perfil de usuário completo

**Problema:** `PATCH /users/:id` (edição geral) exige `@Roles(ADMIN)` — um
`AGENT`/`SUPERVISOR` não tem NENHUMA rota para editar o próprio nome ou telefone
(só a própria senha, via `PATCH /users/:id/password`, que já existe e funciona).
Upload de avatar não existe: `avatarUrl` só aceita uma URL já pronta (`@IsUrl`),
sem nenhum endpoint de upload — inconsistente com o padrão já usado para mídia
de mensagens (multipart → MinIO).
**Meta:** um usuário autenticado consegue editar seus próprios dados e subir uma
foto de perfil sem precisar de outro papel.

| ID | Item | Referências | Status |
|---|---|---|---|
| B3-1 | Endpoint de auto-edição do próprio perfil (`PATCH /users/me`, campos limitados: `name`, `phone`, `avatarUrl` — nunca `role`/`isActive`, que continuam exclusivos de ADMIN via `PATCH /users/:id`). **Aceite:** um AGENT autenticado consegue mudar o próprio nome sem ser ADMIN; tentar mudar `role` pelo mesmo endpoint é rejeitado (400, campo não whitelisted). | `apps/api/src/modules/user/user.controller.ts` · novo `UpdateOwnProfileDto` | ⬜ |
| B3-2 | Upload de avatar: `POST /users/me/avatar` (multipart, mesmo padrão de `messages/media` — `StorageService` já existe e faz `makeBucket` no boot) → MinIO → `avatarUrl` atualizado. **Aceite:** upload de uma imagem retorna 201 com a nova `avatarUrl` pública. | `apps/api/src/shared/storage/storage.service.ts` · `apps/api/src/modules/user/` | ⬜ |

---

## 🔴 Fase B4 — Testes de backend

**Problema:** o backend (auth multi-tenant, webhooks, filas — as partes de maior
risco) tem **zero testes**; `jest.config.js` e `ts-jest` já estão configurados
(`cd apps/api && npm test` roda, só não há nenhum `*.spec.ts` para executar). O
frontend tem 94 testes; a pirâmide está completamente invertida.
**Meta:** módulos críticos cobertos, incluindo tudo o que for criado nas Fases B1-B3.

| ID | Item | Referências | Status |
|---|---|---|---|
| B4-1 | Primeiro spec rodando (valida que o setup do Jest/ts-jest funciona de fato, não só existe no config). **Aceite:** `cd apps/api && npm test` executa e passa ≥1 teste. Herdado de F4-1. | `apps/api/src/modules/queue/queue.service.spec.ts` | ✅ |
| B4-2 | Auth: `auth.service` (login, refresh, logout, senha errada, usuário inativo), `roles.guard`, `token-blacklist.service`. Herdado de F4-2. | `apps/api/src/modules/auth/auth.service.spec.ts` · `apps/api/src/modules/auth/guards/roles.guard.spec.ts` · `apps/api/src/modules/auth/token-blacklist.service.spec.ts` | ✅ |
| B4-3 | **Isolamento multi-tenant** (maior risco do projeto): testes de regressão garantindo que conversation/contact/user/tag/queue/notification/audit-log **sempre** filtram por `companyId` — vazamento entre empresas é o pior bug possível num SaaS. Cobre também os módulos novos da Fase B1. Herdado de F4-3. | `apps/api/src/modules/{contact,user,conversation,queue,tag,notification,audit-log}/*.service.spec.ts` | ✅ |
| B4-4 | Webhook: sem `EVOLUTION_API_KEY` → 500 fail-closed; apikey inválida → 403; normalização `messages.upsert`; extração de JID (`extractPhoneFromJid`, incl. caso `@lid` corrigido em F0-13); job enfileirado com payload correto. Herdado de F4-4. **Concluído:** `webhook.controller.spec.ts` (12 testes — fail-closed sem chave configurada, 403 sem apikey, 403 com apikey do corpo inválida, apikey válida no corpo, apikey do header tem prioridade sobre a do corpo, `it.each` normalizando 4 variações de nome de evento, shape exato do job enfileirado incl. `attempts`/`backoff`/`removeOnComplete`) + `webhook.service.spec.ts` (6 testes de `extractPhoneFromJid` — regressão direta de F0-11 sufixo de dispositivo e F0-13 `@lid`, chamado via cast já que é privado, sem subir os 8 services que o módulo inteiro dependeria). | `apps/api/src/modules/webhook/webhook.controller.spec.ts` (novo) · `apps/api/src/modules/webhook/webhook.service.spec.ts` (novo) | ✅ 2026-07-24 |
| B4-5 | Envio de mensagem: comportamento decidido em B2-1 (síncrono ou fila com retry/backoff), transições de `MessageStatus`, falha da Evolution API. Herdado de F4-5. **Concluído:** `send-message.service.spec.ts` (12 testes) — isolamento multi-tenant (`findFirst` sempre com `companyId`), as 5 regras de `prepareSend` (conversa inexistente, `CLOSED`, contato bloqueado, `AGENT` não atribuído barrado, `ADMIN`/`SUPERVISOR`/`SUPER_ADMIN` liberados via `it.each`, sem conexão WhatsApp, conexão não `CONNECTED`), caminho feliz (persiste com `status=SENT`, emite `message.new`, conversa `WAITING`→`OPEN`+`agentId` ao 1º envio de um `SUPERVISOR` assumindo da fila) e falha da Evolution vira `BadRequestException` **sem** persistir mensagem nem emitir evento (não existe mais fila/retry por trás desde a decisão B2-1 — se a service não tratar, o erro simplesmente se perde). **Achado no caminho:** a 1ª versão do teste usava `jest.clearAllMocks()`, que não esvazia a fila de `mockResolvedValueOnce` pendente — um teste que lança exceção antes de consumir todos os mocks enfileirados vazava valores para o teste seguinte (2 testes quebraram por isso: um resultado de mensagem "fantasma" de um teste anterior aparecia onde devia haver falha). Trocado para `jest.resetAllMocks()`. | `apps/api/src/modules/message/send-message.service.spec.ts` (novo) | ✅ 2026-07-24 |
| B4-6 | SLA: produtor de job ao entrar em `WAITING`, cancelamento ao atribuir antes do prazo, idempotência de `jobId` (cobre B2-2 a B2-4). **Concluído:** `conversation.service.sla.spec.ts` (11 testes, produtor real testado na classe onde ele mora — `scheduleSlaCheck`/`cancelSlaCheck` são privados do `ConversationService`, não do módulo `sla/`) cobrindo os 3 pontos de disparo (`upsertFromWebhook` ao criar conversa nova, `assign` cancelando ao atribuir agente e reagendando/cancelando na troca de departamento, `updateStatus` ao entrar/sair de `WAITING`) + `sla-check.processor.spec.ts` (5 testes, versão unitária mockada do processor — complementa o E2E real da B2-5, que roda isolado do `npm test`/coverage). | `apps/api/src/modules/conversation/conversation.service.sla.spec.ts` (novo) · `apps/api/src/modules/sla/sla-check.processor.spec.ts` (novo) | ✅ 2026-07-24 |
| B4-7 | Meta de cobertura ≥ 70% nos módulos auth, webhook, conversation, sla e nos novos de B1 (`npm run test:cov`). Ajustar meta em Decisões se necessário. Herdado de F4-6. **Concluído:** todos os services-alvo ≥70% (statements) — `auth.service` 89,6% · `token-blacklist.service` 82,8% · `roles.guard` 100% · `conversation.service` 90,2% · `sla-check.processor` 100% (branch 66,6%, aceitável — 1 ramo de log de erro) · `tag.service` 97,8% (subiu de 54,3%, faltavam `update`/`remove`/os 2 `removeFrom*`) · `queue.service` 77,7% · `notification.service` 94,4% · `audit-log.service` 100% · `webhook.controller` 97% · `webhook.service` 82% (subiu de 17,3% — só `extractPhoneFromJid` tinha teste; ganhou cobertura de `processMessage`/`handleConnectionUpdate`/`handleContactsUpsert`/`handleMessagesUpdate`/`handleMessagesDelete`/`extractMessageContent`) · `webhook.processor` 100%. Fora do escopo por decisão consciente: `media-download.service` e `evolution.service`/`whatsapp.service` (I/O pesado com a Evolution API real — mockar profundamente teria baixo retorno; ficam para um item futuro se algum bug real aparecer ali) e controllers/guards/strategies finos (wiring declarativo do Nest/Passport, sem lógica própria para testar). | `apps/api/jest.config.js` | ✅ 2026-07-24 |

---

## 🟠 Fase B5 — Segurança pré-produção

**Contexto:** a base já é boa (helmet, throttler global, `ValidationPipe`
whitelist, webhook fail-closed com comparação timing-safe, validação de
secrets no boot, token blacklist — tudo confirmado lendo `main.ts` e o módulo
de auth). Os itens abaixo fecham as lacunas restantes. Idênticos aos F6-1..F6-5
do roadmap principal, repetidos aqui por completude do escopo backend.

| ID | Item | Referências | Status |
|---|---|---|---|
| B5-1 | Estratégia de tokens: access/refresh em `localStorage` (front) é vulnerável a XSS. Migrar para cookie `httpOnly` + CSRF, **ou** registrar formalmente o trade-off aceito em Decisões. Também limpar/consolidar refresh tokens acumulados (achado em 2026-07-21: usuário admin com 42 tokens gerados, 30 ainda válidos, sem nenhuma rotina de limpeza). Herdado de F6-1. | `apps/api/src/modules/auth/` | ⬜ |
| B5-2 | Rotação de segredos de produção: nenhum default do compose (postgres/redis/minio/evolution) deve chegar a produção; checklist no `.env.example` + revisão do `docker-compose.prod.yml`. Herdado de F6-2. | `docker-compose.yml` · `docker-compose.prod.yml` | ⬜ |
| B5-3 | Health readiness: expandir `/health` com checagem de dependências (PostgreSQL, Redis) num `/health/ready` separado do liveness leve — para orquestração/nginx. Herdado de F6-3. | `apps/api/src/modules/health/` | ⬜ |
| B5-4 | Higiene de logs: revisar logs do backend (winston) para não vazar payloads/PII em produção. Herdado de F6-4 (parte frontend do item já não se aplica aqui). | backend (winston) | ⬜ |
| B5-5 | Revisão final de CORS (`CORS_ORIGINS` de produção), rate limits (`THROTTLE_*`) e headers (helmet) com os domínios reais. Herdado de F6-5. | `apps/api/src/main.ts` · `apps/api/src/app.module.ts` | ⬜ |

---

## 🟢 Fase B6 — Backend pronto para produção

| ID | Item | Referências | Status |
|---|---|---|---|
| B6-1 | CI (GitHub Actions) para `apps/api`: lint + `tsc --noEmit` + `npm test`. Hoje não existe nenhum workflow no repo (`.github/` vazio). Herdado de F7-1. | `.github/workflows/` (novo) | ⬜ |
| B6-2 | Build de produção validado: `nest build` sem warnings críticos; revisão do `docker-compose.prod.yml` + nginx como proxy da API/WS. Herdado de F7-2 (parte backend). | `docker-compose.prod.yml` · `infra/nginx/nginx.conf` | ⬜ |
| B6-3 | Observabilidade mínima: winston estruturado (JSON) com request-id, métricas básicas das filas Bull (jobs falhos/atrasados — relevante principalmente se B2-1 escolher a fila para envio). Herdado de F7-3. | `apps/api/src/main.ts` · nest-winston | ⬜ |
| B6-4 | Runbook: passos de deploy, rollback, reset de filas e troubleshooting comum, em `docs/RUNBOOK.md`. Herdado de F7-4. | `docs/` | ⬜ |

---

## 🟢 Fase B7 — Fechamento e handoff para o frontend

**Meta:** o backend fica "congelado" num estado estável e documentado antes de
o trabalho voltar para `src/` — o objetivo original desta reorganização.

| ID | Item | Referências | Status |
|---|---|---|---|
| B7-1 | Atualizar `docs/API_CONTRACT.md` com TODOS os endpoints novos das Fases B1-B3 (tags, queues, notifications, audit-log, perfil próprio, avatar) — mesmo padrão de shapes/enums já documentado para os recursos existentes. | `docs/API_CONTRACT.md` | ⬜ |
| B7-2 | Checklist de handoff: `prisma migrate reset` + seed rodando limpo do zero, `npx jest` (backend) verde, `tsc --noEmit` limpo, `docker compose up` nominal sem erro, checklist de segurança da Fase B5 revisado item a item. | — | ⬜ |
| B7-3 | Retomar o trabalho de frontend com o contrato 100% estável — nenhum endpoint deve mudar de shape no meio do próximo ciclo de front por causa de algo descoberto tarde no backend. | `ROADMAP_ESTABILIZACAO.md` (retomada) | ⬜ |

---

## 📋 Backlog

Itens identificados mas ainda não priorizados em fase. Ao priorizar, mover para a fase adequada com ID definitivo.

| ID | Item | Referências | Status |
|---|---|---|---|
| BL-1 | **[Descoberto ao rodar `npm run lint` durante B4-4/B4-5]** `eslint.config.js` nunca existiu no projeto — `npm run lint` falha de cara (`ESLint couldn't find an eslint.config.js file`). O `.eslintrc.*` antigo (se existir) está no formato pré-v9; ESLint 9 exige o formato flat config novo. Bloqueia também **B6-1** (CI: lint + tsc + test) — sem isso o pipeline de lint do CI nasceria quebrado. Migrar quando o momento for oportuno (não bloqueia o fechamento das Fases B1-B4). | `apps/api/eslint.config.js` (não existe) · `apps/api/package.json` (`lint`) | ⬜ |

---

## 🧭 Registro de decisões

| Data | Decisão | Motivo | Itens afetados |
|---|---|---|---|
| 2026-07-21 | Criado documento dedicado a backend/banco, separado do `ROADMAP_ESTABILIZACAO.md` | Pedido explícito do usuário: fechar todo o backend antes de retomar o front, evitando misturar os dois fluxos de trabalho num único documento | — |
| 2026-07-22 | B2-1: envio de mensagem fica **síncrono**; removido `MessageSendProcessor` e a fila `message-send` (nunca teve produtor, era 100% código morto) | Enviar mensagem é uma ação em primeiro plano (agente clicou "enviar" e espera feedback imediato); falhas da Evolution (sessão caída, número inválido) tendem a ser permanentes, não transitórias — 3 tentativas com backoff exponencial (até 14s) só atrasariam o erro sem resolvê-lo. Mover para fila também mudaria o contrato da API (`POST /messages` deixaria de retornar a mensagem já enviada, passando a exigir um estado "enviando" acompanhado por socket) — mudança de contrato incompatível com o objetivo desta fase de fechar o backend antes de mexer no front de novo. Se no futuro isso mudar (ex.: fila de envio em massa/campanhas), cabe um novo item de roadmap, não reaproveitar este código morto. | B2-1 |
| 2026-07-22 | B2-2: `SlaCheckProcessor` mantido como está (registrado, não reescrito) + 1 ajuste pontual: erro na verificação agora propaga para o Bull re-tentar, em vez de ser engolido no `catch` | O processor já era bem desenhado (idempotente via `slaBreachedAt`, reconsulta status antes de marcar breach, emite evento + auditoria) — só nunca tinha sido registrado em módulo algum. O único defeito real era engolir erros: como o job é de disparo único com delay, uma falha transitória de banco perderia o alerta de SLA para sempre, silenciosamente, contradizendo o próprio comentário do código ("não propaga... falhas não devem parar o sistema" — propagar não para o sistema, só faz o Bull re-tentar aquele job específico com o backoff já configurado globalmente, igual aos outros dois processors do projeto). | B2-2 |
| 2026-07-22 | B1-4: audit log v1 registra só `user.created`, `user.role_changed` (edição de nome/telefone/avatar NÃO é auditada), `user.deactivated`, `contact.deleted`, `conversation.assigned` (mudança real de `agentId`, incl. desatribuição) e `sla.breached` (já existia). Write-path é **chamada explícita** em cada service, não interceptor global | Interceptor global logaria todo PATCH genérico, sem contexto de antes/depois nem julgamento sobre o que é sensível — a lista curta acima cobre exatamente o que o próprio B1-4 listava como risco (criação/remoção de usuário, mudança de role, exclusão de conversa/contato, atribuição). `Conversation` não tem endpoint de exclusão de verdade (só soft-close via status), então "exclusão de conversa" não tem o que auditar hoje — fica registrado aqui para não parecer esquecimento. | B1-4 |
| 2026-07-22 | B1-3: notificação de SLA violado vai para todo `SUPERVISOR+` ativo da empresa, não para um usuário específico | A conversa violou o SLA exatamente porque ninguém a atribuiu ainda — não existe `agentId` para notificar nesse momento. Quem pode agir (redistribuir, assumir) são os papéis com visão de fila, então o fan-out é para eles, não um broadcast alternativo por socket (o `sla.breached` do Socket.IO já cobre esse caso em tempo real; a `Notification` persistida é para quem não estava com o painel aberto). | B1-3 |

---

## 📝 Changelog

> Formato: `AAAA-MM-DD — resumo (itens tocados) — evidência`

| Data | O que foi feito | Itens | Evidência |
|---|---|---|---|
| 2026-07-24 | **🏁 FASE B4 CONCLUÍDA — B4-6 (testes de SLA) e B4-7 (meta de cobertura ≥70%).** B4-6: `conversation.service.sla.spec.ts` (11 testes) — o produtor de SLA mora em `ConversationService` (métodos privados `scheduleSlaCheck`/`cancelSlaCheck`), não no módulo `sla/`, então os testes ficam onde a lógica de fato vive: agendamento ao criar conversa nova com fila ativa, cancelamento ao atribuir agente, reagendamento/cancelamento ao trocar só o departamento (conversa seguindo `WAITING`), agendamento/cancelamento ao entrar/sair de `WAITING` via `updateStatus`, e o `jobId` determinístico (`sla-check:<id>`) confirmado idêntico entre agendamentos sucessivos da mesma conversa. Complementado por `sla-check.processor.spec.ts` (5 testes, versão unitária mockada — sem Redis — dos mesmos ramos que o E2E da B2-5 já prova com timing real). B4-7: rodado `npm run test:cov` e fechadas as lacunas abaixo de 70% nos módulos-alvo: `webhook.service.ts` (17,3%→82%, via extensão de `webhook.service.spec.ts` com 20 testes novos cobrindo `processMessage`/`handleConnectionUpdate`/`handleContactsUpsert`/`handleMessagesUpdate`/`handleMessagesDelete`/`extractMessageContent`), `webhook.processor.ts` (0%→100%, novo spec trivial de repasse+propagação de erro) e `tag.service.ts` (54,3%→97,8%, faltavam `update`/`remove`/`removeFromConversation`/`removeFromContact`/`findAll`). Demais módulos-alvo já estavam ≥70% desde as sessões anteriores (auth, conversation, queue, notification, audit-log). Escopo consciente: `media-download.service`, `evolution.service`/`whatsapp.service` (I/O pesado com API externa, baixo retorno de mockar fundo) e controllers/guards/strategies finos (wiring declarativo sem lógica própria) ficaram de fora. | B4-6, B4-7 | `npm test`: 16 suites, **141/141** (47 novos) · `npm run test:e2e`: 3/3 (inalterado) · `tsc --noEmit` → exit 0 · `npm run test:cov`: todos os services-alvo ≥70% stmts (detalhe por arquivo na tabela de itens acima) |
| 2026-07-24 | **B4-4 e B4-5 — testes de webhook e de envio de mensagem (pedido do usuário: seguir a ordem do roadmap).** B4-4: `webhook.controller.spec.ts` (fail-closed sem `EVOLUTION_API_KEY`, 403 sem/errada apikey, header tem prioridade sobre o corpo, normalização de evento via `it.each`, shape do job enfileirado) + `webhook.service.spec.ts` (6 casos de `extractPhoneFromJid` — regressão direta dos incidentes F0-11/F0-13, chamado via cast por ser privado, sem instanciar o módulo inteiro). B4-5: `send-message.service.spec.ts` (12 testes) cobrindo as 5 regras de `prepareSend` (conversa outra empresa/inexistente, `CLOSED`, contato bloqueado, `AGENT` não atribuído barrado vs. `ADMIN`/`SUPERVISOR`/`SUPER_ADMIN` liberados, conexão ausente/não `CONNECTED`), caminho feliz (persiste `SENT`, emite `message.new`, `WAITING`→`OPEN` ao 1º envio) e falha da Evolution vira `BadRequestException` sem persistir nada (não há fila/retry por trás desde B2-1). Bug de teste (não de produção) encontrado no caminho: `jest.clearAllMocks()` não esvazia a fila de `mockResolvedValueOnce` pendente — um teste que lança exceção antes de consumir tudo vazava mocks pro teste seguinte; trocado para `jest.resetAllMocks()`. | B4-4, B4-5 | `npm test`: 13 suites, **94/94** (30 novos) · `tsc --noEmit` → exit 0 · lint (`npm run lint`) confirmado como pré-existentemente quebrado (`eslint.config.js` nunca existiu no projeto — ESLint 9 exige o formato novo; fora do escopo deste item) |
| 2026-07-24 | **🏁 FASE B2 CONCLUÍDA — B2-5, teste E2E do SLA (pedido do usuário: fechar a Fase B2).** Novo `apps/api/test/sla.e2e-spec.ts`, seguindo o scaffold padrão do Nest (`test/jest-e2e.json` + script `test:e2e`, isolado do `npm test` porque o `testRegex` do jest.config.js principal só bate em `.spec.ts`, não `.e2e-spec.ts`). Diferença para os specs unitários do processor: aqui a fila `sla-check` sobe de verdade contra o Redis local (mesma config de `app.module.ts`, `keyPrefix` isolado `bull:test:`) — só Prisma/Events/AuditLog/Notification continuam mockados. 3 casos: conversa que segue `WAITING` após o delay real do Bull (SLA=2s no teste) dispara `slaBreachedAt`+`sla.breached`+auditoria+notificação a todo `SUPERVISOR+`; conversa atribuída antes do prazo não dispara nada; reprocessamento do mesmo job (simulando retry do Bull) não duplica nada. Docker Desktop estava parado no início da sessão — subido nominalmente (`docker compose up -d redis`, só o serviço necessário). Dois bugs de teste (não do código de produção) descobertos e corrigidos no caminho: (1) faltava `await module.init()` no `TestingModule` — sem isso o `BullExplorer` do `@nestjs/bull` nunca registra o `@Process()` como consumer, e `job.finished()` nunca resolve (timeout de 20s); (2) jobs órfãos de tentativas anteriores interrompidas ocupavam o mesmo `jobId` determinístico no Redis, fazendo `queue.add()` devolver o job velho "stuck" em vez de agendar um novo — corrigido com `queue.obliterate({force:true})` no início/fim do teste. | B2-5 | `npm run test:e2e` → 3/3 (repetido 2x seguidas, mesmo resultado, ~2s de delay real cada) · `npm test` (suíte principal, não afetada) → 65/65 · `tsc --noEmit` → exit 0 |
| 2026-07-22 | **Fase B1 fechada: B1-1 Tags, B1-3 Notifications, B1-4 Audit Log + B4-3 completo.** 3 módulos novos seguindo o padrão de `department`/`queue`: `apps/api/src/modules/tag/` (CRUD + `assignToConversation`/`removeFromConversation`/`assignToContact`/`removeFromContact`, expostos como `POST/DELETE /conversations/:id/tags/:tagId` e `.../contacts/:id/tags/:tagId` nos controllers existentes), `apps/api/src/modules/notification/` (CRUD de leitura + `create()` interno chamado por outros services, nunca exposto como POST público) e `apps/api/src/modules/audit-log/` (`record()` de escrita explícita + `GET /audit-logs` ADMIN-only). Wiring nos services existentes: `user.service.ts` (created/role_changed/deactivated), `contact.service.ts` (deleted), `conversation.service.ts#assign` (audit + notifica o agente novo), `sla-check.processor.ts` (trocou o `prisma.auditLog.create` inline por `AuditLogService.record`, e passou a notificar todo SUPERVISOR+ ativo da empresa no breach). Controllers atualizados para repassar `requesterId` onde faltava (`user.controller.ts#update`, `contact.controller.ts#remove`, `conversation.controller.ts#assign`). `docs/API_CONTRACT.md` ganhou as 3 seções novas + notas nas rotas de tag dentro de Conversations/Contacts. B4-3: specs novos para `tag`/`notification`/`audit-log` seguindo o mesmo padrão de isolamento dos demais (nunca confiar em só metade da checagem de posse — tag+conversa, tag+contato, companyId+userId em notification). | B1-1, B1-3, B1-4, B4-3 | `npm test` em `apps/api`: 10 suites, 65/65 testes passando; `tsc --noEmit` limpo |
| 2026-07-22 | **B4-2 — testes de auth + B4-3 (parcial) — isolamento multi-tenant.** B4-2: `auth.service.spec.ts` (validateUser com senha errada/empresa inativa/usuário não encontrado, login persistindo refresh token hasheado, refresh com token revogado/expirado/usuário inativo e rotação no sucesso, logout revogando refresh token e blacklistando access token só quando ainda não expirou), `roles.guard.spec.ts` (hierarquia de roles, sem `@Roles()` libera geral) e `token-blacklist.service.spec.ts` (mock do módulo `ioredis` inteiro, já que o serviço cria o próprio client no construtor — inclui os dois caminhos de fail-open/fail-safe quando o Redis está indisponível). B4-3: `contact.service.spec.ts`, `user.service.spec.ts`, `conversation.service.spec.ts` (novo) e mais testes em `queue.service.spec.ts` — todos seguindo o mesmo padrão: para um registro de outra empresa, a chamada de mutação do Prisma (`update`/`delete`) nunca é invocada, não só que a resposta HTTP dá 404. `tag`/`notification`/`audit-log` ficam de fora porque os módulos ainda não existem (Fase B1). | B4-2, B4-3 | `npm test` em `apps/api`: 7 suites, 49/49 testes passando; `tsc --noEmit` limpo |
| 2026-07-22 | **B4-1 — primeiro spec de fato rodando.** Criado `apps/api/src/modules/queue/queue.service.spec.ts` (6 testes) usando `@nestjs/testing` com `PrismaService` mockado — exercita DI/decorators do Nest (a parte que realmente prova que o `ts-jest` está configurado certo, não só transformando um arquivo solto), cobrindo regras reais do `QueueService` criado na B1-2: conflito de nome único por empresa, validação de `departmentId` pertencente à empresa, e bloqueio de remoção com conversas associadas. Escolhido em vez de um teste de função pura para já estabelecer o padrão de mock que os specs futuros (B4-2 em diante) vão reusar. | B4-1 | `npm test` em `apps/api`: 1 suite, 6/6 testes passando |
| 2026-07-22 | **B2-6 — Redis Adapter do Socket.IO corrigido + reagendamento de SLA na reatribuição de departamento.** Criado `apps/api/src/shared/websocket/redis-io.adapter.ts` (`RedisIoAdapter extends IoAdapter`, aplica `.adapter()` em `createIOServer` — no Server raiz, criado antes de qualquer namespace); `main.ts` instancia, chama `connectToRedis()` e registra via `app.useWebSocketAdapter()` antes do `listen`. Removido o código morto/quebrado de `events.gateway.ts` (`afterInit` chamava `server.adapter(...)` no Namespace `/ws`, que não tem esse método — erro real escondido pelo try/catch). Adicional aprovado pelo usuário: `conversation.service.ts#assign()` agora também reagenda o SLA quando só o departamento muda (sem trocar o agente) numa conversa que segue em `WAITING` — busca a fila ativa do departamento novo, atualiza `queueId` e chama `scheduleSlaCheck`; sem fila ativa no departamento novo, cancela o alerta antigo em vez de deixá-lo contando pra fila errada. | B2-6 | `tsc --noEmit` limpo em `apps/api`; teste com 2 instâncias da API fica pendente até existir infra de teste (B4) |
| 2026-07-22 | **B2-3/B2-4 — produtor de jobs de SLA com jobId idempotente.** `conversation.service.ts` ganhou `scheduleSlaCheck`/`cancelSlaCheck` (jobId determinístico `sla-check:<conversationId>`; agendar sempre remove um job pendente anterior da mesma conversa antes de criar o novo). Disparado em 3 pontos: criação da conversa via webhook quando há fila ativa resolvida (`upsertFromWebhook`), reentrada em `WAITING` via `updateStatus` (ex.: reabertura) e cancelado em `assign()` quando um agente é atribuído e em `updateStatus` ao sair de `WAITING` por qualquer outro caminho. `ConversationModule` ganhou `BullModule.registerQueue(SLA_CHECK)` para o `@InjectQueue` funcionar. Escopo definido conscientemente: reatribuição de departamento sem trocar agente (`assign()` só com `departmentId`) não reagenda para a fila nova — não é o fluxo comum e ficou fora para não expandir escopo além do pedido. | B2-3, B2-4 | `tsc --noEmit` limpo em `apps/api` |
| 2026-07-22 | **B2-2 — `SlaModule` registrado + B2-1 — decisão de envio síncrono.** Criado `apps/api/src/modules/sla/sla.module.ts` (`BullModule.registerQueue(SLA_CHECK)` + `SlaCheckProcessor` como provider + import de `EventsModule`), registrado em `app.module.ts`. Corrigido `sla-check.processor.ts`: catch agora relança o erro (Bull re-tenta com attempts/backoff globais) em vez de engolir silenciosamente. B2-1: removidos `message-send.processor.ts`, o registro `BullModule.registerQueue(MESSAGE_SEND)` em `message.module.ts` e a constante `QUEUE_NAMES.MESSAGE_SEND` — fila morta sem produtor, envio de mensagem confirmado como único caminho síncrono via `send-message.service.ts`. Decisões completas registradas abaixo. | B2-1, B2-2 | `tsc --noEmit` limpo em `apps/api` após cada mudança; grep confirmou zero referências restantes a `MessageSendProcessor`/`MESSAGE_SEND`/`SendMessageJobData` fora do arquivo removido |
| 2026-07-22 | **B1-2 — CRUD de Queues + vínculo automático departamento→fila.** Novo módulo `apps/api/src/modules/queue/` (controller/service/DTOs), seguindo o mesmo padrão do `department`: `GET/POST/PATCH/DELETE /queues`, `GET/PATCH/DELETE` restritos a ADMIN, valida nome único por empresa e `departmentId` pertencente à empresa, bloqueia remoção de fila com conversas associadas. Registrado em `app.module.ts`. Vínculo automático: `webhook.service.ts` agora lê `departmentId` da `WhatsAppConnection` e repassa para `conversationService.upsertFromWebhook`, que busca a `Queue` ativa daquele departamento e preenche `departmentId`/`queueId` na criação da conversa (antes, esses campos nunca eram setados — confirmado lendo o `create` antigo). Documentado em `docs/API_CONTRACT.md` (seção Queues). | B1-2 | `tsc --noEmit` limpo em `apps/api`; leitura de `conversation.service.ts` confirmando que `upsertFromWebhook` nunca setava `departmentId`/`queueId` antes desta mudança |
| 2026-07-21 | **Criação do roadmap + auditoria completa do backend.** Schema Prisma lido por inteiro (13 models); todos os controllers de `apps/api/src/modules/*` mapeados endpoint a endpoint; grep confirmou zero uso de `prisma.tag/queue/notification/auditLog` em qualquer service (só o schema os declara); confirmado que `message-send` tem processor sem produtor (envio 100% síncrono) enquanto `webhook` tem os dois; `SlaModule` confirmado nunca importado em `app.module.ts`; bug do Redis Adapter confirmado lendo `events.gateway.ts:80` (chamada em `Namespace`, não `Server`, escondida por try/catch); `PATCH /users/:id` confirmado exclusivo de ADMIN (sem rota de auto-edição); nenhum endpoint de upload de avatar; `.github/` vazio (zero CI); `jest.config.js` do backend pronto, zero `*.spec.ts`. | — (baseline) | leitura completa de `schema.prisma`, `*.controller.ts` (13 módulos), `app.module.ts`, `main.ts`, `events.gateway.ts`, `user.controller.ts`; greps registrados na sessão |
