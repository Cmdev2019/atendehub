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
- **Rate limit global:** `THROTTLE_LIMIT` req / `THROTTLE_TTL` s (default 100/60s) **por usuário** quando o `Authorization` traz um token válido, **por IP** nas rotas sem token (login, cadastro, refresh). Atrás do nginx, o IP é o do cliente (`X-Forwarded-For`, B-56). Acima do limite: `429` com `Retry-After` (segundos). Contador no Redis, compartilhado entre réplicas.
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
| `Availability` | `ONLINE` · `OFFLINE` — estado do atendente (B-65, ADR-0019); padrão `OFFLINE` |
| `ConnectionStatus` | `CONNECTED` · `DISCONNECTED` · `CONNECTING` · `QR_CODE` · `ERROR` |
| `Channel` | `WHATSAPP` · `INSTAGRAM` · `EMAIL` · `CHAT` |
| `ConversationStatus` | `WAITING` · `OPEN` · `RESOLVED` · `CLOSED` |
| `SenderType` | `AGENT` · `CLIENT` · `BOT` · `SYSTEM` |
| `MessageType` | `TEXT` · `IMAGE` · `VIDEO` · `AUDIO` · `DOCUMENT` · `STICKER` · `LOCATION` · `CONTACT_CARD` · `TEMPLATE` · `REACTION` · `DELETED` — desde o B-81 a reação não vira mensagem (fica na original, em `metadata.reaction`); `REACTION` só aparece em mensagens antigas |
| `MessageStatus` | `PENDING` · `SENT` · `DELIVERED` · `READ` · `FAILED` |
| `QueueStrategy` | `ROUND_ROBIN` · `MANUAL` · `LEAST_BUSY` — desde o B-66 (ADR-0019) a API só aceita e aplica `MANUAL` (fila compartilhada); os outros dois ficam no enum só por histórico |
| `AutoAttendanceAction` | `ROUTE_TO_DEPARTMENT` · `ROUTE_TO_QUEUE` · `END_CONVERSATION` |
| `Plan` | `FREE` · `STARTER` · `PROFESSIONAL` · `ENTERPRISE` |

---

## Auth — `/auth`

