# Convenção de Nomenclatura — AtendeHub

> **Documento normativo.** Em caso de divergência entre este documento e qualquer código existente,
> este documento prevalece e o código é corrigido na próxima vez que for tocado — não em uma
> refatoração em massa.
> Última revisão: 2026-07-28

---

## Princípio geral

**O nome deve responder "o que é isto?" antes de qualquer pessoa abrir o arquivo.** Sufixo de tipo não é
redundância: é o que permite ler uma árvore de 200 arquivos e entender a arquitetura sem abrir nenhum.

**Idioma:** o projeto é PT-BR. A regra é:

| Elemento | Idioma | Motivo |
|---|---|---|
| Termos de domínio (conversa, fila, atendimento, contato) | **Português** | Linguagem ubíqua do DDD — precisa casar com o vocabulário do cliente |
| Elementos técnicos (`Service`, `Controller`, `Repository`, `Guard`) | **Inglês** | São termos do framework, não do domínio |
| Comentários e documentação | **Português** | Time e clientes brasileiros |
| Mensagens de commit | **Português** | Convenção vigente do projeto |
| Nomes de variável e função | **Inglês**, exceto termo de domínio sem tradução natural | Consistência com bibliotecas |

Na prática, o projeto já faz isso: `ConversationService`, `AutoAttendanceFlow`, `SlaCheckProcessor` —
estrutura em inglês, conceito de domínio preservado.

---

## 1. Pastas

| Contexto | Padrão | Exemplo | Contraexemplo |
|---|---|---|---|
| Raiz do repositório | `kebab-case` minúsculo | `apps/`, `packages/`, `infra/` | `Apps/`, `my_folder/` |
| Documentação | `NN-Nome-Em-Kebab-Capitalizado` | `08-Banco-de-Dados/` | `banco/`, `08_banco/` |
| Subpasta de testes em `docs/23-Testes` | `PascalCase` | `Unitarios/`, `GoLive/` | `unitarios/` |
| Módulo do backend | `kebab-case` singular | `conversation/`, `auto-attendance/` | `Conversations/` |
| Feature do frontend | `kebab-case` singular | `inbox/`, `conversation/` | `Inbox/` |
| Agrupamento técnico | `kebab-case` plural | `guards/`, `decorators/`, `dto/` | `Guard/` |

**Por que módulo no singular e agrupamento no plural:** `conversation/` é o *domínio* Conversa (um
conceito); `guards/` é uma *coleção* de guards (vários artefatos do mesmo tipo). A distinção é
intencional e já é o padrão vigente em `apps/api/src/modules/`.

**Numeração de `docs/`:** dois dígitos, sequencial, com lacunas permitidas. `99-` é reservado para
arquivo morto. Inserir área nova entre `12` e `13` exige renumerar — por isso a numeração deve ser
pensada por área temática ampla, não por documento.

---

## 2. Arquivos

### 2.1 Regra por camada — Backend (NestJS)

| Artefato | Padrão | Exemplo real |
|---|---|---|
| Módulo | `<dominio>.module.ts` | `conversation.module.ts` |
| Controller | `<dominio>.controller.ts` | `conversation.controller.ts` |
| Service | `<dominio>.service.ts` | `conversation.service.ts` |
| Service auxiliar | `<funcao>.service.ts` | `send-message.service.ts`, `media-download.service.ts` |
| Repository | `<dominio>.repository.ts` | `conversation.repository.ts` |
| Interface de repositório | `<dominio>.repository.interface.ts` | `conversation.repository.interface.ts` |
| DTO de entrada | `<verbo>-<dominio>.dto.ts` | `create-contact.dto.ts`, `update-conversation-status.dto.ts` |
| DTO de saída | `<dominio>-response.dto.ts` | `auth-response.dto.ts` |
| DTO de listagem | `list-<dominio>s.dto.ts` | `list-conversations.dto.ts` |
| Entidade de domínio | `<dominio>.entity.ts` | `conversation.entity.ts` |
| Value object | `<nome>.vo.ts` | `email.vo.ts`, `phone.vo.ts` |
| Enum | `<nome>.enum.ts` | `conversation-status.enum.ts` |
| Guard | `<nome>.guard.ts` | `jwt-auth.guard.ts`, `roles.guard.ts` |
| Decorator | `<nome>.decorator.ts` | `current-user.decorator.ts`, `public.decorator.ts` |
| Pipe | `<nome>.pipe.ts` | `parse-cuid.pipe.ts` |
| Middleware | `<nome>.middleware.ts` | `request-id.middleware.ts` |
| Strategy | `<nome>.strategy.ts` | `jwt.strategy.ts`, `local.strategy.ts` |
| Processor de fila | `<fila>.processor.ts` | `sla-check.processor.ts`, `webhook.processor.ts` |
| Evento de domínio | `<dominio>-<acao>.event.ts` | `conversation-assigned.event.ts` |
| Teste unitário | `<arquivo>.spec.ts` | `conversation.service.spec.ts` |
| Teste especializado | `<arquivo>.<aspecto>.spec.ts` | `conversation.service.sla.spec.ts` |
| Teste e2e | `<fluxo>.e2e-spec.ts` | `sla.e2e-spec.ts` |

