# 📜 Contrato da API — AtendeHub

> **Fonte da verdade:** este documento descreve o contrato REAL do backend NestJS
> (`apps/api`), extraído dos controllers, DTOs e dos `select` do Prisma em
> 2026-07-16 (item F1-1 do roadmap), mantido atualizado durante as Fases
> B1-B3 do `ROADMAP_BACKEND.md` (tags, queues, notifications, audit-log,
> perfil próprio/avatar, `/health/ready` — última revisão 2026-07-24, item
> B7-1). Componentes do frontend, mock (`src/services/apiMock.js`) e testes
> devem seguir **exatamente** estes shapes. Ao alterar um endpoint no
> backend, atualize este arquivo no mesmo commit.

- **Base URL:** `http://localhost:3001/api/v1` (config: `VITE_API_URL` no front, `API_PREFIX`/porta no back)
- **Autenticação:** `Authorization: Bearer <accessToken>` em todas as rotas, exceto `/health`, `/health/ready`, `/auth/login`, `/auth/refresh`, `/auth/register-company` e `/webhooks/evolution`
- **Validação:** `ValidationPipe` global com `whitelist` + `forbidNonWhitelisted` — **campos extras no body retornam 400**
- **Rate limit global:** `THROTTLE_LIMIT` req / `THROTTLE_TTL` s (default 100/60s) por IP
- **Erros:** formato padrão do NestJS — `{ "statusCode": number, "message": string | string[], "error": string }`

---

## Convenções de resposta

Há **três formatos** de resposta de listagem (atenção ao integrar):

| Formato | Endpoints | Shape |
|---|---|---|
| Paginação offset | `GET /conversations`, `GET /contacts`, `GET /users` | `{ data: [...], meta: { total, page, limit, totalPages } }` |
| Paginação cursor | `GET /conversations/:id/messages` | `{ data: [...], meta: { count, hasMore, nextCursor } }` |
| Array puro | `GET /whatsapp`, `GET /departments`, `GET /queues`, `GET /tags`, `GET .../notes` | `[...]` (sem wrapper) |

Datas: ISO 8601 (`2026-07-16T18:14:56.851Z`). IDs: cuid (`cmrm93kc9...`).

---

## Enums (Prisma)

| Enum | Valores |
|---|---|
| `Role` | `SUPER_ADMIN` · `ADMIN` · `SUPERVISOR` · `AGENT` |
| `ConnectionStatus` | `CONNECTED` · `DISCONNECTED` · `CONNECTING` · `QR_CODE` · `ERROR` |
| `Channel` | `WHATSAPP` · `INSTAGRAM` · `EMAIL` · `CHAT` |
| `ConversationStatus` | `WAITING` · `OPEN` · `RESOLVED` · `CLOSED` |
| `SenderType` | `AGENT` · `CLIENT` · `BOT` · `SYSTEM` |
| `MessageType` | `TEXT` · `IMAGE` · `VIDEO` · `AUDIO` · `DOCUMENT` · `STICKER` · `LOCATION` · `CONTACT_CARD` · `TEMPLATE` · `REACTION` · `DELETED` |
| `MessageStatus` | `PENDING` · `SENT` · `DELIVERED` · `READ` · `FAILED` |
| `QueueStrategy` | `ROUND_ROBIN` · `MANUAL` · `LEAST_BUSY` |
| `Plan` | `FREE` · `STARTER` · `PROFESSIONAL` · `ENTERPRISE` |

---

## Auth — `/auth`

### `POST /auth/login` (público)
```jsonc
// Request
{ "email": "admin@demo.com", "password": "Admin@123" }

// Response 200
{
  "accessToken": "<jwt>",
  "refreshToken": "<token opaco>",
  "expiresIn": 900,                    // segundos de vida do accessToken
  "user": {
    "id": "...", "companyId": "...", "name": "...", "email": "...",
    "role": "ADMIN", "avatarUrl": null
  }
}
// 401 → { statusCode: 401, message: "Usuário ou senha incorreta." }
```

### `POST /auth/refresh` (público)
`{ "refreshToken": "..." }` → mesmo shape do login (rotaciona o refresh token).