### `POST /auth/login` (público)
E-mail ou senha que não sejam texto (ou gigantes) respondem `400` (B-96). Senhas novas (cadastro, criação de
usuário, troca) têm no máximo **72 bytes** — o limite do bcrypt.
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
    "role": "ADMIN", "avatarUrl": null,
    "availability": "OFFLINE"            // B-65: o login não muda o estado
  }
}
// 401 → { statusCode: 401, message: "Usuário ou senha incorreta." }
```

### `POST /auth/refresh` (público)
`{ "refreshToken": "..." }` → mesmo shape do login (rotaciona o refresh token).
A rotação revoga o refresh token enviado: o cliente **precisa substituir** o
refresh token salvo pelo que vem na resposta — reenviar o antigo responde `401`.
Cada refresh token vale uma única vez, então renovações simultâneas com o mesmo
token devem ser evitadas (o frontend usa uma renovação por vez, ver
`src/services/sessionRefresh.js`, B-53). A rotação é atômica: de duas renovações
simultâneas com o mesmo token, só uma recebe o par novo. Reenviar um refresh token
já trocado, passada uma janela curta de tolerância (corrida entre abas), encerra
todas as sessões do usuário (B-72). Access token não é aceito aqui, nem refresh
token nas rotas protegidas.

### `POST /auth/register-company` (público, B-9)
Auto-cadastro de empresa nova — quem se cadastra vira `ADMIN` dessa empresa. Limite: **3 req/60s por IP** (mais apertado que login, pois cria linhas no banco).
B-85: além disso, no máximo `SIGNUP_DAILY_LIMIT_PER_IP` (padrão 5) cadastros por IP por dia (`429` passado o teto) e
`403` quando `SIGNUP_ENABLED=false`. O `409` de e-mail já cadastrado continua (revela que o e-mail existe —
aceito enquanto não houver verificação de e-mail). No login, e-mail inexistente e senha errada respondem igual,
também no tempo de resposta.
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
B-65: põe o usuário do token **Offline** (emite `user.availability` se ele estava Online). Uma falha
nessa troca não impede o logout.
B-107: com o Redis sem responder ou fora do ar, a blacklist desiste em 500 ms e o logout responde
igual — o refresh token fica revogado no banco, mas o access token pode continuar aceito até
expirar (`JWT_EXPIRES_IN`, 15 min por padrão), porque a checagem da blacklist é fail-open.

### `POST /auth/revoke`
Revoga TODOS os refresh tokens do usuário (logout de todos os dispositivos).

### `GET /auth/me`
→ `AuthUserDto`: `{ id, companyId, name, email, role, avatarUrl, availability }`

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

> **Escopo (B-40, 2026-10-17):** ADMIN, SUPERVISOR e SUPER_ADMIN veem todas as
> conversas da empresa. AGENT vê as atribuídas a ele, as dos departamentos a
> que pertence e as sem departamento. Vale para a listagem, `stats`, Dashboard
> e para toda rota com a conversa na URL (`/conversations/:id/...`,
> `/conversations/:conversationId/messages|notes/...`): fora do escopo
> responde **404** (igual a conversa inexistente). Os departamentos do
> usuário são lidos a cada requisição — mudar vale sem novo login.

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
  "_count":     { "messages": 12 },
  // B-66 (ADR-0019, regra 15): ciclo de espera atual
  "waitingSince": "2026-10-19T13:00:00.000Z" | null, // início da espera atual (mantido depois de atendida)
  "waitSlaDueAt": "2026-10-19T13:05:00.000Z" | null, // prazo do SLA da espera, contado só no expediente (B-112); null = sem SLA ou fora da fila
  "slaBreachedAt": null,                             // estouro do SLA da espera
  // B-114 (ADR-0019, regras 18 a 21): ciclo do atendimento atual — null fora de atendimento
  "attendedAt": "2026-10-19T13:02:00.000Z" | null,      // início do atendimento (Atender, Pegar próxima, 1ª resposta ou transferência para uma pessoa)
  "serviceSlaDueAt": "2026-10-19T13:32:00.000Z" | null, // prazo do SLA do atendimento, contado só no expediente; null = setor sem prazo
  "serviceSlaBreachedAt": null                          // estouro do SLA do atendimento
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

### `GET /conversations/overview` (B-68) — visão do supervisor: setores × atendentes
Só `SUPERVISOR` e acima (`403` para `AGENT`); os números são da empresa toda. Declarada antes de
`GET /:id`, como o `/stats`. "Estourado" = marcado pelo job do SLA **ou** com o prazo já vencido.
```jsonc
{
  "generatedAt": "2026-10-21T13:00:00.000Z",
  "totals": {
    "waiting": 3, "oldestWaitingSince": "..." | null, "waitSlaBreached": 1,
    "inService": 3, "serviceSlaBreached": 1, "agentsOnline": 2, "agentsTotal": 3
  },
  // Um item por setor (ordem alfabética) e, se houver conversa sem setor, a linha
  // { "id": null, "name": "Sem setor" } no fim
  "departments": [{
    "id": "...", "name": "Receitas", "color": "#0f766e", "isActive": true,
    "waiting": 2, "oldestWaitingSince": "...", "waitSlaBreached": 1,
    "inService": 1, "serviceSlaBreached": 0,
    "agentsOnline": 1, "agentsTotal": 2          // membros ativos do setor
  }],
  // Usuários ativos (inclui supervisor e admin, que também atendem)
  "agents": [{
    "id": "...", "name": "Ana", "avatarUrl": null, "role": "AGENT",
    "availability": "ONLINE", "availabilityChangedAt": "..." | null, "departmentIds": ["..."],
    "inService": 2, "serviceSlaBreached": 0,
    "awaitingReply": 1                           // em atendimento com a última mensagem do paciente
  }]
}
```

### `GET /conversations/:id`
Tudo da listagem + `slaBreachedAt`, `resolvedAt`, `closedAt`, `resolution`, `resolutionNote` (B-36), `metadata`, `updatedAt` e contato/agente expandidos. `queue` traz `maxWaitSecs` (B-66) e `maxServiceSecs` (B-114).

**SLA do atendimento (B-114, ADR-0019 regras 18 a 21):** o relógio abre quando a conversa sai da
fila com alguém — `/attend`, `/next`, a 1ª resposta de supervisor/admin ou o `/assign` para uma
pessoa — e fecha ao encerrar (`RESOLVED` ou `CLOSED`). O prazo é o `maxServiceSecs` da fila do
setor, contado só no expediente (B-112). Transferir para outra pessoa do **mesmo setor** mantém o
relógio; **mudar de setor** recomeça com o prazo do setor novo (e a fila da conversa passa a ser a
dele); devolver à fila fecha o ciclo (`attendedAt`, `serviceSlaDueAt` e `serviceSlaBreachedAt`
voltam a `null`). Ao estourar, a API grava `serviceSlaBreachedAt`, emite `sla.service_breached` e
notifica quem atende e os supervisores e admins (`type: "service_sla_breach"`).

**Redis indisponível (B-107):** `/attend`, `/next`, `/assign` e `/status` gravam no banco, numa
transação, tudo o que a troca precisa (atendente, início e prazos dos SLAs e a auditoria), emitem o
evento e respondem **sem esperar o Redis**. Os jobs do SLA vão para a fila logo depois, com prazo de
2 s por comando. Com o Redis travado ou fora do ar, a resposta é a mesma (`200`) e cada job que não
chegou ao Redis fica no log; a reconciliação, a cada 60 s, recria pelo banco o job do ciclo aberto
que faltar (também depois de a API reiniciar), sem duplicar o que já existe nem recriar ciclo
encerrado. Nesse caso, o alerta de estouro pode chegar até cerca de 1 min depois do prazo.

### `POST /conversations/:id/attend` (B-66, ADR-0019) — pegar a conversa da fila para si
Corpo vazio. **Quem chegar primeiro fica com a conversa:** a passagem `WAITING → OPEN` é uma
atualização condicional no banco, e com pedidos simultâneos só um passa.
```jsonc
// Response 200
{ "id": "...", "status": "OPEN", "waitingSince": "...", "attendedAt": "...", "serviceSlaDueAt": "..." | null, "agent": { "id", "name", "avatarUrl" }, "department": { "id", "name" } | null }
// 409 → { message: "Fulano já está atendendo" }          — outro chegou antes
// 409 → { message: "Fique Online para atender" }          — quem chamou está Offline (B-65)
// 409 → { message: "Esta conversa não está na fila" }
// 400 → { message: "Esta conversa já foi encerrada" }
```
Qualquer papel, desde que a conversa esteja no escopo (B-40; fora dele, 404). Cancela o SLA da
espera, registra `conversation.attended` na auditoria, abre o ciclo do atendimento (B-114) e emite
`conversation.assigned` com `status`.

### `POST /conversations/next` (B-67, ADR-0019 regra 5) — pegar a próxima da fila
Corpo vazio. Atende, para quem chama, a conversa em espera **mais antiga** (pelo `waitingSince`)
dos setores de que ele é membro — vale para qualquer papel: supervisor e admin também pegam só
dos setores deles. Escolher e atender é uma instrução só no Postgres (`FOR UPDATE SKIP LOCKED`):
pedidos simultâneos recebem conversas diferentes, e o `/attend` não pega a mesma.
```jsonc
// Response 200 — o mesmo shape do /attend
{ "id": "...", "status": "OPEN", "waitingSince": "...", "agent": { "id", "name", "avatarUrl" }, "department": { "id", "name" } }
// 204 (sem corpo) — nada esperando nos setores de quem chamou, ou ele não é de nenhum setor
// 409 → { message: "Fique Online para atender" }          — quem chamou está Offline (B-65)
```
Conversa sem setor fica de fora (continua no `/attend`). Mesmos efeitos do `/attend`: cancela o
SLA da espera, registra `conversation.attended`, abre o ciclo do atendimento com o prazo do setor
da conversa escolhida (B-114) e emite `conversation.assigned` com `status`.

### `PATCH /conversations/:id/assign` — transferir (B-66, ADR-0019 regra 4)
`{ "agentId"?: "..." | null, "departmentId"?: "..." }` — para uma pessoa (`agentId`) ou, sem
`agentId`, **de volta à fila** do setor (o informado ou o atual): `WAITING`, sem atendente, com
`waitingSince` e prazo de SLA novos.
- **Quem pode:** o `AGENT` transfere só as conversas que estão com ele — a de um colega, ou uma
  da fila, responde `403` (para pegar da fila, `POST /attend`). `SUPERVISOR`/`ADMIN` transferem
  qualquer conversa e puxam para si a de outro atendente.
- **Destino:** a pessoa precisa estar Online (`409` "Fulano está Offline"; puxando para si,
  "Fique Online para atender").
- **Concorrência:** a troca confere quem estava com a conversa; se mudou no meio (alguém atendeu
  ou transferiu antes), `409`.
- Conversa `CLOSED` responde `400` (encerrada não reabre, B-73). `409` se a conversa voltaria a
  ficar ativa e o contato já tem outra conversa `WAITING`/`OPEN` (uma ativa por contato, B-49).
- **SLA do atendimento (B-114):** tirar da fila para uma pessoa abre o ciclo; já em atendimento,
  no mesmo setor o relógio continua e, mudando de setor, recomeça com o prazo do setor novo;
  devolver à fila fecha o ciclo.
- Resposta: o mesmo shape do `/attend`. Emite `conversation.assigned` (com `status`); notifica a
  pessoa que recebeu, se não for quem chamou.

### `PATCH /conversations/:id/status`
`{ "status": "OPEN" | "RESOLVED" | "CLOSED" | "WAITING", "resolution"?: "RESOLVED" | "UNRESOLVED" | "CANCELLED", "resolutionNote"?: "até 500 caracteres" }`.
`resolution` é **obrigatório quando `status: "CLOSED"`** (B-32) — o atendente
informa se o atendimento foi resolvido, não resolvido ou cancelado (B-36) ao
encerrar; ignorado/não persistido em qualquer outra transição.
`resolutionNote` é **obrigatório quando `resolution: "CANCELLED"`** (B-36) —
justificativa do atendente pra cancelar em vez de atender; não existe pra
`RESOLVED`/`UNRESOLVED`. Emite `conversation.updated`. `409` ao reativar
(`WAITING`/`OPEN`) quando o contato já tem outra conversa ativa (B-73).
B-66: o `AGENT` só muda o status das conversas que estão com ele (`403` nas de colegas) — a
exceção é encerrar uma conversa da fila ("Encerrar sem atender", B-36). Voltar para `WAITING`
tira o atendente e abre um ciclo de espera novo (`waitingSince` e prazo de SLA).
B-114: sair de `OPEN` para `RESOLVED` ou `CLOSED` fecha o ciclo do atendimento e registra
`conversation.service_closed` na auditoria; voltar para `WAITING` fecha o ciclo sem registrar
duração; reabrir para `OPEN` sem ninguém atender não abre ciclo.

### `PATCH /conversations/:id/read`
Zera `unreadCount`. O front chama ao abrir a conversa e quando chega mensagem
do cliente na conversa aberta (B-60).

**`unreadCount` e `lastMessagePreview` (B-60):** toda mensagem nova (cliente,
atendente, resposta pelo celular) atualiza `lastMessageAt` e
`lastMessagePreview`; só mensagem do **cliente** incrementa `unreadCount`. A
mensagem do robô do auto-atendimento não mexe em nenhum dos dois (B-78): a
lista continua mostrando o que o cliente disse, não o texto do menu. A
prévia é o texto/legenda ou, sem texto, o rótulo do tipo: `Imagem`, `Vídeo`,
`Áudio`, `Documento`, `Figurinha`, `Localização`, `Contato`, `Reação`
(antes, mídia sem legenda não atualizava a conversa — B-42 — e mídia enviada
pelo painel virava `[image]`, `[audio]`...).

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
  "cancelled": 1,             // + resolution=CANCELLED (B-36)
  "unlabeled": 1              // + resolution=null (encerradas antes de B-32 existir)
}
```
`attended`/`notAttended` usam `createdAt` (chamados que **entraram** no
período); `totalClosed`/`resolved`/`unresolved`/`cancelled`/`unlabeled` usam
`closedAt` (só existe depois de encerrada) — são janelas diferentes por
natureza, não um erro: um chamado pode entrar no período e só ser encerrado
depois dele. `cancelled` fica separado de `unresolved` de propósito —
cancelamento é o atendente desistindo/redirecionando (com justificativa
obrigatória, B-36), não uma tentativa de atendimento que não deu certo.