> ✅ **O backend já segue esta convenção em 18 módulos.** Este documento a formaliza, não a altera.

### 2.2 Regra por camada — Frontend (React)

| Artefato | Padrão | Exemplo |
|---|---|---|
| Componente | `PascalCase.jsx` | `ChatPanel.jsx`, `ConversationQueue.jsx` |
| Hook | `use<Nome>.js` | `useConversations.js`, `useAuth.js` |
| Contexto | `<Nome>Context.jsx` | `AuthContext.jsx`, `ThemeContext.jsx` |
| Serviço | `camelCase.js` | `api.js`, `websocket.js`, `eventBus.js` |
| Utilitário | `camelCase.js` | `validators.js`, `formatters.js` |
| Store (Zustand) | `use<Nome>Store.js` | `useInboxStore.js` |
| Teste | `<arquivo>.test.js` | `ChatPanel.test.js` |
| Teste de integração | `<arquivo>.integration.test.js` | `useConversations.integration.test.js` |
| Teste focado | `<arquivo>.<aspecto>.test.js` | `SettingsPanel.usersSection.test.js` |
| Estilo | `<nome>.css` ou co-locado | `styles.css` |

> ✅ **O frontend já segue esta convenção.** Formalizada, não alterada.

### 2.3 Documentação

| Tipo | Padrão | Exemplo |
|---|---|---|
| Documento normativo | `SCREAMING-KEBAB-CASE.md` | `CONVENCAO-DE-NOMENCLATURA.md` |
| Documento descritivo | `kebab-case.md` | `modelo-de-dados.md` |
| ADR | `ADR-NNNN-titulo-em-kebab.md` | `ADR-0001-estrutura-do-repositorio.md` |
| README de pasta | `README.md` | sempre exatamente assim |
| Post-mortem | `NNNN-MM-DD-titulo-em-kebab.md` | `2026-08-15-perda-de-mensagens.md` |
| Ata | `NNNN-MM-DD-tipo-de-reuniao.md` | `2026-08-01-comite-de-arquitetura.md` |

**Data em nome de arquivo:** permitida **apenas** para documento que é um registro de um momento
(post-mortem, ata, relatório de pentest). **Proibida** em documento vivo — data em documento vivo induz
a criar cópias em vez de evoluir o original, e o histórico é responsabilidade do Git.

### 2.4 Configuração e infraestrutura

| Tipo | Padrão | Exemplo |
|---|---|---|
| Config de ferramenta | conforme a ferramenta exige | `vite.config.js`, `nest-cli.json` |
| Compose | `compose[.<ambiente>].yml` | `compose.yml`, `compose.prod.yml` |
| Dockerfile | `<alvo>.Dockerfile` ou `Dockerfile` | `api.Dockerfile`, `nginx.Dockerfile` |
| Workflow | `<escopo>-<funcao>.yml` | `ci-api.yml`, `deploy-prod.yml` |
| Migration Prisma | gerado pela ferramenta | `20260726221220_auto_attendance` |
| Script | `<verbo>-<alvo>.<ext>` | `dev-api.ps1`, `backup-postgres.sh` |
| Variável de ambiente | `SCREAMING_SNAKE_CASE` | `JWT_SECRET`, `EVOLUTION_API_KEY` |