### `POST /auth/register-company` (público, B-9)
Auto-cadastro de empresa nova — quem se cadastra vira `ADMIN` dessa empresa. Limite: **3 req/60s por IP** (mais apertado que login, pois cria linhas no banco).
```jsonc
// Request
{
  "companyName": "Café & Cia",     // 2-80 chars — vira o slug da empresa (normalizado, sem acento/pontuação; colisão resolvida com sufixo -2, -3, ...)
  "name": "Carlos Fundador",       // 2-120 chars — nome do admin
  "email": "carlos@cafeecia.com",  // único GLOBALMENTE (B-20), não só na empresa — ver nota abaixo
  "password": "Senha123"           // mesma regra do CreateUserDto: min 8, 1 maiúscula, 1 minúscula, 1 número
}

// Response 201 — mesmo shape do login (auto-login, sem precisar de uma 2ª chamada)
{
  "accessToken": "<jwt>", "refreshToken": "<token opaco>", "expiresIn": 900,
  "user": { "id": "...", "companyId": "...", "name": "Carlos Fundador", "email": "carlos@cafeecia.com", "role": "ADMIN", "avatarUrl": null }
}
// 409 → { statusCode: 409, message: "Já existe uma conta com este e-mail." }
```
Empresa nasce no plano `FREE` (`maxAgents=5`, `maxChannels=2` — defaults do schema), sem fluxo de billing/upgrade ainda (fora de escopo).

### `POST /auth/logout`
`{ "refreshToken": "..." }` → revoga o refresh token e blacklista o access token atual. Responde **204 No Content**.

### `POST /auth/revoke`
Revoga TODOS os refresh tokens do usuário (logout de todos os dispositivos).

### `GET /auth/me`
→ `AuthUserDto`: `{ id, companyId, name, email, role, avatarUrl }`

> ⚠️ **Não existe `POST /auth/register`** genérico (criar um novo usuário
> dentro de uma empresa já existente sem ser ADMIN) — o `apiClient.register()`
> do front antigo chamava uma rota inexistente (decisão pendente F1-4, ainda
> válida). Isso é diferente de `POST /auth/register-company` (acima), que
> cria uma empresa **nova** com seu próprio admin.
>
> **E-mail único globalmente (B-20):** desde a migration
> `20260725120609_user_email_globally_unique`, `User.email` é único em toda
> a base, não só por empresa — o login (`validateUser`) busca só por e-mail,
> sem `companyId`, então duas empresas com o mesmo e-mail cadastrado
> resolveriam login de forma ambígua. `POST /users` (criar usuário dentro de
> uma empresa, ADMIN+) e `POST /auth/register-company` retornam 409 se o
> e-mail já existir em qualquer empresa.

---

## Conversations — `/conversations`

### `GET /conversations`
Query: `status?` (ConversationStatus) · `channel?` · `agentId?` · `departmentId?` · `search?` (nome/telefone do contato) · `page=1` · `limit=20`

```jsonc
// Response 200 — item de data[]:
{
  "id": "...",
  "status": "WAITING",
  "channel": "WHATSAPP",
  "unreadCount": 2,
  "lastMessageAt": "2026-07-16T17:56:11.289Z",
  "lastMessagePreview": "top",
  "createdAt": "...",
  "contact":    { "id": "...", "name": "Natanael", "phone": "5512...", "avatarUrl": "https://..." },
  "agent":      { "id": "...", "name": "...", "avatarUrl": null } | null,
  "department": { "id": "...", "name": "...", "color": "#6366f1" } | null,
  "whatsapp":   { "id": "...", "name": "teste", "phone": "5512..." } | null,
  "tags":       [{ "id": "...", "name": "...", "color": "..." }],
  "_count":     { "messages": 12 }
}
// Wrapper: { data, meta: { total, page, limit, totalPages } }
// Ordenação: lastMessageAt desc, createdAt desc
```