---

## Reports — `/reports` (B-33)
B-105: período de no máximo **366 dias** e início antes do fim (`400` caso contrário); a base de atendimento
recusa (`400`) períodos com mais de **5.000** conversas — peça um período menor.

> **Só SUPERVISOR em diante (B-40):** os relatórios cobrem a empresa toda;
> AGENT recebe **403**.

Os 3 endpoints abaixo compartilham a mesma query: `from?`/`to?` (ISO 8601 —
sem eles, últimos 30 dias; data sem hora, `AAAA-MM-DD`, vale do início do dia
`from` ao **fim** do dia `to` no fuso da empresa — B-61; datas do CSV/PDF
também saem nesse fuso) e `format?` (`json` padrão, `csv` ou `pdf` — os 2
últimos viram download, `Content-Disposition: attachment`, em vez de JSON).

### `GET /reports/attendance` — base de atendimento
Lista detalhada de conversas do período (uma linha por conversa).
```jsonc
{
  "period": { "from": "...", "to": "..." },
  "rows": [
    {
      "contato": "Marina Alves",       // nome, ou telefone se não tiver nome
      "canal": "WHATSAPP",
      "atendente": "Ana",              // "—" se nunca atribuída
      "departamento": "Comercial",     // "—" se nenhum
      "status": "CLOSED",
      "resolucao": "Resolvido",        // "Resolvido" | "Não resolvido" | "Cancelado" | "—"
      "tags": "Entrega, Prioridade",   // "—" se nenhuma
      "criadaEm": "2026-07-10T10:00:00.000Z",
      "encerradaEm": "2026-07-10T12:00:00.000Z" // null se ainda ativa
    }
  ]
}
```