**Migration:** o nome gerado após o timestamp deve descrever a **mudança**, não a intenção.
`add_conversation_resolution` ✅ · `fix_stuff` ❌ · `update` ❌

---

## 3. Código

### 3.1 Identificadores

| Elemento | Padrão | Exemplo |
|---|---|---|
| Classe, interface, tipo, enum | `PascalCase` | `ConversationService`, `JwtPayload`, `MessageStatus` |
| Interface de porta | `I<Nome>` | `IChannelAdapter`, `IConversationRepository` |
| Função e método | `camelCase`, verbo primeiro | `findAll`, `upsertFromWebhook`, `scheduleSlaCheck` |
| Variável | `camelCase` | `conversationId`, `companyId` |
| Constante de módulo | `SCREAMING_SNAKE_CASE` | `QUEUE_NAMES`, `CONVERSATION_LIST_SELECT` |
| Booleano | prefixo `is`/`has`/`can`/`should` | `isActive`, `hasMore`, `canTransitionTo` |
| Handler de evento | `handle<Evento>` ou `on<Evento>` | `handleConnection`, `onQueueFailed` |
| Componente React | `PascalCase` | `ChatPanel` |
| Prop de callback | `on<Evento>` | `onSelect`, `onLoadMore`, `onCloseConversation` |
| Campo privado | sem prefixo, use `private` | `private readonly logger` |
| Variável descartada | prefixo `_` | `const { passwordHash: _hash, ...safe } = user` |

### 3.2 Regras de nomeação semântica

**Verbos de método — significado fixo:**

| Verbo | Significa | Retorno quando não encontra |
|---|---|---|
| `find` | Busca, pode não achar | `null` |
| `get` | Busca, deve achar | lança exceção |
| `list` | Retorna coleção paginada | coleção vazia |
| `create` | Cria novo | lança se já existe |
| `update` | Altera existente | lança se não existe |
| `upsert` | Cria ou atualiza | nunca lança por ausência |
| `delete` | Remove | idempotente |
| `assert` | Valida e lança se inválido | `void` ou lança |

> Exemplo real correto no projeto: `assertConversationOwnership` lança `NotFoundException`;
> `findAll` retorna coleção; `upsertFromWebhook` cria ou reaproveita.

**Proibido:** `data`, `info`, `manager`, `helper`, `util`, `handler` como nome de classe. Todos
significam "não sei o que isto faz". `Utils` só é aceitável como módulo de funções puras sem estado, e
mesmo assim com nome específico (`date-utils`, não `utils`).

**Evitar abreviação**, exceto as consagradas no projeto: `id`, `dto`, `api`, `url`, `jwt`, `sla`, `qr`,
`ui`, `db`.

---

## 4. Git

### 4.1 Branches

```
<tipo>/<escopo-opcional>-<descricao-em-kebab>
```

| Exemplo | Válido? |
|---|---|
| `feat/webhook-adapter-telegram` | ✅ |
| `fix/webhook-retry-propaga-erro` | ✅ |
| `chore/estrutura-fase-1-apps-web` | ✅ |
| `docs/adr-abstracao-de-canal` | ✅ |
| `minha-branch` | ❌ sem tipo |
| `feature/AddNewThing` | ❌ tipo errado, PascalCase |
| `fix/bug` | ❌ descrição vazia de significado |

### 4.2 Commits