### `GET /conversations/stats` (B-2, ampliado no B-32) — métricas agregadas da empresa
Contagens reais via `count`/`aggregate`/`findMany` do Prisma, **independentes de
paginação** (diferente do `data[]` de `GET /conversations`, que só reflete a
página carregada). Snapshot em **tempo real** (não é filtrado por período —
para métricas por período, ver `GET /dashboard/summary`).
**Atenção de rota:** declarado antes de `GET /:id` no controller — "stats" seria
interpretado como `:id` senão.
```jsonc
{
  "totalActive": 18,       // status != CLOSED
  "waiting": 5,            // status = WAITING
  "open": 9,               // status = OPEN
  "resolvedToday": 3,      // resolvedAt >= hoje 00:00 (qualquer status)
  "unreadCount": 12,       // soma de unreadCount nas conversas ativas
  "unreadConversations": 4, // quantas conversas ativas têm unreadCount > 0
  "myOpen": 2,              // OPEN atribuídas ao requisitante (do JWT, não é parâmetro)
  "slaBreached": 1,         // ativas com slaBreachedAt setado
  "awaitingReply": 3,       // OPEN cuja ÚLTIMA mensagem é do cliente (ninguém respondeu ainda)
  "myAwaitingReply": 1      // igual acima, só do requisitante
}
```

### `GET /conversations/:id`
Tudo da listagem + `slaBreachedAt`, `resolvedAt`, `closedAt`, `metadata`, `updatedAt` e contato/agente expandidos.

### `PATCH /conversations/:id/assign`
`{ "agentId": "..." | null, "departmentId"?: "..." }` — atribui/desatribui. Emite `conversation.assigned`.

### `PATCH /conversations/:id/status`
`{ "status": "OPEN" | "RESOLVED" | "CLOSED" | "WAITING", "resolution"?: "RESOLVED" | "UNRESOLVED" }`.
`resolution` é **obrigatório quando `status: "CLOSED"`** (B-32) — o atendente
informa se o atendimento foi resolvido ou não ao encerrar; ignorado/não
persistido em qualquer outra transição. Emite `conversation.updated`.

### `PATCH /conversations/:id/read`
Zera `unreadCount`.

### `POST /conversations/:id/tags/:tagId` · `DELETE /conversations/:id/tags/:tagId`
Atribui/remove uma tag existente da conversa (B1-1). 404 se a tag ou a conversa não pertencerem à empresa do usuário.

---

## Dashboard — `/dashboard`

### `GET /dashboard/summary` (B-32)
Query: `from?`/`to?` (ISO 8601 — sem eles, últimos 30 dias terminando agora).
Contagens reais via `count` do Prisma, sempre filtradas por `companyId`.
```jsonc
{
  "period": { "from": "2026-06-26T...", "to": "2026-07-26T..." },
  "totalConversations": 42,  // createdAt no período
  "attended": 30,            // createdAt no período && agentId != null
  "notAttended": 12,         // createdAt no período && agentId == null
  "totalClosed": 25,         // status=CLOSED && closedAt no período
  "resolved": 18,            // + resolution=RESOLVED
  "unresolved": 5,           // + resolution=UNRESOLVED
  "unlabeled": 2              // + resolution=null (encerradas antes de B-32 existir)
}
```
`attended`/`notAttended` usam `createdAt` (chamados que **entraram** no
período); `totalClosed`/`resolved`/`unresolved`/`unlabeled` usam `closedAt`
(só existe depois de encerrada) — são janelas diferentes por natureza, não
um erro: um chamado pode entrar no período e só ser encerrado depois dele.

---

## Messages — `/conversations/:conversationId/messages`

### `GET .../messages`
Query: `limit=50` · `before?` (id de mensagem — cursor para paginação retroativa) · `type?` · `senderType?`

```jsonc
// Response 200 — item de data[] (ordem CRONOLÓGICA, mais antiga primeiro):
{
  "id": "...",
  "senderType": "CLIENT",            // AGENT | CLIENT | BOT | SYSTEM
  "content": "texto ou caption",     // null para mídia sem legenda
  "type": "TEXT",                    // MessageType
  "status": "DELIVERED",             // MessageStatus
  "isEdited": false,
  "quotedMessageId": null,
  "metadata": { ... } | null,
  "sentAt": "...", "deliveredAt": "..." | null, "readAt": "..." | null,
  "externalId": "3EB0...",           // id da mensagem no WhatsApp
  "sender": { "id", "name", "avatarUrl", "role" } | null,  // null p/ CLIENT
  "attachments": [{
    "id", "url",                     // URL pública no MinIO (localhost:9000)
    "mimeType",                      // ex.: image/webp
    "fileName", "size", "width", "height", "duration"
  }]
}
// Wrapper: { data, meta: { count, hasMore, nextCursor } }
```