### `GET /reports/by-tag` — por tipo de atendimento
Agrupado por tag (uma conversa com 2 tags entra na contagem das 2 — categorias
não-exclusivas, comportamento esperado). Tag sem nenhuma conversa no período
não aparece.
```jsonc
{
  "period": { "from": "...", "to": "..." },
  "rows": [
    { "tag": "Entrega", "total": 12, "resolvidas": 8, "naoResolvidas": 2, "canceladas": 1, "tempoMedioResolucaoHoras": 3.5 }
  ]
}
```

### `GET /reports/by-agent` — por atendente
Um agente sem nenhuma atividade (nem no período, nem em aberto agora) não
aparece. `emAberto` é estado **atual** (não filtrado por período — uma
conversa aberta há semanas continua relevante hoje).
```jsonc
{
  "period": { "from": "...", "to": "..." },
  "rows": [
    { "atendente": "Ana", "atendidas": 20, "resolvidas": 15, "naoResolvidas": 3, "canceladas": 1, "emAberto": 2, "tempoMedioResolucaoHoras": 2.1 }
  ]
}
```

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
    "id", "url",                     // URL ASSINADA e temporária (B-38) — bucket é
                                      // privado; expira em MEDIA_SIGNED_URL_EXPIRATION
                                      // segundos (600 por padrão). Não cachear/persistir
                                      // no cliente além da sessão — re-buscar o recurso
                                      // (ex.: recarregar a conversa) gera uma URL nova.
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
// Só texto (B-75): `type` diferente de TEXT, ou `mediaUrl`/`caption`/`fileName`, responde 400.
// Mídia vai por upload em POST .../messages/media.
// Response 201: a mensagem persistida (mesmo shape acima, sem attachments)
```
Regras: conversa não pode estar `CLOSED`; contato não pode estar bloqueado; só o agente atribuído ou `SUPERVISOR+` envia; conexão precisa estar `CONNECTED`. Envio é **síncrono** (Evolution → banco → evento). Se a conversa estava `WAITING`, o remetente a atende **antes** de enviar, pela mesma troca do `POST /attend` (B-66): se outro chegou antes ou o remetente está Offline, responde `409` e nada vai para o paciente.

### `POST .../messages/media` — upload direto (print/anexo)
`multipart/form-data`: campo `file` (obrigatório, até 16MB) + `caption?` (até 1024).
O tipo (`IMAGE`/`VIDEO`/`AUDIO`/`DOCUMENT`) é inferido do MIME type.
Response 201: mensagem **com** `attachments: [attachment]`.

### `DELETE .../messages/:id`
Soft delete (marca `isDeleted`).

---

## Contacts — `/contacts`

### `GET /contacts`
Query: `channel?` · `isBlocked?` · `tagId?` (B-34 — filtra contatos com essa tag atribuída) · `search?` (nome/telefone/email) · `page` · `limit`.
Item: `{ id, name, phone, email, avatarUrl, channel, isBlocked, createdAt, tags[] (B-34), _count: { conversations } }`.
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
`{ id, companyId, name, email, role, phone, avatarUrl, isActive, lastSeenAt, availability, availabilityChangedAt, createdAt, updatedAt, departments: [{ id, name, color }] }`.
Wrapper: `{ data, meta }`. `availability` é o estado Online/Offline escolhido pelo próprio usuário (B-65);
`departments` são os setores que ele atende, em ordem alfabética (B-113). `GET /users/:id` tem o mesmo shape.

### `POST /users`
```jsonc
{
  "name": "até 120",
  "email": "válido",
  "password": "mín. 8, com maiúscula, minúscula e número",
  "role?": "AGENT | SUPERVISOR | ADMIN",   // default AGENT
  "phone?": "...", "avatarUrl?": "URL válida",
  "departmentIds?": ["..."]                // B-113: setores que atende, sem repetir
}
```
Setor que não é da empresa responde `400` ("Setor não encontrado nesta empresa"), antes de criar
o usuário. A resposta traz `departments`, como no `GET /users`.

### `PATCH /users/:id` — campos parciais (incl. `role`, `isActive`, `departmentIds`), requer `ADMIN`
`isActive: false` também põe o usuário Offline (B-65). `availability` não faz parte do DTO: o
estado de outra pessoa não se muda por aqui (`400`, campo não permitido).
`departmentIds` (B-113) **substitui** os setores do usuário: `[]` tira de todos, e ausente não mexe
neles. Setor de outra empresa responde `400`. Mudar os setores, como mudar o papel, derruba os
sockets do usuário, que reconectam já com as salas novas.
### `PATCH /users/:id/password` — `{ currentPassword, newPassword }` (só o próprio usuário)
`:id` precisa ser o do usuário do token: qualquer outro id responde `403` antes de
consultar o banco (B-51). Senha atual errada responde `400`. Limite próprio de
5 tentativas por minuto. Registra `user.password_changed` em auditoria. Para a
senha de outro usuário, use `POST /users/:id/reset-password` (ADMIN).
Encerra **todas** as sessões do usuário, inclusive a do token usado na chamada
(B-72): responde `200 { message, accessToken, refreshToken, expiresIn, user }`
— o cliente precisa trocar os tokens salvos pelos da resposta para continuar logado.

### `DELETE /users/:id`
Desativa (soft delete) e põe o usuário Offline (B-65).

### `POST /users/:id/reset-password` (B-26) — requer `ADMIN`
Reset administrativo mínimo, sem SMTP: gera uma senha temporária aleatória
(12 caracteres, já satisfaz a política — maiúscula/minúscula/número) para
outro usuário da própria empresa, sem precisar saber a senha atual. Corpo
vazio. Responde `200 { temporaryPassword }` — a senha em texto puro só
existe nesta resposta, nunca é logada nem persistida fora do hash; quem
chamou precisa repassá-la ao usuário por fora (verbal, chat interno, etc).
`400` se `id` for o próprio requisitante (use `PATCH /users/:id/password`
pra trocar a própria senha). Registra `user.password_reset` em auditoria.
Encerra todas as sessões abertas do usuário resetado (B-72).
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

### `PATCH /users/me/availability` (B-65, ADR-0019) — estado do próprio usuário, qualquer papel
```jsonc
// Request
{ "availability": "ONLINE" }               // ou "OFFLINE"; outro valor → 400
// Response 200
{ "availability": "ONLINE", "availabilityChangedAt": "2026-10-19T13:40:00.000Z" }
```
Só o próprio estado: a rota não tem `:id`. Online recebe o aviso de conversa nova e pega da fila;
Offline não (a recusa ao atender entra no B-66). A troca é condicional: pedir o estado que já
está devolve o atual, sem evento nem auditoria. Quando muda, emite `user.availability` e registra
`user.availability_changed` na auditoria (`after.reason`: `self`, `logout` ou `deactivated`). O
login não muda o estado; fechar a aba ou cair a conexão também não.

### `POST /users/me/avatar` (B3-2) — multipart, campo `file`
Só aceita `image/*`, limite 5MB (menor que os 16MB de `messages/media` —
é uma foto de perfil). Sobe pro MinIO via `StorageService` (mesmo padrão de
`messages/media`) e atualiza `avatarUrl`. Retorna `201` com o `USER_SELECT`
atualizado (`avatarUrl` sai já presignado — mesma regra de expiração do B-38
descrita em `attachments[].url` de `GET .../messages`; o valor persistido em
`User.avatarUrl` no banco é a URL interna, nunca exposta como tal).

---

## Departments (grupos/setores) — `/departments`

### `GET /departments` → **array puro**
Item: `{ id, name, description, color, isActive, createdAt, _count: { users, conversations } }`
(`_count.conversations` conta apenas `WAITING`/`OPEN`.)

### `GET /departments/:id`
+ `users[]` (`{ id, name, email, role, avatarUrl, isActive }`), `queues[]` (`{ id, name, strategy, isActive }`).

### `POST /departments` — `{ name (único na empresa), description?, color? }`
### `PATCH /departments/:id` · `DELETE /departments/:id`
Só `ADMIN`. **B-116 (decisão do responsável em 2026-10-21):** os setores são criados conforme a
necessidade, até **20 ativos por empresa** — criar o 21º, ou reativar (`isActive: true`) com 20
ativos, responde `400` `"Limite de 20 setores ativos atingido. Desative ou exclua um setor para
abrir outro"`. Desativar libera a vaga. A contagem roda sob uma trava na linha da empresa: pedidos
simultâneos não passam do limite. `DELETE` continua recusando setor com conversas (`400`).
### `POST /departments/:id/users` — `{ userId }` → retorna o department com `users[]` atualizado
### `DELETE /departments/:id/users/:userId` — idem
É o mesmo vínculo do `departmentIds` de `/users`. Desde o B-113, as duas rotas conferem se o usuário
é da empresa (`404` se não for) e derrubam os sockets dele, que reconectam com as salas novas.

---

## Queues (filas de distribuição) — `/queues`

### `GET /queues` → **array puro**
Item: `{ id, name, strategy, maxWaitSecs, maxServiceSecs, greetingMsg, departmentId, isActive, createdAt, updatedAt, department: {id,name,color} | null, _count: { conversations } }`

### `GET /queues/:id` — mesmo shape do item da lista

### `POST /queues` — `{ name (único na empresa), strategy? (só MANUAL — B-66), maxWaitSecs? (segundos, default 300), maxServiceSecs? (segundos ou null — B-114), greetingMsg?, departmentId? }`
B-114 (ADR-0019, regra 19): `maxServiceSecs` é o prazo do SLA do atendimento do setor (do
Atender ao Encerrar, contado no expediente); ausente ou `null` = setor sem SLA do atendimento.
No `PATCH`, mandar `null` tira o prazo. Mudar o prazo não recalcula o de quem já está em
atendimento.
B-66 (ADR-0019, M-21): a fila é compartilhada — `ROUND_ROBIN` e `LEAST_BUSY`, que eram gravadas e
nunca aplicadas, respondem `400`. Sem `strategy`, vale `MANUAL`; as filas existentes foram migradas.
`departmentId`, se informado, precisa pertencer à mesma empresa (404 se não pertencer).

### `PATCH /queues/:id` — campos parciais (incl. `isActive`) · `DELETE /queues/:id`
`DELETE` falha com 400 se a fila tiver conversas associadas.

**Vínculo automático (B1-2):** ao chegar uma mensagem nova de um contato sem
conversa aberta, se a `WhatsAppConnection` tiver `departmentId` e existir uma
`Queue` ativa para esse departamento, a conversa nasce com `departmentId` e
`queueId` já preenchidos (usada pela Fase B2 para o SLA). Sem fila ativa no
departamento, a conversa nasce como hoje (`departmentId`/`queueId` nulos).

---

## Auto-atendimento — `/auto-attendance` (B-35)

Config única por empresa (1:1) — todas as rotas requerem `ADMIN+` pra escrita,
autenticado (qualquer role) pra leitura. Estado de "onde o contato está no
menu agora" é efêmero (Redis, TTL 24h), não fica no banco.

### `GET /auto-attendance`
Devolve a config da empresa. Se a empresa nunca configurou nada, devolve um
registro "vazio" desativado (`id: null, isActive: false, ...`) em vez de 404
— a tela de Configurações sempre tem algo pra mostrar/editar.

Shape: `{ id, isActive, greetingMessage, businessHours, outOfHoursMessage, inactivityTimeoutSecs, inactivityMessage, closingMessage, createdAt, updatedAt, menuOptions: [...] }`

`businessHours` é um objeto livre por dia da semana (chaves `mon`..`sun`,
inglês, 3 letras): `{ mon: [{start:"09:00",end:"18:00"}], ... }`. Dia ausente
da chave = fechado o dia inteiro. `null`/ausente = sem restrição de horário
(roda o dia inteiro).

**Relógio dos SLAs (B-112, ADR-0019 regra 17):** com o auto-atendimento ativo, o mesmo horário
é o relógio do SLA da espera, no fuso da empresa. Fora dele o prazo não corre: a conversa que
chega com o expediente fechado tem o prazo contado a partir da abertura, e a espera que
atravessa o fechamento continua na abertura seguinte. Auto-atendimento desligado ou sem horário:
o relógio anda o dia todo. Expediente sem nenhum dia aberto (`{}`): sem prazo. Mudar o horário não
recalcula o prazo de quem já está esperando.

### `PATCH /auto-attendance` — requer `ADMIN`
Body: todos os campos opcionais — `{ isActive?, greetingMessage?, businessHours?, outOfHoursMessage?, inactivityTimeoutSecs? (≥30), inactivityMessage?, closingMessage? }`.
Faz upsert (cria o registro na 1ª chamada). Mandar `businessHours: null`
explicitamente limpa a restrição de horário.

### `GET /auto-attendance/options` · `POST /auto-attendance/options` — requer `ADMIN` pra escrita
Item: `{ id, order, label, action (ROUTE_TO_DEPARTMENT|ROUTE_TO_QUEUE|END_CONVERSATION), departmentId, queueId, department: {id,name}|null, queue: {id,name}|null }`.
`POST` body: `{ order, label (≤120), action, departmentId? (obrigatório se ROUTE_TO_DEPARTMENT), queueId? (obrigatório se ROUTE_TO_QUEUE) }` — `departmentId`/`queueId` precisam pertencer à mesma empresa.

### `PATCH /auto-attendance/options/:id` · `DELETE /auto-attendance/options/:id` — requer `ADMIN`
Mesmos campos do `POST`, todos opcionais. `DELETE` devolve `{ success: true }`.

### `PATCH /auto-attendance/options/reorder` — requer `ADMIN`
Body: `{ orderedIds: string[] }` — precisa conter exatamente o conjunto de
ids já existentes no flow (400 se faltar/sobrar algum). Reatribui `order`
sequencial (1, 2, 3...) na ordem da lista.

**Execução (webhook da Evolution):** numa conversa nova, se `isActive` e
dentro do horário configurado, envia a saudação (`Queue.greetingMsg` da fila
resolvida tem prioridade sobre `greetingMessage` da empresa) e, se houver
opções de menu, o menu numerado — o contato responde com o número ou o texto
exato de uma opção. `ROUTE_TO_DEPARTMENT`/`ROUTE_TO_QUEUE` reposicionam
`departmentId`/`queueId` da conversa (sem atribuir agente); `END_CONVERSATION`
encerra como `resolution: UNRESOLVED`. Sem resposta dentro de
`inactivityTimeoutSecs`, envia `inactivityMessage` + `closingMessage` e
encerra automaticamente do mesmo jeito. Fora do horário configurado, envia só
`outOfHoursMessage` (sem saudação/menu).

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

**Pontos de criação (B1-3):** conversa atribuída a um agente (`type: "conversation_assigned"`) e SLA violado, disparado para todo `SUPERVISOR+` ativo da empresa já que a conversa está sem agente nesse momento (`type: "sla_breach"`). B-114: SLA do atendimento violado, para quem atende e para todo `SUPERVISOR+` ativo, uma vez por pessoa (`type: "service_sla_breach"`).

---

## Audit Logs — `/audit-logs`

### `GET /audit-logs` — Query: `entity?` · `entityId?` · `userId?` · `page` · `limit` · requer `ADMIN+`
Item: `{ id, companyId, userId, action, entity, entityId, before, after, ip, userAgent, createdAt, user: {id,name,email} | null }`
Wrapper: `{ data, meta }`. Ordenação: `createdAt desc`.

**Ações registradas na v1 (B1-4)**, decisão consciente de escopo mínimo — sem interceptor global, cada service chama `AuditLogService.record()` explicitamente para a ação que já considera sensível:
- `user.created` (com `departmentIds` desde o B-113), `user.role_changed` (não loga edição de nome/telefone/avatar), `user.deactivated`
- `user.availability_changed` (B-65 — `after.reason`: `self`, `logout` ou `deactivated`)
- `contact.deleted`
- `conversation.assigned` (loga a mudança real de `agentId` numa transferência, incluindo a devolução à fila)
- `conversation.attended` (B-66 — a conversa saiu da fila com alguém: `after` com `agentId`, `waitSeconds`, `maxWaitSecs` e `breached`)
- `conversation.service_closed` (B-114 — o atendimento terminou ao encerrar ou resolver: `after` com `agentId`, `serviceSeconds`, `maxServiceSecs` e `breached`)
- `sla.breached` (já existia antes da B1-4, migrado para usar `AuditLogService`)
- `sla.service_breached` (B-114 — o atendimento passou do prazo do setor: `after` com `serviceTimeSeconds`, `maxServiceSecs`, `agentId` e a fila)

---

## WhatsApp — `/whatsapp`

### `GET /whatsapp` → **array puro**
Item: `{ id, name, phone, profileName, profilePicture, status, platform, isActive, lastSeenAt, createdAt, department: {id,name,color} | null, _count: { conversations } }`

### `GET /whatsapp/:id` — + `sessionName`, `battery`, `updatedAt`
### `POST /whatsapp` — `{ name (≤60), departmentId? }` → cria a instância na Evolution (sem webhook próprio: os eventos chegam pelo webhook global da Evolution, B-82). `400` passado o limite de conexões do plano (`maxChannels`). `departmentId` de outra empresa responde `400` (B-100), também no `PATCH`
### `GET /whatsapp/:id/qrcode` → `{ qrCode: "data:image/png;base64,..." | "<base64>", code? }`
### `POST /whatsapp/:id/status` — requer `ADMIN` → sincroniza com a Evolution e retorna `{ status, ... }` (era `GET` até o B-100: grava no banco)
### `POST /whatsapp/:id/disconnect` · `PATCH /whatsapp/:id` · `DELETE /whatsapp/:id`

---

## Notes (anotações internas) — `/conversations/:conversationId/notes`
`GET` (array puro) · `POST { content }` · `PATCH :id` · `DELETE :id`.
Autor: `{ id, name, avatarUrl }`. Notas nunca vão para o WhatsApp.

## Company — `/company`
`GET /company/me` · `PATCH /company/me` — dados da empresa do usuário logado.
Campo `timezone` (B-61): fuso IANA da empresa, padrão `America/Sao_Paulo`;
`PATCH` (ADMIN) valida o fuso — inválido responde 400. Horário comercial do
auto-atendimento, "resolvidas hoje", Dashboard e relatórios usam este fuso.

## Health — `/health` (público, sem throttle)
`GET` (liveness — não toca dependência) → `{ "status": "ok", "timestamp": "...", "uptime": <segundos> }`

### `GET /health/ready` (B5-3/B6-3) — readiness, checa PostgreSQL e Redis de verdade
`200 { "status": "ok", "checks": { "database": "up", "redis": "up" }, "timestamp": "..." }`
quando os dois respondem; `503` com o mesmo shape (`status: "unavailable"`,
detalhando qual dependência caiu) caso contrário. Pensado pra orquestração/
nginx decidirem se a instância deve receber tráfego — o `GET /health` acima
não serve pra isso (não checa nada além do processo estar de pé).
B-107: a checagem do Redis tem prazo de 2 s — com o Redis aceitando a conexão sem responder, a rota
devolve o `503` com `redis: "down"` em vez de ficar pendurada. A do banco segue sem prazo próprio.

### `GET /health/dependencies` (B-102) — requer `ADMIN`
Diagnóstico, não decide tráfego (sempre `200`): `{ checks: { database, redis, storage, evolution }, timestamp }`,
cada um `{ status: "up" | "down", latencyMs, error? }`, com timeout de 2 s por checagem. Storage e Evolution
ficam fora do `/health/ready` de propósito: com eles fora do ar, mídia e WhatsApp degradam, mas a API
continua atendendo o painel.

## Webhooks — `/webhooks/evolution` (público com apikey)
`POST` consumido pela Evolution API (webhook **global** da Evolution — B-82). Autenticação
(B-88, conferido em `webhook.controller.ts`): a chave vem do header **`x-evolution-signature`**
ou, sem ele, do campo **`apikey` do corpo** (é como a Evolution v2 manda) — o header tem
prioridade. Comparação timing-safe com `EVOLUTION_API_KEY`: sem a env, **500 fail-closed**;
chave ausente ou errada, **403**. Body até **25mb** (mídia base64). Limite: **1.200
eventos/60s por instância** (campo `instance` do body; sem ele, por IP) — B-56. O nome do
evento é normalizado (`messages.upsert` → `MESSAGES_UPSERT`). Tratados: `QRCODE_UPDATED`,
`CONNECTION_UPDATE`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_DELETE`,
`CONTACTS_UPSERT`; os demais são ignorados. Responde `200 { received: true }` assim que o
evento entra na fila (shard do contato, B-79); o processamento é assíncrono, com retry e DLQ.

### `GET /webhooks/metrics` (B-39) — requer `ADMIN`
Texto no formato de exposição do Prometheus (`text/plain; version=0.0.4`): contadores de
jobs (processados, falhas por classificação, retries, movidos para a DLQ — em memória, por
réplica) e profundidade **ao vivo** das filas: `webhook_queue_depth{queue="webhook_waiting"}`,
`_active`, `_delayed`, `_failed` (soma dos shards, B-79) e `{queue="webhook-dlq"}`.

### DLQ do webhook — `/webhooks/dlq` (B-39) — requer `ADMIN`, só a própria empresa
Eventos que esgotaram as tentativas (ou falharam de forma permanente). Item de outra empresa
responde **404**, como se não existisse; item sem empresa identificada não aparece para ninguém.
- `GET /webhooks/dlq` → **array puro**, mais recentes primeiro:
  `{ id, event, instance, error, attempts, timestamp, requestId, conversationId, messageId, status, reason }`
- `POST /webhooks/dlq/:jobId/reprocess` → `200 { requeued: true, newJobId }` — devolve o
  evento à fila (shard do contato) com a mesma política de retry; reprocessar duas vezes é
  seguro (a gravação deduplica por `externalId`).
- `DELETE /webhooks/dlq/:jobId` → `200 { discarded: true }`

---

## Socket.IO — namespace `/ws`

- **URL:** `http://localhost:3001/ws` (config `VITE_WS_URL`)
- **Handshake:** `auth: { token: <accessToken JWT> }` — só por aí; token na query string ou no header
  `Authorization` não é aceito (B-93). Vale a mesma regra do HTTP (B-74):
  só access token, fora da blacklist, de usuário ativo e emitido depois do último
  encerramento de sessões. Recusa = `connect_error` com `data: { code: "UNAUTHORIZED" }` e
  mensagem `"Token não informado"`, `"Token inválido ou expirado"`, `"Tipo de token inválido"`,
  `"Token foi revogado"`, `"Usuário não encontrado ou inativo"` ou `"Sessão encerrada"`.
  Com o Redis sem responder, a checagem da blacklist desiste em 500 ms e deixa passar, como no
  HTTP (fail-open, B-107).
  Recusado no handshake, o Socket.IO não reconecta sozinho: o cliente renova o token
  (`POST /auth/refresh`) e chama `connect()` de novo.
- **Desconexão pelo servidor** (`disconnect` com motivo `"io server disconnect"`, B-74): quando
  o access token do handshake expira, no logout (só os sockets daquela sessão), na troca ou
  reset de senha (menos a sessão de quem trocou a própria senha), na desativação do usuário e
  na mudança de papel ou de setores (as salas dependem deles; setores desde o B-113). O cliente renova o token e reconecta; se a
  renovação for recusada, a sessão acabou.
- **Salas automáticas:** `company:<companyId>` e `agent:<userId>` no connect, mais as
  salas de escopo (B-40): `company:<companyId>:all` para ADMIN/SUPERVISOR; para AGENT,
  `company:<companyId>:dept:<departmentId>` de cada departamento seu e
  `company:<companyId>:dept:none` (conversas sem departamento). Mudar os setores de alguém
  (cadastro do usuário ou Grupos → Membros) derruba os sockets dele, que reconectam já com as
  salas novas (B-113); antes, valia só na próxima conexão.
  Mais `session:<jti>` (B-74), usada para derrubar só a sessão que fez logout.
- **Emissão:** eventos de conversa (`message.*`, `conversation.*`, `sla.breached`) saem
  para a **união** de `conversation:<id>` + `company:<companyId>:all` + a sala do
  departamento da conversa + `agent:<agentId>` atribuído — nunca mais para a empresa
  inteira. `connection.status` (não é de conversa) segue em `company:<companyId>`.
  `user.availability` (B-65) vai para `company:<companyId>:all` (ADMIN/SUPERVISOR) e
  `agent:<userId>` (as outras abas do próprio usuário) — nunca para os colegas atendentes.

### Cliente → servidor
| Evento | Payload | Efeito |
|---|---|---|
| `join:conversation` | `{ conversationId }` | entra na sala (valida empresa **e** escopo, B-40) |
| `leave:conversation` | `{ conversationId }` | sai da sala |
| `ping` | — | responde `pong` |

### Servidor → cliente
| Evento | Payload |
|---|---|
| `connected` | confirmação pós-handshake |
| `message.new` | `{ conversationId, companyId, message: { id, senderType, content, type, status, sentAt, externalId } }` — **sem attachments** (download é assíncrono) |
| `message.updated` | `{ companyId, conversationId, messageId, attachment: { id, url, mimeType, fileName } }` — anexo pronto. Ou, sem `attachment`, `{ companyId, conversationId, messageId, mediaError }` quando o anexo recebido não pôde ser salvo (B-77): `"unsupported_type"` (tipo não aceito) ou `"download_failed"` (tentativas esgotadas). O mesmo motivo fica em `message.metadata.mediaError` na listagem. B-81: também `{ ..., content, isEdited: true }` quando o cliente edita a mensagem no WhatsApp, e `{ ..., reaction }` quando reage (`null` = reação removida; na listagem, `message.metadata.reaction.text`) |
| `message.status` | `{ conversationId, companyId, externalId, status }` |
| `conversation.created` | `{ companyId, conversation: { id, status, channel, contact: {id,name,phone,avatarUrl}, whatsappConnectionId, createdAt } }` |
| `conversation.updated` | `{ companyId, conversationId, changes: {...} }` |
| `conversation.assigned` | `{ companyId, conversationId, agentId, departmentId, agent, status, waitingSince, attendedAt, serviceSlaDueAt }` — ao atender (`/attend` ou `/next`) e ao transferir (`/assign`); com o `status` (B-66), a conversa sai (ou volta) da fila de todos na hora; `attendedAt` e `serviceSlaDueAt` são o ciclo do atendimento (B-114) |
| `connection.status` | `{ companyId, connectionId, sessionName, status, phone?, profileName? }` |
| `sla.breached` | `{ companyId, conversationId, contact, queue, waitTimeSeconds, maxWaitSecs, breachedAt }` — `waitTimeSeconds` é o tempo de relógio desde o início da espera; o limite `maxWaitSecs` conta só o expediente (B-112) |
| `sla.service_breached` | `{ companyId, conversationId, agentId, contact, queue, serviceTimeSeconds, maxServiceSecs, breachedAt }` — B-114: o atendimento passou do prazo do setor; mesmas salas do `sla.breached` (supervisores, o setor e quem atende) |
| `user.availability` | `{ companyId, userId, availability: "ONLINE" \| "OFFLINE", changedAt }` — B-65 |

---

## ⚠️ Divergências conhecidas do frontend/mock

Revisado em 2026-10-18 (B-88). Já resolvidas e removidas desta lista: o mock responde listas
como `{ data, meta }`, igual à API; as fixtures de conversa seguem o shape do contrato e o
front converte com `toUiMessage`/`toUiConversation`; `apiClient.register()` não existe mais
(o cadastro é `registerCompany`, B-9).

1. `GET /whatsapp` e `GET /departments` retornam **array puro**, não `{ data, meta }` — o helper
   `unwrap()` do SettingsPanel tolera os dois formatos.
2. **Sem Swagger:** este contrato é mantido à mão e não há conferência automática contra o
   código (B-45, pendente).
