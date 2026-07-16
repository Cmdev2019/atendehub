# 📜 Contrato da API — AtendeHub

> **Fonte da verdade:** este documento descreve o contrato REAL do backend NestJS
> (`apps/api`), extraído dos controllers, DTOs e dos `select` do Prisma em
> 2026-07-16 (item F1-1 do roadmap). Componentes do frontend, mock
> (`src/services/apiMock.js`) e testes devem seguir **exatamente** estes shapes.
> Ao alterar um endpoint no backend, atualize este arquivo no mesmo commit.

- **Base URL:** `http://localhost:3001/api/v1` (config: `VITE_API_URL` no front, `API_PREFIX`/porta no back)
- **Autenticação:** `Authorization: Bearer <accessToken>` em todas as rotas, exceto `/health`, `/auth/login`, `/auth/refresh` e `/webhooks/evolution`
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
| Array puro | `GET /whatsapp`, `GET /departments`, `GET .../notes` | `[...]` (sem wrapper) |

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

### `POST /auth/logout`
`{ "refreshToken": "..." }` → revoga o refresh token e blacklista o access token atual. Responde **204 No Content**.

### `POST /auth/revoke`
Revoga TODOS os refresh tokens do usuário (logout de todos os dispositivos).

### `GET /auth/me`
→ `AuthUserDto`: `{ id, companyId, name, email, role, avatarUrl }`

> ⚠️ **Não existe `POST /auth/register`** — o `apiClient.register()` do front
> chama uma rota inexistente (decisão pendente F1-4).

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

### `GET /conversations/:id`
Tudo da listagem + `slaBreachedAt`, `resolvedAt`, `closedAt`, `metadata`, `updatedAt` e contato/agente expandidos.

### `PATCH /conversations/:id/assign`
`{ "agentId": "..." | null, "departmentId"?: "..." }` — atribui/desatribui. Emite `conversation.assigned`.

### `PATCH /conversations/:id/status`
`{ "status": "OPEN" | "RESOLVED" | "CLOSED" | "WAITING" }`. Emite `conversation.updated`.

### `PATCH /conversations/:id/read`
Zera `unreadCount`.

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

### `POST /contacts` · `PATCH /contacts/:id` · `DELETE /contacts/:id` · `PATCH /contacts/:id/block`
CRUD padrão; block alterna `isBlocked`.

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

### `PATCH /users/:id` — campos parciais (incl. `role`, `isActive`)
### `PATCH /users/:id/password` — `{ currentPassword, newPassword }` (próprio usuário)
### `DELETE /users/:id`

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
`GET` → `{ "status": "ok", "timestamp": "...", "uptime": <segundos> }`

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