### `GET .../messages/:id` (B-11)
Busca uma mensagem específica da conversa. Mesmo shape de item da listagem
acima, **+ `isDeleted: true|false`** — única diferença real: a listagem
(`GET .../messages`) sempre filtra `isDeleted: false` (mensagem apagada some
da lista), mas a busca por id **não** filtra — dá pra buscar uma mensagem já
apagada (soft delete) diretamente pelo id, ela só some da listagem. Nota
menor: aqui `attachments[]` não traz `width`/`height`/`duration` (a
listagem traz) — assimetria existente no `select` do Prisma, não documentada
antes por ser um detalhe fácil de não perceber sem ler o código lado a lado.
404 (`"Mensagem não encontrada"`) se o id não existir **nesta** conversa;
404 (`"Conversa não encontrada"`) se a própria conversa não pertencer à
empresa do usuário logado.

### `POST .../messages` — texto
```jsonc
// Request (SendMessageDto — campos extras = 400):
{ "type": "TEXT", "content": "até 4096 chars" }
// Mídia por URL também é aceita: { type: IMAGE|VIDEO|AUDIO|DOCUMENT, mediaUrl, caption?, fileName? }
// Response 201: a mensagem persistida (mesmo shape acima, sem attachments)
```
Regras: conversa não pode estar `CLOSED`; contato não pode estar bloqueado; só o agente atribuído ou `SUPERVISOR+` envia; conexão precisa estar `CONNECTED`. Envio é **síncrono** (Evolution → banco → evento). Se a conversa estava `WAITING`, vira `OPEN` e o remetente assume (`agentId`).

### `POST .../messages/media` — upload direto (print/anexo)
`multipart/form-data`: campo `file` (obrigatório, até 16MB) + `caption?` (até 1024).
O tipo (`IMAGE`/`VIDEO`/`AUDIO`/`DOCUMENT`) é inferido do MIME type.
Response 201: mensagem **com** `attachments: [attachment]`.

### `DELETE .../messages/:id`
Soft delete (marca `isDeleted`).

---

## Contacts — `/contacts`

### `GET /contacts`
Query: `channel?` · `isBlocked?` · `search?` (nome/telefone/email) · `page` · `limit`.
Item: `{ id, name, phone, email, avatarUrl, channel, isBlocked, createdAt, _count: { conversations } }`.
Wrapper: `{ data, meta }`. Ordenação: `name asc`.

### `GET /contacts/:id`
+ `metadata`, `updatedAt`, `tags[]` e as 10 conversas mais recentes.

### `POST /contacts` · `PATCH /contacts/:id` · `PATCH /contacts/:id/block`
CRUD padrão; block alterna `isBlocked`. `PATCH` recusa com 400 se o contato já foi anonimizado (ver `DELETE` abaixo).

### `DELETE /contacts/:id` — requer `ADMIN+`
**Não é hard delete.** É anonimização (direito de exclusão do titular — B-17/LGPD): `name`/`phone`/`email`/`avatarUrl`/`metadata` são substituídos (`name` vira `"Contato removido"`, `phone` vira `anonimizado-<id>` pra não colidir com o índice único `companyId+phone`) e `anonymizedAt` é preenchido — o registro e seu histórico de conversas/mensagens permanecem intactos (a relação `Conversation.contact` não tem cascade; hard delete quebraria com violação de FK pra qualquer contato com conversa). Recusa com 400 se já estiver anonimizado. Auditoria: `contact.anonymized` (era `contact.deleted`). Resposta: `{ message, anonymizedAt }`.

### `GET /contacts/:id/export` — requer `ADMIN+`
Portabilidade de dados do titular (B-30/LGPD, art. 18 §5º). Devolve `{ contact, conversations, exportedAt }` num único JSON: `contact` no mesmo shape de `GET /contacts/:id` (+ `tags[]`); `conversations[]` traz **todas** as conversas do contato (sem paginação — é exportação pontual, não listagem de uso corrente), cada uma com `agent: {id,name}|null` e `messages[]` completo em ordem cronológica (`senderType`, `content`, `type`, `status`, `sentAt`/`deliveredAt`/`readAt`, `sender`, `attachments[]` com `url`/`mimeType`/`fileName`/`size`). Recusa com 400 se o contato já foi anonimizado (não há mais PII pra exportar). Auditoria: `contact.exported`.