Conventional Commits em português. Formato completo em
[`PLANO-DE-REESTRUTURACAO.md §12.3`](PLANO-DE-REESTRUTURACAO.md#123-convenção-de-commits).

```
fix(webhook): propaga erro do handleEvent para reativar o retry [B-39]
```

- Descrição no **imperativo** ("adiciona", não "adicionado" nem "adicionando")
- Minúscula inicial, **sem ponto final**
- Até 72 caracteres na primeira linha
- ID do roadmap entre colchetes quando aplicável
- Corpo explica **por quê**, nunca **o quê** (o diff já mostra o quê)

### 4.3 Tags

`v<MAJOR>.<MINOR>.<PATCH>` — anotada e assinada. Tags temporárias de migração:
`pre-estrutura-fase-<N>`.

---

## 5. Banco de dados

| Elemento | Padrão | Exemplo |
|---|---|---|
| Modelo Prisma | `PascalCase` singular | `Conversation`, `WhatsAppConnection` |
| Tabela física | `snake_case` plural via `@@map` | `@@map("conversations")` |
| Campo Prisma | `camelCase` | `lastMessageAt`, `companyId` |
| Coluna física | `snake_case` (mapeada) | `last_message_at` |
| Enum Prisma | `PascalCase` | `ConversationStatus` |
| Valor de enum | `SCREAMING_SNAKE_CASE` | `WAITING`, `ROUTE_TO_DEPARTMENT` |
| Chave estrangeira | `<entidade>Id` | `contactId`, `whatsappConnectionId` |
| Índice | declarado com `@@index` | `@@index([companyId, status])` |
| Timestamp | `<verbo no particípio>At` | `createdAt`, `resolvedAt`, `slaBreachedAt`, `anonymizedAt` |
| Contador | `<substantivo>Count` | `unreadCount` |
| Booleano | `is<Adjetivo>` | `isActive`, `isBlocked`, `isDeleted` |

> ✅ **O schema atual segue integralmente esta convenção** nos 17 modelos e 11 enums.

---

## 6. API

| Elemento | Padrão | Exemplo |
|---|---|---|
| Recurso | substantivo plural em `kebab-case` | `/conversations`, `/audit-logs`, `/auto-attendance` |
| Sub-recurso | aninhado sob o pai | `/conversations/:id/messages` |
| Ação não-CRUD | verbo como sub-recurso, via `PATCH`/`POST` | `PATCH /conversations/:id/assign` |
| Parâmetro de rota | `camelCase` | `:conversationId` |
| Query string | `camelCase` | `?departmentId=&page=&limit=` |
| Campo de payload | `camelCase` | `resolutionNote` |
| Evento de socket | `<recurso>.<acao>` minúsculo | `message.new`, `conversation.assigned`, `sla.breached` |
| Evento de webhook de saída | `<recurso>.<acao>` | `conversation.created` |
| Header customizado | `X-<Nome-Em-Kebab>` | `X-Request-Id` |

**Proibido:** verbo no caminho do recurso (`/getConversations`, `/createContact`). O método HTTP já é o
verbo.

> ✅ **As 85 rotas atuais seguem esta convenção.**

---

## 7. Testes

| Elemento | Padrão |
|---|---|
| Bloco `describe` | nome do artefato sob teste: `describe('ConversationService', ...)` |
| `describe` aninhado | nome do método: `describe('assign', ...)` |
| Bloco `it` | comportamento em português, iniciando por verbo: `it('lança 404 quando a conversa é de outra empresa', ...)` |
| Fixture | `<entidade>Fixture` ou `make<Entidade>` |
| Mock | `mock<Dependencia>` |

**`it` descreve comportamento observável, não implementação.**
✅ `it('marca a conversa como violada quando o SLA expira sem atendimento')`
❌ `it('chama o método update do prisma')`

---

## 8. Aplicação e exceções

### Como esta convenção é verificada

| Regra | Verificação | Fase |
|---|---|---|
| Commits | `commitlint` no hook `commit-msg` | 2 |
| Nomes de arquivo | regra ESLint de convenção de nome | 2 |
| Identificadores | `@typescript-eslint/naming-convention` | 2 |
| Nomes de branch | proteção de branch no GitHub | 1 |
| Estrutura de pastas | revisão de PR + `CODEOWNERS` | 0 ✅ |

### Política de exceção

Violar esta convenção é aceitável quando:

1. Uma ferramenta externa **exige** outro formato (`.babelrc`, `Dockerfile`, `nest-cli.json`)
2. Uma biblioteca de terceiro impõe o nome
3. Existe ADR aceita documentando e justificando a exceção

Em qualquer outro caso, o PR é ajustado. **Nomenclatura não é preferência pessoal — é a interface entre
quem escreveu o código e quem vai mantê-lo daqui a dois anos.**

### Código legado

Arquivo que não segue a convenção **não é renomeado em massa**. É corrigido na próxima vez que for
alterado por outro motivo. Renomeação em massa gera conflito de merge em toda branch aberta e ruído no
`git blame`, com benefício desproporcional ao custo.
