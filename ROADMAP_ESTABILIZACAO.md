# 🗺️ Roadmap de Correção e Estabilização — AtendeHub

> **📌 DOCUMENTO VIVO** — Este é o documento canônico de status do projeto.
> Ele é atualizado em tempo real conforme o trabalho avança. Toda sessão de
> trabalho (humana ou com Claude) deve atualizar os status dos itens, o painel
> de progresso e registrar uma entrada no [Changelog](#-changelog).
>
> **Última atualização:** 2026-07-16 · Fase 0 e Fase 2 CONCLUÍDAS (round-trip real validado + modo demo explícito/resiliência)
> **Próxima ação:** Fase 1 restante (contrato de dados: F1-1, F1-2, F1-3, F1-4, F1-6) · Depois: Fase 3 (SLA) e Fase 4 (testes backend). Obs.: sessão WhatsApp deslogada em 2026-07-16 02:06 — re-parear via QR antes do próximo teste real

---

## 📊 Painel de status

| Fase | Objetivo | Prioridade | Progresso | Status |
|---|---|---|---|---|
| [Fase 0](#-fase-0--religar-frontend--backend) | Religar frontend ↔ backend | 🔴 P0 | 11/11 | ✅ Concluída |
| [Fase 1](#-fase-1--contrato-de-dados-único) | Contrato de dados único | 🔴 P1 | 5/10 | 🔄 Em andamento |
| [Fase 2](#-fase-2--modo-demo-explícito-e-resiliência) | Modo demo explícito e resiliência | 🟠 P1 | 8/8 | ✅ Concluída |
| [Fase 3](#-fase-3--ativar-o-módulo-de-sla) | Ativar o módulo de SLA | 🟠 P1 | 0/5 | ⬜ Não iniciada |
| [Fase 4](#-fase-4--testes-no-backend) | Testes no backend | 🟠 P1→P2 | 0/6 | ⬜ Não iniciada |
| [Fase 5](#-fase-5--higiene-do-repositório-e-documentação) | Higiene do repo e documentação | 🟡 P2 | 0/5 | ⬜ Não iniciada |
| [Fase 6](#-fase-6--hardening-de-segurança-pré-produção) | Hardening de segurança | 🟡 P2 | 0/5 | ⬜ Não iniciada |
| [Fase 7](#-fase-7--pronto-para-produção) | Pronto para produção | 🟢 P3 | 0/5 | ⬜ Não iniciada |
| [Fase 8](#-fase-8--administração--configurações) | Administração & Configurações | 🟠 P1 | 9/11 | 🔄 Em andamento |
| **Total** | | | **33/66** | |

**Legenda de status:** ⬜ Pendente · 🔄 Em andamento · 🔍 Em validação · ✅ Concluído · ⛔ Bloqueado · 🚫 Cancelado

**Dependências entre fases:** Fase 0 destrava as Fases 1, 2 e 3. As Fases 4 e 5 podem rodar em paralelo a qualquer momento. A Fase 6 é pré-requisito de produção; a Fase 7 fecha o ciclo.

---

## 📖 Regras do documento vivo

1. **Ao iniciar um item:** mudar status para 🔄 e anotar a data de início na coluna Status.
2. **Ao concluir um item:** só marcar ✅ depois de verificar o **critério de aceite** — a evidência (comando executado, teste, screenshot) vai no Changelog.
3. **Ao final de cada sessão de trabalho:** atualizar o painel (contadores e "Próxima ação") e adicionar entrada no Changelog com data, itens tocados e evidências.
4. **Problema novo descoberto:** vira item com ID na fase adequada (ou no [Backlog](#-backlog)) **antes** de ser corrigido — nada de correção sem registro.
5. **Decisão de arquitetura/produto:** registrar na seção [Decisões](#-registro-de-decisões) com data e motivo.
6. **Nunca** remover itens — cancelados viram 🚫 com justificativa.

---

## 🔴 Fase 0 — Religar frontend ↔ backend

**Problema:** hoje a integração está quebrada em múltiplos pontos independentes — mesmo com a API no ar, o frontend opera 100% em mock sem avisar.
**Meta:** com `docker compose up` + API + frontend rodando, o fluxo completo usa dados reais: login → conversas → envio → recebimento em tempo real.

| ID | Item | Referências | Status |
|---|---|---|---|
| F0-1 | Criar endpoint público `GET /api/v1/health` no NestJS (novo `HealthModule`). Hoje `testConnection()` consulta essa rota, recebe 404 e rebaixa **todas** as chamadas para mock, mesmo com a API rodando. **Aceite:** `curl http://localhost:3001/api/v1/health` → 200 `{ status: "ok" }`; frontend loga backend disponível e para de usar mock. | `src/services/api.js:19-30` (consumidor) · `apps/api/src/modules/health/` (novo) | ✅ 2026-07-15 |
| F0-2 | Conectar o socket no namespace `/ws`. O gateway escuta em `/ws`, mas o cliente conecta na raiz. Ajustar a URL de conexão e `VITE_WS_URL` no `.env.example` para `http://localhost:3001/ws`. **Aceite:** log "cliente conectado" no gateway + `wsClient.isConnected === true` no navegador. | `apps/api/src/modules/events/events.gateway.ts:36` · `src/services/websocket.js:3,17` · `.env.example:7` | ✅ 2026-07-15 |
| F0-3 | Alinhar eventos servidor→cliente. O backend emite `message.new`, `message.status`, `conversation.created`, `conversation.updated`, `conversation.assigned`, `connection.status`, `sla.breached` (com ponto). O frontend escuta `message:created` e `conversation:updated` (dois-pontos, nomes diferentes) — nenhum evento é tratado. Padronizar no formato do backend. **Aceite:** mensagem recebida via webhook aparece na UI sem refresh. **Bônus:** emissões do backend unificadas em união de salas (fim do evento duplicado para sockets em 2 salas). | `apps/api/src/modules/events/events.service.ts` · `src/services/websocket.js` · `src/hooks/useConversations.js` | ✅ 2026-07-15 |
| F0-4 | Corrigir envio de mensagem (2 defeitos): **(a)** o cliente emite `send:message` via socket, mas o gateway não tem handler para isso (só `join:conversation`, `leave:conversation`, `ping`) — a mensagem some; remover o caminho socket e enviar sempre via REST. **(b)** o REST envia `{ text }`, mas `SendMessageDto` exige `{ type, content }` e o `ValidationPipe` com `forbidNonWhitelisted` rejeita `text` com 400. **Aceite:** mensagem enviada pelo front persiste no banco e entra na fila de envio sem erro. **Validado 2026-07-16:** round-trip real na madrugada — respostas enviadas pelo painel persistidas com status `DELIVERED` (entrega confirmada pelo WhatsApp). | `src/hooks/useConversations.js` · `src/services/api.js:193-200` · `apps/api/src/modules/message/dto/send-message.dto.ts:24-36` | ✅ 2026-07-16 |
| F0-5 | Entrar/sair das salas de conversa. `joinConversation()`/`leaveConversation()` existem no client mas **nunca são chamados** — sem entrar na sala `conversation:<id>`, eventos por conversa não chegam. Chamar ao selecionar/trocar conversa ativa. **Aceite:** eventos da conversa ativa chegam ao cliente (verificável via log do gateway). | `src/services/websocket.js` · `src/hooks/useConversations.js` · `apps/api/src/modules/events/events.gateway.ts:162,196` | ✅ 2026-07-15 |
| F0-6 | Validação E2E do fluxo real: `docker compose up` → seed → login → conversas reais na fila → enviar mensagem → receber evento em tempo real. Registrar evidências no Changelog. **Aceite:** fluxo completo sem fallback para mock. **Concluído 2026-07-16:** fluxo completo validado com WhatsApp real — mensagens de cliente recebidas em tempo real + respostas do painel entregues no celular (`AGENT`/`DELIVERED` no banco, 01:44–02:05). Obs. histórica: a senha do admin do seed era aleatória; realinhada para `Admin@123` em F2-7. | `README.md` (passos) | ✅ 2026-07-16 |
| F0-7 | **[Descoberto na execução]** `npm run db:seed` estava quebrado por 2 defeitos: (a) ts-node não carrega `.env` → `Environment variable not found: DATABASE_URL`; (b) `setTimeout` de 1h (auto-delete do arquivo de credenciais) prendia o processo — o comando nunca terminava. Corrigido: `-r dotenv/config` no script + remoção do auto-delete (o arquivo já é gitignored). | `apps/api/package.json` (`db:seed`) · `apps/api/prisma/seed.ts:130-133` | ✅ 2026-07-15 |
| F0-8 | **[Descoberto na execução]** `npm run start` quebrado: o build incluía `prisma/**` e gerava `dist/src/main.js` em vez de `dist/main.js` (`Cannot find module dist/main`). Criado `tsconfig.build.json` compilando apenas `src/` (convenção NestJS). | `apps/api/tsconfig.build.json` (novo) · `apps/api/tsconfig.json:24` | ✅ 2026-07-15 |
| F0-9 | **[Descoberto no smoke test]** Evolution API em **crash-loop desde sempre** neste ambiente: o compose apontava `DATABASE_CONNECTION_URI` para o MESMO banco `atendehub` da API — ambos usam Prisma e colidem na `_prisma_migrations` (`relation "_prisma_migrations" already exists`). Havia ainda um container órfão de um projeto compose antigo reiniciando em loop e bloqueando o nome `atendehub_evolution`. Corrigido: banco dedicado `evolution` criado, compose e `init.sql` atualizados, container órfão removido. | `docker-compose.yml` · `infra/postgres/init.sql` | ✅ 2026-07-15 |
| F0-10 | **[Descoberto no round-trip real]** Webhooks de mensagem rejeitados com **413 Payload Too Large**: a Evolution envia mídia embutida em base64 (`webhookBase64: true`) e o corpo estourava o limite padrão de ~100kb do Express — mensagens reais chegavam na Evolution e se perdiam na API. Corrigido: body parser manual com limite de 25mb **apenas** na rota `/api/v1/webhooks` (1mb no resto da API). | `apps/api/src/main.ts` | ✅ 2026-07-15 |
| F0-11 | **[Descoberto no round-trip real]** Nomes de contato corrompidos por 2 defeitos no processamento do webhook: (a) JID com sufixo de dispositivo (`5512...:12@s.whatsapp.net`) não era normalizado → o mesmo número virava contatos duplicados; (b) em mensagens `fromMe`, o `pushName` é o **dono da conexão** — e o upsert renomeava o contato para o nome do dono a cada resposta enviada pelo celular. Corrigido: `split(':')[0]` na extração do número (tb. no handler de CONTACTS_UPSERT) e `pushName` ignorado quando `fromMe`; `upsertFromWebhook` aceita nome opcional com fallback para o telefone na criação. Dados de teste duplicados removidos do banco. | `apps/api/src/modules/webhook/webhook.service.ts` · `apps/api/src/modules/contact/contact.service.ts` | ✅ 2026-07-15 |

---

## 🔴 Fase 1 — Contrato de dados único

**Problema:** o mock usa um shape (`type: 'agent'`, `text`, `time: 'HH:MM'`) diferente do modelo real da API (`senderType`, `content`, `createdAt`). Quando a Fase 0 religar os dados reais, os componentes tendem a quebrar.
**Meta:** um único contrato (o da API) usado por componentes, mock e testes.

| ID | Item | Referências | Status |
|---|---|---|---|
| F1-1 | Documentar o contrato real de resposta da API (auth, conversations, messages, contacts) a partir dos DTOs/services do backend — incluir paginação (`response.data`?) e nomes de campos. Salvar em `docs/API_CONTRACT.md`. | `apps/api/src/modules/*/dto/` · `apps/api/prisma/schema.prisma` | ⬜ |
| F1-2 | Adaptar os componentes ao shape real (ou criar camada normalizadora única no service). Componentes afetados: ChatPanel, ConversationQueue, CustomerPanel, Metrics. **Aceite:** UI renderiza dados reais do seed sem erro no console. **Parcial 2026-07-15:** normalizadores `toUiConversation`/`toUiMessage` no hook + carregamento de mensagens sob demanda (`getMessages`) — sem isso o dashboard quebrava com dados reais (`conv.contact.toLowerCase` em objeto). Falta: Metrics com dados reais, evento `conversation.created`, revisão completa dos componentes. | `src/hooks/useConversations.js` · `src/services/api.js` · `src/components/*.jsx` | 🔄 2026-07-15 |
| F1-3 | Reescrever `mockConversations.js` no shape exato da API — o mock vira espelho fiel do contrato (inclusive enums `ConversationStatus`, `SenderType`, `MessageType`). | `src/data/mockConversations.js` | ⬜ |
| F1-4 | `apiClient.register()` chama `POST /auth/register`, rota que **não existe** no backend (só `login`, `refresh`, `logout`, `revoke`, `me`). Decidir: remover do front ou implementar no back. Registrar em Decisões. | `src/services/api.js:143-148` · `apps/api/src/modules/auth/auth.controller.ts:32-77` | ⬜ |
| F1-5 | Corrigir tratamento de erro do `ApiClient`: o `request()` lança objeto literal (`throw { status, message, error }`); no catch, `error.message` pode ser `undefined` e `error.message.includes(...)` explode com TypeError, mascarando o erro original. Usar classes de erro ou checagem defensiva. **Feito junto com F2-1/F2-3:** classe `ApiError extends Error` (sempre com `.status` e `.message`); falha de rede detectada por `error instanceof TypeError` (contrato do fetch) em vez de inspecionar `message`. | `src/services/api.js` | ✅ 2026-07-16 |
| F1-6 | Atualizar os testes do frontend (66 hoje) para o novo contrato + adicionar teste do adapter/normalizador. **Aceite:** `npm test` verde. | `src/**/*.test.js` · `jest.config.js` | ⬜ |
| F1-8 | **[Reportado pelo usuário 2026-07-16]** Mensagens enviadas pelo painel **duplicadas na tela** (não no banco): corrida entre o eco via socket (`message.new`, emitido antes da resposta HTTP) e a reconciliação da mensagem otimista — o eco não casava com o id otimista e era adicionado; depois a resposta REST substituía a otimista pela mesma mensagem. Corrigido: se o eco já chegou, a otimista é apenas removida. | `src/hooks/useConversations.js` | ✅ 2026-07-16 |
| F1-9 | **[Reportado pelo usuário 2026-07-16]** Figurinhas/fotos não apareciam — 3 causas: (a) a "estratégia 1" de download baixava a URL direta do WhatsApp, que é **criptografada** (`.enc`) → bytes ilegíveis no MinIO (verificado por magic bytes); invertida a ordem — Evolution `getBase64FromMediaMessage` (decriptada) primeiro; (b) bucket MinIO sem política de leitura → navegador levava **403**; política pública de leitura aplicada no boot (produção: URLs pré-assinadas, ver F6); (c) frontend ignorava `type`/`attachments` → balão vazio; ChatPanel agora renderiza imagem/figurinha inline, áudio/vídeo com player, documento como link e placeholder ("Figurinha", "Foto"…) para mídia ainda não baixada. Anexos corrompidos antigos removidos. **Complemento (mesmo dia):** novo evento `message.updated` emitido quando o download do anexo termina — a UI troca o placeholder pela mídia real em tempo real, sem F5 (validado: figurinha nova baixada decriptada `image/webp`, URL 200). | `apps/api/src/modules/webhook/webhook.service.ts` · `apps/api/src/modules/events/events.service.ts` · `apps/api/src/shared/storage/storage.service.ts` · `src/components/ChatPanel.jsx` · `src/hooks/useConversations.js` · `src/services/websocket.js` | ✅ 2026-07-16 |
| F1-10 | **[Reportado pelo usuário 2026-07-16]** Fotos dos contatos não apareciam: o backend nunca buscava a foto de perfil (o handler de `CONTACTS_UPSERT` até salvava `profilePictureUrl`, mas o evento raramente traz isso) e o frontend só renderizava iniciais. Corrigido: novo `fetchProfilePictureUrl` no `EvolutionService` + busca fire-and-forget no processamento de mensagem quando o contato não tem avatar (throttle de 6h por contato); frontend renderiza `avatarUrl` com fallback para iniciais na fila, no cabeçalho do chat e no painel do cliente. Backfill executado: 5/6 contatos existentes com foto. | `apps/api/src/modules/whatsapp/evolution.service.ts` · `apps/api/src/modules/webhook/webhook.service.ts` · `src/components/*.jsx` | ✅ 2026-07-16 |
| F1-7 | **[Descoberto no round-trip real]** `.chat-panel` não tinha NENHUMA regra CSS: o painel crescia junto com a conversa e empurrava o composer para fora da área visível (o `flex:1`/`overflow-y:auto` do `.chat-messages` era inerte sem pai flex). Invisível com mock (poucas mensagens); quebrou com conversa real crescendo. Corrigido: `.chat-panel` como coluna flex com `min-height:0` + `overflow:hidden` — lista rola internamente, composer fixo embaixo. | `src/styles.css` | ✅ 2026-07-15 |

---

## 🟠 Fase 2 — Modo demo explícito e resiliência

**Problema:** o fallback para mock é silencioso e vale também em produção — se a API cair, o atendente veria conversas falsas sem aviso.
**Meta:** mock só em desenvolvimento, sempre sinalizado; conexões resilientes.

| ID | Item | Referências | Status |
|---|---|---|---|
| F2-1 | Restringir fallback mock a desenvolvimento (`import.meta.env.MODE === 'development'`). Em produção: erro visível + retry, nunca dados fictícios. **Feito:** `fallbackToMock()` só roteia para o mock quando `IS_DEV`; em produção lança `ApiError` 503 ("Servidor indisponível... reconectando") e agenda revalidação de health com backoff. | `src/services/api.js` | ✅ 2026-07-16 |
| F2-2 | Banner persistente "🧪 Modo demonstração — dados fictícios" quando o mock estiver ativo. **Aceite:** banner visível em modo mock; ausente com backend real. **Feito:** novo `DemoBanner` (via `useSyncExternalStore` sobre `apiClient.onModeChange`), renderizado acima do login E do dashboard; some sozinho quando o backend volta. 3 testes cobrindo aparecer/sumir em tempo real. | `src/components/DemoBanner.jsx` (novo) · `src/main.js` · `src/styles.css` | ✅ 2026-07-16 |
| F2-3 | Eliminar a race do `testConnection()`: é async no construtor e `backendAvailable` começa `true` — as primeiras requests podem tomar a decisão errada nos dois sentidos. Aguardar o teste antes da 1ª request e revalidar com backoff (backend que voltou ao ar deve ser redetectado). **Feito:** `backendAvailable` começa `null` e `request()` aguarda `this.ready` (promise do 1º health check); health com timeout real de 3s via `AbortController` (o `timeout: 3000` antigo era no-op no fetch); backend fora do ar → recheck com backoff 5s→30s e redetecção automática (notifica o banner). | `src/services/api.js` | ✅ 2026-07-16 |
| F2-4 | Reconexão do socket após refresh de token: a conexão usa o token do momento do connect; quando o accessToken renova, reconectar com o novo token e tratar `connect_error` por expiração. **Feito:** `auth` virou função do socket.io — avaliada a CADA tentativa de (re)conexão, sempre lê o `accessToken` atual do localStorage; `connect_error` com mensagem de token ("Token inválido ou expirado" do gateway) dispara `apiClient.refreshToken()` e reconecta com o token novo (guard `refreshingToken` contra loop). | `src/services/websocket.js` | ✅ 2026-07-16 |
| F2-5 | `user:typing`: o cliente emite, mas o gateway não tem handler (no-op); o cliente também escuta `user:typing` que o servidor nunca emite. Decidir: implementar ponta a ponta ou remover do front. Registrar em Decisões. **Decisão: removido do front** (`setTyping` não tinha nenhum consumidor nos componentes). | `src/services/websocket.js` | ✅ 2026-07-16 |
| F2-6 | **[Descoberto no smoke test]** Falha de envio era **silenciosa** na UI: a mensagem otimista sumia sem aviso (o usuário tentou 3× sem feedback). Adicionado `sendError` no hook + aviso visível acima do composer (`role="alert"`), limpo ao trocar de conversa ou reenviar. Bônus: `join:conversation` agora só ocorre após conversas reais carregarem (`loadedFromApi`) — fim dos WARNs de `conv-1` a cada page load. | `src/hooks/useConversations.js` · `src/components/ChatPanel.jsx` · `src/main.js` · `src/styles.css` | ✅ 2026-07-15 |
| F2-7 | **[Pedido do usuário]** Login: mensagem única e genérica **"Usuário ou senha incorreta."** no backend real (LocalStrategy) e no mock (que diferenciava "Email não encontrado"/"Senha incorreta" — vazava existência de conta). Senha do `admin@demo.com` redefinida para a documentada no README (`Admin@123`), alinhando real = mock = documentação. Causa raiz do incidente: a API caiu e o front rebaixou o login para o mock **silenciosamente** — reforça a prioridade de F2-1/F2-2. | `apps/api/src/modules/auth/strategies/local.strategy.ts` · `src/services/apiMock.js` · `src/services/api.test.js` | ✅ 2026-07-15 |
| F2-8 | **[Descoberto pelo usuário na tela de Configurações]** Com o backend offline, todas as seções de Configurações quebravam com "⚠️ Endpoint não implementado no mock": o `requestMock` só roteava auth e conversas — `/users`, `/departments` e `/whatsapp` caíam no throw 404. Corrigido: mock ganhou estado em memória e implementações completas de users (CRUD), departments (CRUD + membros) e whatsapp (criar, QR de demonstração em SVG, status que simula pareamento após ~3 polls, desconectar, excluir); `requestMock` reescrito com roteamento por segmentos de path + método HTTP (incl. POST de mensagens → `sendMessage`, antes retornava a lista de conversas). | `src/services/apiMock.js` · `src/services/api.js:105-165` | ✅ 2026-07-15 |

---

## 🟠 Fase 3 — Ativar o módulo de SLA

**Problema:** o `SlaCheckProcessor` está bem escrito, mas é **código morto**: não está registrado em nenhum módulo NestJS e nada no código enfileira jobs na fila `sla-check`. (O `SLA_FIXES.md` corrigiu apenas a compilação, não a execução.)
**Meta:** violação de SLA detectada e alertada de ponta a ponta.

| ID | Item | Referências | Status |
|---|---|---|---|
| F3-1 | Criar `SlaModule`: registrar `SlaCheckProcessor` como provider + `BullModule.registerQueue({ name: QUEUE_NAMES.SLA_CHECK })` + importar `EventsModule`; adicionar ao `AppModule`. **Aceite:** log do Nest mostra o processor registrado no boot. | `apps/api/src/modules/sla/sla-check.processor.ts:29-30` · `apps/api/src/app.module.ts` · `apps/api/src/shared/queues/queue-names.ts:9` | ⬜ |
| F3-2 | Produtor de jobs: quando uma conversa entra em `WAITING` numa `Queue` com `maxWaitSecs`, enfileirar `SlaCheckJobData` com `delay = maxWaitSecs * 1000`. Pontos prováveis: criação de conversa no webhook e mudança de status no `conversation.service`. | `apps/api/src/modules/webhook/webhook.processor.ts` · `apps/api/src/modules/conversation/conversation.service.ts` | ⬜ |
| F3-3 | Idempotência e cancelamento: `jobId` determinístico por conversa (evitar jobs duplicados); confirmar que atribuição antes do prazo não gera alerta (o processor reconsulta o status — validar em teste). | `apps/api/src/modules/sla/sla-check.processor.ts:46-60` | ⬜ |
| F3-4 | Frontend: ouvir `sla.breached` e destacar visualmente a conversa na fila (badge/cor). Depende de F0-2/F0-3. | `src/hooks/useConversations.js` · `src/components/ConversationQueue.jsx` | ⬜ |
| F3-5 | Teste E2E com SLA curto (ex.: fila com `maxWaitSecs = 10`): conversa não atribuída em 10s dispara `sla.breached`, marca `slaBreachedAt` e registra auditoria. Evidência no Changelog. | seed/fila de teste | ⬜ |

---

## 🟠 Fase 4 — Testes no backend

**Problema:** o backend (auth multi-tenant, webhooks, filas — as partes de maior risco) tem **zero testes**; o frontend mock tem 66. A pirâmide está invertida.
**Meta:** módulos críticos cobertos por testes que rodam com `npm test` em `apps/api`.

| ID | Item | Referências | Status |
|---|---|---|---|
| F4-1 | Primeiro spec rodando (smoke de bootstrap do Jest + ts-jest já configurados). **Aceite:** `cd apps/api && npm test` executa e passa. | `apps/api/jest.config.js` · `apps/api/test/` (vazio hoje) | ⬜ |
| F4-2 | Auth: `auth.service` (login, refresh, logout, senha errada, usuário inativo), `roles.guard`, `token-blacklist.service`. | `apps/api/src/modules/auth/` | ⬜ |
| F4-3 | Isolamento multi-tenant: testes de regressão garantindo que conversation/contact/user **sempre** filtram por `companyId` (vazamento entre tenants é o pior bug possível num SaaS). | `apps/api/src/modules/conversation/conversation.service.ts` · `contact.service.ts` · `user.service.ts` | ⬜ |
| F4-4 | Webhook: sem `EVOLUTION_API_KEY` → 500 fail-closed; apikey inválida → 403; normalização `messages.upsert` → `MESSAGES_UPSERT`; job enfileirado com payload correto. | `apps/api/src/modules/webhook/webhook.controller.ts` | ⬜ |
| F4-5 | Envio de mensagem: `send-message.service` + `message-send.processor` (retry/backoff, transições de `MessageStatus`, falha da Evolution API). | `apps/api/src/modules/message/` | ⬜ |
| F4-6 | Meta de cobertura ≥ 70% nos módulos auth, webhook e conversation (`npm run test:cov`). Ajustar meta em Decisões se necessário. | `apps/api/jest.config.js` | ⬜ |

---

## 🟡 Fase 5 — Higiene do repositório e documentação

**Problema:** ~20 relatórios de status na raiz (alguns afirmando mais do que o código entrega — ex.: SLA "pronto para deploy"); README descreve stack que não existe (`Next.js em apps/web`).
**Meta:** raiz limpa, documentação que reflete a realidade.

| ID | Item | Referências | Status |
|---|---|---|---|
| F5-1 | Criar `docs/archive/` e mover os relatórios da raiz (`ALL_FIXES_COMPLETE.txt`, `CORRECTIONS_*`, `SECURITY_*`, `FRONTEND_*`, `PROJECT_*`, `GIT_*`, `SLA_FIXES.md`, `START_HERE.txt`, `TESTE_*.md`, `CODE_QUALITY_CHECKLIST.md`, `COMO_TESTAR_AGORA.md`, `DELIVERABLES.md`); `LOGO_GUIDELINES.md` → `docs/`. Na raiz ficam: `README.md` + este roadmap. | raiz do repo | ⬜ |
| F5-2 | Reescrever o `README.md` com a stack real (frontend Vite + React 19 JS na raiz; sem `apps/web`), passos de execução **validados** e roteiro de fases atualizado. | `README.md:9-44` | ⬜ |
| F5-3 | Decisão de arquitetura do frontend: permanecer com Vite + React (recomendado para estabilizar agora) ou migrar para Next.js/TS como o README prometia. Registrar em Decisões e alinhar o README. | — | ⬜ |
| F5-4 | Renomear pacote raiz `multi-atendimento` → `@atendehub/web` e atualizar descrição (deixou de ser "protótipo"?). | `package.json:2-4` | ⬜ |
| F5-5 | Criar `CLAUDE.md` na raiz: comandos (dev/test/build front e back, docker, prisma), arquitetura resumida, convenções e apontador para este roadmap. | raiz do repo | ⬜ |

---

## 🟡 Fase 6 — Hardening de segurança (pré-produção)

**Contexto:** a base de segurança do backend é boa (helmet, throttler global, ValidationPipe com whitelist, webhook fail-closed com comparação timing-safe, validação de secrets no boot, token blacklist). Os itens abaixo fecham as lacunas restantes.

| ID | Item | Referências | Status |
|---|---|---|---|
| F6-1 | Estratégia de tokens: access/refresh em `localStorage` é vulnerável a XSS. Migrar para cookie `httpOnly` + proteção CSRF, **ou** registrar formalmente o trade-off aceito em Decisões (com mitigações: CSP, sanitização). | `src/services/api.js:32-45` | ⬜ |
| F6-2 | Rotação de segredos de produção: garantir que nenhum default do compose (postgres `atendehub_secret`, redis `redis_secret`, minio, `evolution_api_key_dev`) chegue a produção; checklist no `.env.example` + revisão do `docker-compose.prod.yml`. | `docker-compose.yml` · `docker-compose.prod.yml` · `apps/api/.env.example` | ⬜ |
| F6-3 | Health readiness: expandir F0-1 com checagem de dependências (PostgreSQL, Redis) num endpoint `/health/ready` separado do liveness leve — para orquestração/nginx. | backend (HealthModule) | ⬜ |
| F6-4 | Higiene de logs: remover `console.log` que expõe conteúdo de mensagens no navegador e revisar logs do backend para não vazar payloads/PII em produção. | `src/hooks/useConversations.js:48,64` · `src/services/*.js` · backend (winston) | ⬜ |
| F6-5 | Revisão final de CORS (`CORS_ORIGINS` de produção), rate limits (`THROTTLE_*`) e headers (helmet) com os domínios reais. | `apps/api/src/main.ts:31-36` · `apps/api/src/app.module.ts:23-32` | ⬜ |

---

## 🟢 Fase 7 — Pronto para produção

| ID | Item | Referências | Status |
|---|---|---|---|
| F7-1 | CI (GitHub Actions): lint + `tsc --noEmit` + testes front e back em cada push/PR. **Aceite:** pipeline verde no repositório `Cmdev2019/atendehub`. | `.github/workflows/` (novo) | ⬜ |
| F7-2 | Builds de produção validados: `vite build` + `nest build` sem warnings críticos; revisão do `docker-compose.prod.yml` + nginx servindo front e proxy da API/WS. | `docker-compose.prod.yml` · `infra/nginx/nginx.conf` | ⬜ |
| F7-3 | Observabilidade mínima: winston estruturado (JSON) com request-id, métricas básicas das filas Bull (jobs falhos/atrasados). | `apps/api/src/main.ts` · nest-winston | ⬜ |
| F7-4 | Runbook: passos de deploy, rollback, reset de filas e troubleshooting comum, em `docs/RUNBOOK.md`. | `docs/` | ⬜ |
| F7-5 | **[Descoberto em 2026-07-15]** O Redis Adapter do Socket.IO nunca é aplicado: em gateway com namespace (`/ws`), o `server` recebido em `afterInit` é o **Namespace**, não o `Server` — `server.adapter(...)` falha com `server.adapter is not a function` (visível no log de boot). Hoje o Socket.IO funciona apenas single-instance; o `TESTE_REDIS_ADAPTER.md` está incorreto. Corrigir aplicando o adapter no nível do `IoAdapter` (custom adapter em `main.ts`). | `apps/api/src/modules/events/events.gateway.ts:58-89` · `apps/api/src/main.ts` | ⬜ |

---

## 🟠 Fase 8 — Administração & Configurações

**Origem:** solicitação do usuário em 2026-07-15 — reorganizar o menu vertical e concentrar a administração dentro de Configurações.
**Escopo:** área de Configurações (⚙️) com: conexão WhatsApp via QR Code, tema claro/escuro, criação e gestão de usuários com níveis de acesso (usuário comum = AGENT, líder de setor = SUPERVISOR, administrador = ADMIN) e grupos/setores (departamentos do backend).

| ID | Item | Referências | Status |
|---|---|---|---|
| F8-1 | Remover do menu vertical o canal WhatsApp e o botão "🔗 Conectar" (era um botão morto) — a conexão agora vive em Configurações → Conexões WhatsApp. | `src/components/Sidebar.jsx` | ✅ 2026-07-15 |
| F8-2 | Mover o toggle claro/escuro da Topbar para Configurações → Aparência. | `src/components/Topbar.jsx` · `src/components/settings/SettingsPanel.jsx` | ✅ 2026-07-15 |
| F8-3 | Criar a área de Configurações: navegação por seções, troca de view no Dashboard (Sidebar/⚙️ da Topbar), título dinâmico e visibilidade de seções por nível de acesso (Aparência: todos · Usuários: SUPERVISOR+ · WhatsApp/Grupos: ADMIN). | `src/components/settings/SettingsPanel.jsx` (novo) · `src/main.js` · `src/styles.css` | ✅ 2026-07-15 |
| F8-4 | Conexões WhatsApp via QR Code: criar conexão (POST `/whatsapp`), gerar/renovar QR (GET `/whatsapp/:id/qrcode`), status ao vivo (evento `connection.status` + polling de `/status` a cada 4s enquanto o QR está na tela), desconectar e excluir. **VALIDADO com celular real em 2026-07-15:** o usuário criou a conexão "carlos teste" pela tela, escaneou o QR e o status ficou `CONNECTED` (confirmado também via sync com a Evolution). Obs.: o WhatsApp exibiu "não é possível conectar novos dispositivos" em tentativas iniciais (rate-limit temporário por múltiplas tentativas) — resolveu sozinho ao insistir; versão Baileys conferida como atual (2.3000.1035194821). | `src/components/settings/SettingsPanel.jsx` · `apps/api/src/modules/whatsapp/` | ✅ 2026-07-15 |
| F8-5 | Usuários e níveis de acesso: criação (nome, e-mail, senha com regras do DTO, nível), mudança de nível inline, ativar/desativar, excluir. Rótulos do produto: Usuário comum (AGENT) · Líder de setor (SUPERVISOR) · Administrador (ADMIN). | `src/components/settings/SettingsPanel.jsx` · `apps/api/src/modules/user/` | ✅ 2026-07-15 |
| F8-6 | Grupos (setores): criar com nome+cor, listar com contagem de membros, excluir, expandir para gerenciar membros (adicionar/remover via `/departments/:id/users`). | `src/components/settings/SettingsPanel.jsx` · `apps/api/src/modules/department/` | ✅ 2026-07-15 |
| F8-7 | Configurações de perfil do usuário: troca da própria senha (`PATCH /users/:id/password`), avatar e edição de dados pessoais. | `apps/api/src/modules/user/dto/change-password.dto.ts` | ⬜ |
| F8-8 | Configurações avançadas de grupos: filas por setor (estratégia de distribuição), vínculo conexão WhatsApp ↔ setor (`departmentId` no `CreateConnectionDto`). | `apps/api/prisma/schema.prisma` (Queue) | ⬜ |
| F8-9 | **[Descoberto ao gerar QR]** Chave da Evolution desalinhada: `apps/api/.env` tinha chave forte de 128 chars, mas o container subiu com o default `evolution_api_key_dev` (o compose lê `${EVOLUTION_API_KEY}` do `.env` da RAIZ, que não existia) → 401 em toda chamada API→Evolution. Corrigido: criado `.env` na raiz (gitignored) com a mesma chave e container recriado. | `.env` (raiz, novo) · `docker-compose.yml` | ✅ 2026-07-15 |
| F8-11 | **[Pedido do usuário 2026-07-16]** Remodelar os ícones do produto: substituir TODOS os emojis da UI por ícones SVG do svgrepo.com. Criado `src/components/icons.jsx` (componente `Icon` + registro de 34 SVGs inline da coleção "Tabler Icons", disponível no svgrepo, MIT) e substituídos os emojis em 8 componentes (Sidebar, Topbar, ChatPanel, ConversationQueue, CustomerPanel, SettingsPanel, LoginForm, DemoBanner). **Convenção:** ícone novo = svgrepo.com, preferindo a mesma coleção. Obs.: svgrepo.com respondia 429 a clientes não-navegador no dia; os mesmos SVGs foram baixados da fonte canônica da coleção (GitHub tabler-icons). | `src/components/icons.jsx` (novo) · `src/components/*.jsx` · `src/styles.css` | ✅ 2026-07-16 |
| F8-10 | **[Descoberto na sequência]** Webhooks reais seriam rejeitados com 403 após o pareamento: a Evolution gera um token aleatório por instância e o envia no campo `apikey` dos webhooks, mas o `WebhookController` valida contra a chave global. Corrigido: `createInstance` agora passa `token` = chave global (instância `e2e-session` recriada assim). | `apps/api/src/modules/whatsapp/evolution.service.ts:76-86` · `apps/api/src/modules/webhook/webhook.controller.ts` | ✅ 2026-07-15 |

---

## 📋 Backlog

Itens identificados mas ainda não priorizados em fase. Ao priorizar, mover para a fase adequada com ID definitivo.

| ID | Item | Referências | Status |
|---|---|---|---|
| B-1 | Upload real de anexos: a UI do chat aceita arquivos/imagens (commit `6c96242`), mas não há integração com a API/MinIO (`StorageService` existe no back). Ligar front → upload → `Attachment`. | `src/components/ChatPanel.jsx` · `apps/api/src/shared/storage/storage.service.ts` | ⬜ |
| B-2 | Dashboard/Métricas com dados reais (hoje calculadas sobre mock). Provável endpoint agregado no backend. | `src/components/Metrics.jsx` | ⬜ |
| B-3 | Notificações e consulta de auditoria: os modelos `Notification` e `AuditLog` existem no schema, mas não há módulos/endpoints expostos (fase 10 do roteiro original). | `apps/api/prisma/schema.prisma` | ⬜ |
| B-4 | Paginação/scroll infinito real na fila de conversas e no histórico de mensagens (o back já pagina; o front ignora). | `src/hooks/useConversations.js` · `apps/api/src/modules/message/dto/list-messages.dto.ts` | ⬜ |
| B-5 | **[Descoberto em 2026-07-15]** `docker compose up` falha ao baixar `minio/mc:RELEASE.2025-06-13T11-33-47Z` (tag não existe mais no Docker Hub), o que aborta também o pull do MinIO. Postgres, Redis e Evolution sobem normalmente. Atualizar as tags (ou remover o container `createbuckets` e criar o bucket via `StorageService`, que já faz `makeBucket` no boot). | `docker-compose.yml` | ⬜ |
| B-6 | **[Descoberto em 2026-07-15]** A fila `message-send` tem processor registrado mas **nenhum produtor** — o envio real é 100% síncrono no `send-message.service` (Evolution → persiste → emite). Decidir o caminho único (síncrono vs fila com retry/backoff) e remover o caminho morto. | `apps/api/src/modules/message/message-send.processor.ts` · `message.module.ts` | ⬜ |

---

## 🧭 Registro de decisões

| Data | Decisão | Motivo | Itens afetados |
|---|---|---|---|
| 2026-07-15 | Padronizar nomes de eventos socket no formato do backend (`message.new`, `conversation.updated`, …) | O backend é a fonte da verdade do contrato; mudar só o front evita tocar em 13 pontos de emissão | F0-3, F0-4 |
| 2026-07-15 | Envio de mensagem sempre via REST; socket apenas para receber eventos | O gateway não tem handler de envio; o REST passa por DTO validado + regras de permissão. (Corrigido em 2026-07-15: o envio ao WhatsApp é **síncrono** — a fila `message-send` não participa do fluxo; ver B-6) | F0-4, B-6 |
| 2026-07-15 | Seed não tenta mais auto-deletar o arquivo de credenciais | O `setTimeout` de 1h prendia o processo (`db:seed` nunca terminava) e nunca funcionaria de fato (morre com o processo). O arquivo é gitignored e a instrução de deleção manual permanece | F0-7 |
| 2026-07-16 | Ícones da UI: svgrepo.com é a fonte padrão (coleção Tabler Icons); emojis banidos da interface | Pedido do usuário — visual profissional e consistente entre SO/navegadores; componente central `Icon` facilita manutenção | F8-11 |
| 2026-07-16 | `user:typing` removido do frontend (em vez de implementar ponta a ponta) | O gateway não tem handler, o servidor nunca emite o evento e nenhum componente chamava `setTyping` — era código morto nos dois sentidos. Reintroduzir ponta a ponta se o produto pedir indicador de digitação | F2-5 |
| 2026-07-16 | Erros da API sempre via classe `ApiError` (com `.status`/`.message`); rede detectada por `instanceof TypeError` | Objeto literal lançado quebrava `error.message.includes` quando `message` era `undefined`, mascarando o erro original | F1-5, F2-1 |
| _pendente_ | Frontend permanece Vite+React ou migra para Next.js/TS? | — | F5-3 |
| _pendente_ | `POST /auth/register`: implementar ou remover do front? | — | F1-4 |
| _pendente_ | Tokens: cookie httpOnly+CSRF ou manter localStorage com mitigações? | — | F6-1 |

---

## 📝 Changelog

> Formato: `AAAA-MM-DD — resumo (itens tocados) — evidência`

| Data | O que foi feito | Itens | Evidência |
|---|---|---|---|
| 2026-07-16 | **3 bugs reportados pelo usuário no uso real, diagnosticados e corrigidos (F1-8/F1-9/F1-10).** (1) Duplicação de mensagens enviadas: corrida eco-socket × resposta REST na reconciliação otimista — só na UI, banco estava íntegro; (2) figurinhas/fotos invisíveis: mídia armazenada **criptografada** (download da URL `.enc` direta — magic bytes verificados), bucket MinIO sem leitura pública (403) e frontend sem renderização de anexos — as 3 camadas corrigidas (Evolution-first decriptado, política pública no boot, ChatPanel com imagem/áudio/vídeo/link/placeholder); (3) avatares: `fetchProfilePictureUrl` novo na Evolution + busca automática com throttle no webhook + renderização com fallback para iniciais; backfill de 5/6 contatos. Anexos corrompidos limpos. Início da sessão: usuário relatara "mensagens não chegam / não pareado" — diagnóstico: pipeline saudável, era a página do navegador com socket morto (bastou F5). | F1-8 ✅ · F1-9 ✅ · F1-10 ✅ | `npx jest` → 74/74 · `vite build` OK · `nest build` OK · attachment 404 (não mais 403) pós-policy · `UPDATE contacts` → 5 avatares |
| 2026-07-16 | **Remodelagem de ícones (pedido do usuário): emojis → SVGs do svgrepo.com.** Novo `src/components/icons.jsx` com componente `Icon` e 34 ícones inline da coleção Tabler Icons (svgrepo, MIT — 24×24, stroke 2, `currentColor`, tema-aware por herança de cor); substituição completa em Sidebar, Topbar, ChatPanel, ConversationQueue, CustomerPanel, SettingsPanel, LoginForm e DemoBanner; CSS de alinhamento ícone+texto (inline-flex + gap). svgrepo.com estava com rate-limit (429) para clientes não-navegador — SVGs baixados da fonte canônica da coleção; são os mesmos arquivos. Convenção registrada em Decisões e na memória do assistente. | F8-11 ✅ | `npx jest` → 74/74 · `vite build` → OK · varredura: zero emojis restantes nos componentes |
| 2026-07-16 | **🏁 FASE 2 CONCLUÍDA — modo demo explícito e resiliência.** (1) F2-1: fallback mock restrito a dev; em produção `ApiError` 503 visível + retry, nunca dados fictícios; (2) F2-2: banner persistente "🧪 Modo demonstração" (novo `DemoBanner`, cobre login e dashboard, some quando o backend volta); (3) F2-3: fim da race do health check — `backendAvailable` começa `null`, requests aguardam o 1º teste, revalidação com backoff 5s→30s e redetecção automática; (4) F2-4: socket sempre reconecta com token fresco (`auth` como função) + refresh automático em `connect_error` por token; (5) F2-5: `user:typing` removido (decisão registrada); (6) F1-5 de carona: classe `ApiError` substitui o objeto literal. Stack religada no início da sessão (Docker + API em janela "AtendeHub API" + front em janela "AtendeHub Front"). | F2-1…F2-5 ✅ · F1-5 ✅ | `npx jest` → **74/74** (3 novos do DemoBanner) · `vite build` → OK |
| 2026-07-16 | **🏁 FASE 0 CONCLUÍDA — round-trip real completo, validado pelo usuário na madrugada.** Mensagens de cliente chegaram em tempo real no painel e as respostas enviadas pela tela foram entregues no celular: banco mostra sequência `CLIENT`/`AGENT` com status `DELIVERED` entre 01:43 e 02:05. Depois do teste o WhatsApp deslogou a sessão (02:06, `401 Log out instance` na Evolution — esperado após uso intenso/reinícios); conexão "teste" ficou `DISCONNECTED` → re-parear via QR antes do próximo teste real. As correções da sessão anterior (F0-10, F0-11, F1-7) foram commitadas em 4 commits. | F0-4 ✅ · F0-6 ✅ | `SELECT messages ORDER BY sentAt DESC` → respostas AGENT `DELIVERED` ("então meio que zicou o cinema", 02:05) · commits `bacb1e1`…`fe331d5` |
| 2026-07-15 | **Round-trip real em andamento: recepção em tempo real FUNCIONANDO (validada pelo usuário — "as conversas começaram a aparecer").** Sessão re-pareada após reinício da máquina (conexão nova "teste"; a anterior foi invalidada pelo WhatsApp — comportamento esperado). Dois bugs descobertos e corrigidos no caminho: **F0-10** (webhooks 413 — mensagens se perdiam) e **F0-11** (nomes de contato corrompidos por JID com sufixo de dispositivo + pushName de mensagens fromMe). Contatos duplicados de teste removidos do banco. **Falta:** usuário confirmar nomes corretos após as correções + resposta enviada pelo painel chegando no celular (fecha F0-4/F0-6). | F0-10 ✅ · F0-11 ✅ · F0-6 (parcial) | Payload de teste 200KB no webhook → HTTP 200 · conversas reais criadas em tempo real (6 no banco) · `SELECT contacts` pós-limpeza → 3 contatos, sem duplicatas |
| 2026-07-15 | **Configurações funcionais em modo mock (erro "Endpoint não implementado no mock" reportado pelo usuário).** Causa imediata: a stack local inteira estava fora do ar (Docker Desktop parado — provável reinício da máquina; a janela "AtendeHub API" da sessão anterior não sobreviveu) → o front caiu no fallback mock → todas as seções de Configurações quebravam, pois o mock só conhecia auth/conversas. Dois consertos: (1) stack religada — Docker Desktop + containers + API relançada em janela própria minimizada "AtendeHub API"; (2) mock estendido com users/departments/whatsapp em memória (incl. QR de demonstração e simulação de pareamento) e `requestMock` reescrito com roteamento por path+método. É a 2ª vez que o fallback silencioso confunde o usuário (cf. incidente do login) — reforça F2-1/F2-2. | F2-8 ✅ | `npx jest` → 71/71 · health pós-restart → 200 `{status:"ok"}` |
| 2026-07-15 | **🏆 WHATSAPP REAL PAREADO PELO USUÁRIO.** Conexão "carlos teste" criada pela tela de Configurações, QR escaneado com o celular, status `CONNECTED` persistido (webhook `CONNECTION_UPDATE` aceito — prova viva do fix F8-10) e confirmado via sync com a Evolution. O aviso "não é possível conectar novos dispositivos" no celular era rate-limit temporário do WhatsApp (múltiplas tentativas); a versão Baileys estava atual (2.3000.1035194821 = master oficial). Limpeza: conexão-fixture `e2e-session` excluída (pelo próprio usuário, via UI). **Falta para fechar F0-4/F0-6:** round-trip de mensagem real (receber msg de outro número → responder pelo painel). | F8-4 ✅ | `GET /whatsapp` → status CONNECTED · `GET /whatsapp/:id/status` (sync Evolution) → CONNECTED |
| 2026-07-15 | **QR Code do WhatsApp destravado (erro "Instância e2e-session não encontrada" reportado pelo usuário).** Cadeia de 3 causas corrigidas: (1) a fixture `e2e-session` existia só no banco → instância criada na Evolution; (2) chave da Evolution desalinhada (F8-9) → `.env` da raiz criado e container recriado; (3) token de instância ≠ chave global quebraria webhooks reais pós-pareamento (F8-10) → `createInstance` passa `token` global + instância recriada + API reiniciada com build novo. | F8-9 ✅ · F8-10 ✅ · F8-4 (destravado) | `POST /instance/create` → 201 com token global · `GET /whatsapp/:id/qrcode` via API oficial → `{"qrCode":"data:image/png;base64,..."}` · health 200 pós-restart |
| 2026-07-15 | **Layout das Configurações corrigido (feedback do usuário: "espaçamentos muito pequenos").** Causa raiz: o `SettingsPanel` era renderizado dentro do grid do `.workspace` (colunas 300px/1fr/340px do chat) e ficava espremido na coluna de 300px. Criada a variante `.workspace-settings` (flex, largura total) + aumento geral de respiro: padding do conteúdo 24→32/40px, nav 240→280px, itens 12/16→16/20px, fontes e gaps maiores. | F8-3 (refinamento) | `vite build` OK · `npx jest` → 71/71 |
| 2026-07-15 | **Correção do login (incidente + pedido do usuário).** A API (processo em background da sessão) foi derrubada → o front caiu no mock silenciosamente → mock rejeitou as credenciais reais com "Senha incorreta". Corrigido: mensagem genérica "Usuário ou senha incorreta." no backend e no mock (anti-enumeração), senha do admin realinhada (`admin@demo.com` / `Admin@123` = README = mock), e API relançada em **janela própria do Windows** (minimizada, título "AtendeHub API") — sobrevive ao fim desta sessão. | F2-7 | `curl login` correto → 200 · errado → 401 `"Usuário ou senha incorreta."` · health → 200 · `npx jest` → 71/71 |
| 2026-07-15 | **Fase 8 implementada (pedido do usuário): menu reorganizado + área de Configurações.** Sidebar sem o canal WhatsApp/botão Conectar (morto) e itens sem tela ficam desabilitados; toggle de tema saiu da Topbar; novo `SettingsPanel` com 4 seções (Aparência, Conexões WhatsApp com QR + status ao vivo, Usuários com níveis Atendente/Líder de setor/Administrador, Grupos com gestão de membros); 16 novos métodos no `apiClient` (users/departments/whatsapp); visibilidade por role; view switch no Dashboard; ~330 linhas de CSS tema-aware. | F8-1…F8-6 | `npx jest` → 71/71 · `vite build` → OK · endpoints reais: `/users`, `/departments`, `/whatsapp` (+`/qrcode`, `/status`, `/disconnect`) |
| 2026-07-15 | **Refinamentos pós-smoke (observando o usuário em tempo real).** (1) `join:conversation` gated por `loadedFromApi` — reloads às 14:10-14:11 entram direto na sala real, zero WARNs de `conv-1`; (2) aviso visível de falha de envio (`sendError` + `.send-error` no ChatPanel) — antes o usuário tentou enviar 3× sem nenhum feedback na tela; (3) Evolution confirmada respondendo: erros de envio agora são `404` limpos (instância inexistente — pareamento pendente) em vez de connection refused. | F2-6 ✅, F0-4 (evidência) | Monitor do log: joins sem WARN após 14:10:15 · `ERROR EvolutionService ... 404` (14:09) · `npx jest` → 71/71 |
| 2026-07-15 | **Smoke test com o usuário real (Carlos) logado pelo navegador.** Servidor: sessão admin autenticada no socket `/ws`; página carregou as conversas REAIS e entrou na sala da conversa E2E (`join:conversation` com validação multi-tenant OK — inclusive rejeitando corretamente o id mock `conv-1` durante a transição); tentativa de envio do usuário passou todo o backend e chegou à Evolution. Normalização mínima aplicada no front para viabilizar dados reais na UI (início do F1-2): `toUiConversation`, mensagens sob demanda via `GET /conversations/:id/messages`. **Descobertas corrigidas:** Evolution em crash-loop desde sempre (banco compartilhado com a API → colisão `_prisma_migrations`) → banco `evolution` dedicado + container órfão removido → **Evolution respondendo 200 pela 1ª vez**. Incidente de ferramenta (não é bug do projeto): vite duplicado do assistente ocupou a porta 3001 por ~10min e interferiu nas chamadas REST do navegador — resolvido matando o processo. | F0-6 (parcial), F1-2 (parcial), F0-9 | Log gateway: `Cliente conectado ... user cmrm93kka` + `entrou na sala conversation:cmrm9bgs...` (13:36) · Envio: `ERROR [SendMessageService] Falha ao enviar` após passar DTO/permissões (13:51) · `curl http://localhost:8080` → 200 `"Welcome to the Evolution API"` v2.3.4 · `npx jest` → 71/71 |
| 2026-07-15 | **Fase 0 implementada e validada por E2E.** Backend: novo `HealthModule` (`GET /api/v1/health` público, sem throttle); eventos Socket.IO emitidos em **união de salas** (fim da entrega duplicada); `tsconfig.build.json` (F0-8); seed corrigido (F0-7). Frontend: socket conecta no namespace `/ws`; eventos renomeados para o contrato real (`message.new`, `conversation.updated`, etc.); normalização `toUiMessage` (CLIENT→customer); envio sempre via REST com `{ type, content }`; reconciliação da mensagem otimista + dedupe por id; `join/leave:conversation` ao trocar de conversa ativa; caminho morto `send:message` removido. Infra local: Docker iniciado, Postgres/Redis/Evolution no ar, migrations + seed aplicados, fixtures E2E criadas (`e2e@demo.com`, conexão `e2e-session`). | F0-1…F0-8 | Health: `curl` → 200 `{status:"ok"}` · E2E: login 200 c/ JWT real → socket `connected` em `/ws` (salas `company:` e `agent:`) → webhook `MESSAGES_UPSERT` 200 → `conversation.created` + `message.new` recebidos em tempo real → `join:conversation` confirmado no log do gateway · Envio REST passou DTO/permissões e chegou à Evolution (400 só por não haver sessão WhatsApp pareada) · `npx jest` → **71/71** · `tsc --noEmit` → OK · `vite build` → OK |
| 2026-07-15 | Análise completa do projeto e criação deste roadmap. Estado inicial verificado: backend compila limpo (`tsc --noEmit` OK), frontend com 66/66 testes passando, integração front↔back quebrada (health inexistente, namespace `/ws` divergente, eventos com nomes diferentes, envio de mensagem sem handler e com DTO incompatível), SLA como código morto, zero testes no backend. | — (baseline) | `npx jest` → 66 passed · `npx tsc --noEmit` → exit 0 · greps registrados na análise |