### `POST /contacts/:id/tags/:tagId` · `DELETE /contacts/:id/tags/:tagId`
Atribui/remove uma tag existente do contato (B1-1). 404 se a tag ou o contato não pertencerem à empresa do usuário.

---

## Users — `/users`

### `GET /users`
Query: `search?` · `role?` · `isActive?` · `page` · `limit`.
Item (`USER_SELECT` — nunca expõe `passwordHash`):
`{ id, companyId, name, email, role, phone, avatarUrl, isActive, lastSeenAt, createdAt, updatedAt }`.
Wrapper: `{ data, meta }`.

### `POST /users`
```jsonc
{
  "name": "até 120",
  "email": "válido",
  "password": "mín. 8, com maiúscula, minúscula e número",
  "role?": "AGENT | SUPERVISOR | ADMIN",   // default AGENT
  "phone?": "...", "avatarUrl?": "URL válida"
}
```

### `PATCH /users/:id` — campos parciais (incl. `role`, `isActive`), requer `ADMIN`
### `PATCH /users/:id/password` — `{ currentPassword, newPassword }` (próprio usuário)
### `DELETE /users/:id`

### `POST /users/:id/reset-password` (B-26) — requer `ADMIN`
Reset administrativo mínimo, sem SMTP: gera uma senha temporária aleatória
(12 caracteres, já satisfaz a política — maiúscula/minúscula/número) para
outro usuário da própria empresa, sem precisar saber a senha atual. Corpo
vazio. Responde `200 { temporaryPassword }` — a senha em texto puro só
existe nesta resposta, nunca é logada nem persistida fora do hash; quem
chamou precisa repassá-la ao usuário por fora (verbal, chat interno, etc).
`400` se `id` for o próprio requisitante (use `PATCH /users/:id/password`
pra trocar a própria senha). Registra `user.password_reset` em auditoria.
**Limitação conhecida:** não resolve o caso do único `ADMIN` da empresa se
trancar sozinho fora dela — ele precisaria estar autenticado para chamar
isto. Cobre o caso mais comum: `AGENT`/`SUPERVISOR` esqueceu a senha e há
um `ADMIN` ativo disponível.

### `PATCH /users/me` (B3-1) — auto-edição do próprio perfil, sem exigir `ADMIN`
```jsonc
{ "name?": "até 120", "phone?": "...", "avatarUrl?": "URL válida" }
```
Só estes 3 campos existem no DTO — `role`/`isActive` não fazem parte do shape
aceito, então o `ValidationPipe` (`forbidNonWhitelisted`) rejeita com 400
antes de qualquer checagem de negócio. Retorna o `USER_SELECT` atualizado.
**Atenção de rota:** precisa ser chamado antes de `PATCH /users/:id` na
declaração do controller — "me" seria interpretado como `:id` senão.

### `POST /users/me/avatar` (B3-2) — multipart, campo `file`
Só aceita `image/*`, limite 5MB (menor que os 16MB de `messages/media` —
é uma foto de perfil). Sobe pro MinIO via `StorageService` (mesmo padrão de
`messages/media`) e atualiza `avatarUrl`. Retorna `201` com o `USER_SELECT`
atualizado (`avatarUrl` já apontando pra URL pública do MinIO).

---

## Departments (grupos/setores) — `/departments`

### `GET /departments` → **array puro**
Item: `{ id, name, description, color, isActive, createdAt, _count: { users, conversations } }`
(`_count.conversations` conta apenas `WAITING`/`OPEN`.)

### `GET /departments/:id`
+ `users[]` (`{ id, name, email, role, avatarUrl, isActive }`), `queues[]` (`{ id, name, strategy, isActive }`).

### `POST /departments` — `{ name (único na empresa), description?, color? }`
### `PATCH /departments/:id` · `DELETE /departments/:id`
### `POST /departments/:id/users` — `{ userId }` → retorna o department com `users[]` atualizado
### `DELETE /departments/:id/users/:userId` — idem

---

## Queues (filas de distribuição) — `/queues`

