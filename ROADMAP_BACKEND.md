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
> **Última atualização:** 2026-07-21 · Criação do documento + auditoria completa do backend
> **Próxima ação:** decidir com o usuário por qual fase começar (ver recomendação no painel)

---

## 📊 Painel de status

| Fase | Objetivo | Prioridade | Progresso | Status |
|---|---|---|---|---|
| [Fase B1](#-fase-b1--dados-incompletos-schema-existe-api-não-expõe) | Dados incompletos (schema existe, API não expõe) | 🟠 P1 | 0/4 | ⬜ Não iniciada |
| [Fase B2](#-fase-b2--filas-assíncronas-e-sla) | Filas assíncronas (Bull) e SLA | 🔴 P0 | 0/6 | ⬜ Não iniciada |
| [Fase B3](#-fase-b3--perfil-de-usuário-completo) | Perfil de usuário completo | 🟡 P2 | 0/2 | ⬜ Não iniciada |
| [Fase B4](#-fase-b4--testes-de-backend) | Testes de backend | 🔴 P0 | 0/7 | ⬜ Não iniciada |
| [Fase B5](#-fase-b5--segurança-pré-produção) | Segurança pré-produção | 🟠 P1 | 0/5 | ⬜ Não iniciada |
| [Fase B6](#-fase-b6--backend-pronto-para-produção) | Backend pronto para produção | 🟢 P2 | 0/4 | ⬜ Não iniciada |
| [Fase B7](#-fase-b7--fechamento-e-handoff-para-o-frontend) | Fechamento e handoff para o frontend | 🟢 P3 | 0/3 | ⬜ Não iniciada |
| **Total** | | | **0/31** | |

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
| B1-1 | **Tags** — `POST/GET/PATCH/DELETE /tags` + atribuir/remover tag em conversa (`POST/DELETE /conversations/:id/tags/:tagId`) e em contato (`POST/DELETE /contacts/:id/tags/:tagId`). Hoje o front já renderiza `conversation.tags`/mock com tags, mas não existe NENHUMA forma de criar uma tag ou atribuí-la — o campo está sempre vazio na prática. **Aceite:** criar tag, atribuir a uma conversa real, `GET /conversations/:id` retorna a tag na lista. | `apps/api/prisma/schema.prisma` (model `Tag`, `@@relation("ConversationTags")`) · novo módulo `apps/api/src/modules/tag/` | ⬜ |
| B1-2 | **Queues (filas de distribuição)** — CRUD `/queues` (`name`, `strategy`, `maxWaitSecs`, `greetingMsg`, `departmentId`), vínculo com `WhatsAppConnection` (`departmentId` no `CreateConnectionDto`, item também citado no `ROADMAP_ESTABILIZACAO.md` F8-8). Pré-requisito de B2-3 — hoje toda conversa nasce com `queueId = null`, então o SLA não tem em qual `maxWaitSecs` se basear. **Aceite:** criar fila com `maxWaitSecs=60`, nova conversa do departamento vinculado nasce com esse `queueId`. | `apps/api/prisma/schema.prisma` (model `Queue`) · novo módulo `apps/api/src/modules/queue/` · `apps/api/src/modules/whatsapp/dto/create-connection.dto.ts` | ⬜ |
| B1-3 | **Notifications** — `GET /notifications` (paginado, próprias do usuário logado), `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`. Pontos de criação a definir junto (mínimo: conversa atribuída a mim, SLA estourado — cobre o gancho que a Fase de SLA vai precisar para alertar). Herdado do backlog B-3 do roadmap principal. **Aceite:** atribuir conversa a um agente gera notificação; `GET /notifications` do agente retorna. | `apps/api/prisma/schema.prisma` (model `Notification`) · novo módulo `apps/api/src/modules/notification/` | ⬜ |
| B1-4 | **Audit Log** — decidir o conjunto mínimo de ações sensíveis a registrar (criação/remoção de usuário, mudança de role, exclusão de conversa/contato, atribuição de conversa) e implementar o write-path (interceptor global ou chamada explícita nos services — registrar a decisão). `GET /audit-logs` só para ADMIN/SUPER_ADMIN. Herdado do backlog B-3. **Aceite:** criar um usuário gera 1 linha em `audit_logs` com `before`/`after`; endpoint lista por empresa. | `apps/api/prisma/schema.prisma` (model `AuditLog`) · novo módulo `apps/api/src/modules/audit-log/` | ⬜ |

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
| B2-1 | Decidir e implementar o caminho de envio de mensagem: (a) manter síncrono e **remover** o `MessageSendProcessor`/fila morta (simplicidade), ou (b) mover o envio para dentro do processor da fila `message-send` (retry/backoff automático do Bull, mensagem sobrevive a um restart da API). Registrar a decisão. Herdado do backlog B-6. **Aceite:** só existe UM caminho de envio no código; se (b), falha da Evolution gera retry visível no Bull. | `apps/api/src/modules/message/message-send.processor.ts` · `send-message.service.ts` | ⬜ |
| B2-2 | Registrar `SlaModule`: `SlaCheckProcessor` como provider + `BullModule.registerQueue({ name: QUEUE_NAMES.SLA_CHECK })` + importar `EventsModule`; adicionar ao `AppModule`. Herdado de F3-1. **Aceite:** log do Nest mostra o processor registrado no boot. | `apps/api/src/modules/sla/sla-check.processor.ts` · `apps/api/src/app.module.ts` | ⬜ |
| B2-3 | Produtor de jobs de SLA: quando uma conversa entra em `WAITING` numa `Queue` com `maxWaitSecs`, enfileirar `SlaCheckJobData` com `delay = maxWaitSecs * 1000`. **Depende de B1-2** (sem `Queue` configurável, não há `maxWaitSecs` real para usar). Herdado de F3-2. | `apps/api/src/modules/webhook/webhook.processor.ts` · `conversation.service.ts` | ⬜ |
| B2-4 | Idempotência e cancelamento: `jobId` determinístico por conversa; confirmar que atribuição antes do prazo cancela o alerta (o processor reconsulta o status — validar em teste, ver B4-7). Herdado de F3-3. | `apps/api/src/modules/sla/sla-check.processor.ts` | ⬜ |
| B2-5 | Teste E2E do SLA com tempo curto (`maxWaitSecs=10`): conversa não atribuída em 10s dispara `sla.breached`, marca `slaBreachedAt`, gera notificação (via B1-3) e registra auditoria (via B1-4). Herdado de F3-5. | seed/fila de teste | ⬜ |
| B2-6 | Corrigir o Redis Adapter do Socket.IO: em gateway com namespace (`/ws`), o `server` recebido em `afterInit` é o **Namespace**, não o `Server` raiz — `server.adapter(...)` falha (`server.adapter is not a function`, hoje engolido pelo try/catch). Aplicar o adapter no nível do `IoAdapter` customizado em `main.ts` em vez de dentro do gateway. Sem isso, Socket.IO só funciona single-instance (não escala horizontalmente). Herdado de F7-5. **Aceite:** log confirma adapter Redis ativo; teste com 2 instâncias da API recebendo o mesmo evento. | `apps/api/src/modules/events/events.gateway.ts:58-90` · `apps/api/src/main.ts` | ⬜ |

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
| B4-1 | Primeiro spec rodando (valida que o setup do Jest/ts-jest funciona de fato, não só existe no config). **Aceite:** `cd apps/api && npm test` executa e passa ≥1 teste. Herdado de F4-1. | `apps/api/jest.config.js` · `apps/api/test/` | ⬜ |
| B4-2 | Auth: `auth.service` (login, refresh, logout, senha errada, usuário inativo), `roles.guard`, `token-blacklist.service`. Herdado de F4-2. | `apps/api/src/modules/auth/` | ⬜ |
| B4-3 | **Isolamento multi-tenant** (maior risco do projeto): testes de regressão garantindo que conversation/contact/user/tag/queue/notification/audit-log **sempre** filtram por `companyId` — vazamento entre empresas é o pior bug possível num SaaS. Cobre também os módulos novos da Fase B1. Herdado de F4-3. | `apps/api/src/modules/*/​*.service.ts` | ⬜ |
| B4-4 | Webhook: sem `EVOLUTION_API_KEY` → 500 fail-closed; apikey inválida → 403; normalização `messages.upsert`; extração de JID (`extractPhoneFromJid`, incl. caso `@lid` corrigido em F0-13); job enfileirado com payload correto. Herdado de F4-4. | `apps/api/src/modules/webhook/webhook.controller.ts` | ⬜ |
| B4-5 | Envio de mensagem: comportamento decidido em B2-1 (síncrono ou fila com retry/backoff), transições de `MessageStatus`, falha da Evolution API. Herdado de F4-5. | `apps/api/src/modules/message/` | ⬜ |
| B4-6 | SLA: produtor de job ao entrar em `WAITING`, cancelamento ao atribuir antes do prazo, idempotência de `jobId` (cobre B2-2 a B2-4). | `apps/api/src/modules/sla/` | ⬜ |
| B4-7 | Meta de cobertura ≥ 70% nos módulos auth, webhook, conversation, sla e nos novos de B1 (`npm run test:cov`). Ajustar meta em Decisões se necessário. Herdado de F4-6. | `apps/api/jest.config.js` | ⬜ |

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

## 🧭 Registro de decisões

| Data | Decisão | Motivo | Itens afetados |
|---|---|---|---|
| 2026-07-21 | Criado documento dedicado a backend/banco, separado do `ROADMAP_ESTABILIZACAO.md` | Pedido explícito do usuário: fechar todo o backend antes de retomar o front, evitando misturar os dois fluxos de trabalho num único documento | — |
| _pendente_ | B2-1: envio de mensagem síncrono ou via fila com retry/backoff? | — | B2-1 |
| _pendente_ | B1-4: quais ações exatamente entram no audit log v1? | — | B1-4 |

---

## 📝 Changelog

> Formato: `AAAA-MM-DD — resumo (itens tocados) — evidência`

| Data | O que foi feito | Itens | Evidência |
|---|---|---|---|
| 2026-07-21 | **Criação do roadmap + auditoria completa do backend.** Schema Prisma lido por inteiro (13 models); todos os controllers de `apps/api/src/modules/*` mapeados endpoint a endpoint; grep confirmou zero uso de `prisma.tag/queue/notification/auditLog` em qualquer service (só o schema os declara); confirmado que `message-send` tem processor sem produtor (envio 100% síncrono) enquanto `webhook` tem os dois; `SlaModule` confirmado nunca importado em `app.module.ts`; bug do Redis Adapter confirmado lendo `events.gateway.ts:80` (chamada em `Namespace`, não `Server`, escondida por try/catch); `PATCH /users/:id` confirmado exclusivo de ADMIN (sem rota de auto-edição); nenhum endpoint de upload de avatar; `.github/` vazio (zero CI); `jest.config.js` do backend pronto, zero `*.spec.ts`. | — (baseline) | leitura completa de `schema.prisma`, `*.controller.ts` (13 módulos), `app.module.ts`, `main.ts`, `events.gateway.ts`, `user.controller.ts`; greps registrados na sessão |