### `GET /queues` → **array puro**
Item: `{ id, name, strategy, maxWaitSecs, greetingMsg, departmentId, isActive, createdAt, updatedAt, department: {id,name,color} | null, _count: { conversations } }`

### `GET /queues/:id` — mesmo shape do item da lista

### `POST /queues` — `{ name (único na empresa), strategy? (ROUND_ROBIN|MANUAL|LEAST_BUSY, default ROUND_ROBIN), maxWaitSecs? (segundos, default 300), greetingMsg?, departmentId? }`
`departmentId`, se informado, precisa pertencer à mesma empresa (404 se não pertencer).

### `PATCH /queues/:id` — campos parciais (incl. `isActive`) · `DELETE /queues/:id`
`DELETE` falha com 400 se a fila tiver conversas associadas.

**Vínculo automático (B1-2):** ao chegar uma mensagem nova de um contato sem
conversa aberta, se a `WhatsAppConnection` tiver `departmentId` e existir uma
`Queue` ativa para esse departamento, a conversa nasce com `departmentId` e
`queueId` já preenchidos (usada pela Fase B2 para o SLA). Sem fila ativa no
departamento, a conversa nasce como hoje (`departmentId`/`queueId` nulos).

---

## Tags — `/tags`

### `GET /tags` → **array puro**
Item: `{ id, name, color, _count: { conversations, contacts } }`

### `POST /tags` — `{ name (único na empresa, ≤50), color? (hex) }` · requer `SUPERVISOR+`
### `PATCH /tags/:id` · `DELETE /tags/:id` — requer `SUPERVISOR+`
`DELETE` desvincula automaticamente de conversas/contatos (relação N:N implícita do Prisma, sem bloqueio).

Atribuir/remover tag em conversas e contatos é feito pelas rotas dos próprios
recursos: `POST/DELETE /conversations/:id/tags/:tagId` e
`POST/DELETE /contacts/:id/tags/:tagId` (ver seções acima).

---

## Notifications — `/notifications`

### `GET /notifications` — Query: `unreadOnly?` · `page` · `limit`
Item: `{ id, companyId, userId, type, title, body, data, readAt, createdAt }` — sempre só as do próprio usuário logado.
Wrapper: `{ data, meta }`. Ordenação: `createdAt desc`.

### `PATCH /notifications/:id/read` · `PATCH /notifications/read-all`
Marca uma ou todas as notificações do usuário logado como lidas. 404 se o `id` for de outro usuário (mesmo dentro da empresa).

**Pontos de criação (B1-3):** conversa atribuída a um agente (`type: "conversation_assigned"`) e SLA violado, disparado para todo `SUPERVISOR+` ativo da empresa já que a conversa está sem agente nesse momento (`type: "sla_breach"`).

---

## Audit Logs — `/audit-logs`

### `GET /audit-logs` — Query: `entity?` · `entityId?` · `userId?` · `page` · `limit` · requer `ADMIN+`
Item: `{ id, companyId, userId, action, entity, entityId, before, after, ip, userAgent, createdAt, user: {id,name,email} | null }`
Wrapper: `{ data, meta }`. Ordenação: `createdAt desc`.

**Ações registradas na v1 (B1-4)**, decisão consciente de escopo mínimo — sem interceptor global, cada service chama `AuditLogService.record()` explicitamente para a ação que já considera sensível:
- `user.created`, `user.role_changed` (não loga edição de nome/telefone/avatar), `user.deactivated`
- `contact.deleted`
- `conversation.assigned` (loga a mudança real de `agentId`, incluindo desatribuição)
- `sla.breached` (já existia antes da B1-4, migrado para usar `AuditLogService`)

---

## WhatsApp — `/whatsapp`

### `GET /whatsapp` → **array puro**
Item: `{ id, name, phone, profileName, profilePicture, status, platform, isActive, lastSeenAt, createdAt, department: {id,name,color} | null, _count: { conversations } }`

### `GET /whatsapp/:id` — + `sessionName`, `battery`, `updatedAt`
### `POST /whatsapp` — `{ name (≤60), departmentId? }` → cria a instância na Evolution com webhook configurado
### `GET /whatsapp/:id/qrcode` → `{ qrCode: "data:image/png;base64,..." | "<base64>", code? }`
### `GET /whatsapp/:id/status` → sincroniza com a Evolution e retorna `{ status, ... }`
### `POST /whatsapp/:id/disconnect` · `PATCH /whatsapp/:id` · `DELETE /whatsapp/:id`

---

## Notes (anotações internas) — `/conversations/:conversationId/notes`
`GET` (array puro) · `POST { content }` · `PATCH :id` · `DELETE :id`.
Autor: `{ id, name, avatarUrl }`. Notas nunca vão para o WhatsApp.

## Company — `/company`
`GET /company/me` · `PATCH /company/me` — dados da empresa do usuário logado.

## Health — `/health` (público, sem throttle)
`GET` (liveness — não toca dependência) → `{ "status": "ok", "timestamp": "...", "uptime": <segundos> }`

### `GET /health/ready` (B5-3/B6-3) — readiness, checa PostgreSQL e Redis de verdade
`200 { "status": "ok", "checks": { "database": "up", "redis": "up" }, "timestamp": "..." }`
quando os dois respondem; `503` com o mesmo shape (`status: "unavailable"`,
detalhando qual dependência caiu) caso contrário. Pensado pra orquestração/
nginx decidirem se a instância deve receber tráfego — o `GET /health` acima
não serve pra isso (não checa nada além do processo estar de pé).

## Webhooks — `/webhooks/evolution` (público com apikey)
`POST` consumido pela Evolution API. Autenticação: header `apikey` comparado
(timing-safe) com `EVOLUTION_API_KEY` — sem a env, **500 fail-closed**; chave
errada, 403. Body até **25mb** (mídia base64). Eventos: `QRCODE_UPDATED`,
`CONNECTION_UPDATE`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_DELETE`,
`SEND_MESSAGE`, `CONTACTS_UPSERT`.

---

## Socket.IO — namespace `/ws`

- **URL:** `http://localhost:3001/ws` (config `VITE_WS_URL`)
- **Handshake:** `auth: { token: <accessToken JWT> }` — rejeitado com
  `connect_error` `"Token não informado"` / `"Token inválido ou expirado"`
- **Salas automáticas:** `company:<companyId>` e `agent:<userId>` no connect
- **Emissão:** eventos por conversa saem para a **união** de
  `conversation:<id>` + `company:<companyId>` (sem duplicar)

### Cliente → servidor
| Evento | Payload | Efeito |
|---|---|---|
| `join:conversation` | `{ conversationId }` | entra na sala (valida multi-tenant) |
| `leave:conversation` | `{ conversationId }` | sai da sala |
| `ping` | — | responde `pong` |

### Servidor → cliente
| Evento | Payload |
|---|---|
| `connected` | confirmação pós-handshake |
| `message.new` | `{ conversationId, companyId, message: { id, senderType, content, type, status, sentAt, externalId } }` — **sem attachments** (download é assíncrono) |
| `message.updated` | `{ companyId, conversationId, messageId, attachment: { id, url, mimeType, fileName } }` — anexo pronto |
| `message.status` | `{ conversationId, companyId, externalId, status }` |
| `conversation.created` | `{ companyId, conversation: { id, status, channel, contact: {id,name,phone,avatarUrl}, whatsappConnectionId, createdAt } }` |
| `conversation.updated` | `{ companyId, conversationId, changes: {...} }` |
| `conversation.assigned` | `{ companyId, conversationId, agentId, departmentId, agent }` |
| `connection.status` | `{ companyId, connectionId, sessionName, status, phone?, profileName? }` |
| `sla.breached` | `{ companyId, conversationId, contact, queue, waitTimeSeconds, maxWaitSecs, breachedAt }` |

---

## ⚠️ Divergências conhecidas do frontend/mock (alvo de F1-2/F1-3)

1. **Mock** responde listas como `{ data, pagination }`; o real usa `{ data, meta }`.
2. **Mock de mensagem** usa `{ type: 'agent'|'customer', text, time: 'HH:MM' }`;
   o real usa `{ senderType, content, sentAt }` — o front converte via
   `toUiMessage`/`toUiConversation` (`src/hooks/useConversations.js`).
3. `apiClient.register()` chama rota inexistente (F1-4).
4. `GET /whatsapp` e `GET /departments` retornam **array puro** — o helper
   `unwrap()` do SettingsPanel tolera ambos os formatos.
