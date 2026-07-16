# AtendeHub

Plataforma SaaS de atendimento multiatendente via WhatsApp (multi-tenant), com
conversas em tempo real, fila de atendimento, níveis de acesso e integração
WhatsApp via Evolution API.

> 📌 **Status do projeto:** em estabilização ativa. O documento canônico de
> progresso é o [`ROADMAP_ESTABILIZACAO.md`](ROADMAP_ESTABILIZACAO.md) —
> consulte-o antes de qualquer trabalho. O contrato da API está em
> [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

---

## Stack (real)

| Camada | Tecnologia |
|---|---|
| Front-end | **Vite 6 + React 19 (JavaScript)** — na raiz do repo |
| Back-end | NestJS 10 + TypeScript — `apps/api` |
| ORM | Prisma |
| Banco | PostgreSQL 16 |
| Cache / Filas | Redis 7 + Bull |
| Tempo real | Socket.IO (namespace `/ws`) |
| WhatsApp | Evolution API v2 (Baileys) |
| Storage de mídia | MinIO (S3 compatível) |
| Containers | Docker + Docker Compose |

> O front em Next.js/TypeScript citado em versões antigas deste README nunca
> existiu (`apps/web` não existe). A permanência em Vite+React ou migração
> futura é a decisão F5-3 do roadmap.

## Estrutura do projeto

```
atendehub/
├── src/                      # Front-end Vite + React (componentes, hooks, services)
│   ├── components/           # UI (ChatPanel, ConversationQueue, Settings, icons...)
│   ├── hooks/                # useConversations, useAuth, useTheme
│   ├── services/             # api.js (REST), websocket.js (Socket.IO), apiMock.js
│   └── context/              # AuthContext, ThemeContext
├── apps/api/                 # Backend NestJS
│   ├── prisma/               # schema, migrations, seed
│   └── src/modules/          # auth, conversation, message, webhook, whatsapp, ...
├── docs/                     # API_CONTRACT.md, LOGO_GUIDELINES.md, archive/
├── infra/                    # postgres/init.sql, nginx/
├── docker-compose.yml        # Infra local (Postgres, Redis, MinIO, Evolution)
└── docker-compose.prod.yml   # Override de produção
```

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js >= 20 e npm >= 10

## Como rodar (validado em 2026-07-16)

### 1. Variáveis de ambiente

```bash
cp apps/api/.env.example apps/api/.env   # backend
```

Crie também um `.env` na **raiz** com `EVOLUTION_API_KEY=<mesma chave do apps/api/.env>` —
o docker-compose lê a chave da raiz e a API precisa usar a MESMA (sem isso,
toda chamada API→Evolution responde 401).

### 2. Infraestrutura

```bash
docker compose up -d postgres redis minio evolution
```

> ⚠️ Não use `docker compose up -d` sem listar os serviços: o container
> auxiliar `minio_init` referencia uma tag que saiu do Docker Hub e aborta o
> pull (item B-5 do roadmap). O bucket é criado pela própria API no boot.

Sobe: PostgreSQL (`:5432`), Redis (`:6379`), MinIO (`:9000` API / `:9001` console)
e Evolution API (`:8080`).

### 3. Backend

```bash
cd apps/api
npm install
npm run db:generate && npm run db:migrate
npm run db:seed        # cria empresa demo + admin com SENHA ALEATÓRIA
npm run start          # ou npm run start:dev (watch) — porta 3001
```

> 🔑 **Senha do admin:** o seed gera uma senha aleatória e a salva em
> `apps/api/.seed-credentials-<timestamp>.txt` (gitignored). Apague o arquivo
> após guardar a senha. No ambiente de desenvolvimento deste repo a senha do
> `admin@demo.com` foi definida como `Admin@123` (igual ao mock do front).

Health check: `curl http://localhost:3001/api/v1/health` → `{"status":"ok"}`.

### 4. Front-end

```bash
# na raiz do repo
npm install
npm run dev            # http://localhost:3000
```

Sem o backend no ar, o front entra em **modo demonstração** (dados fictícios)
com um banner visível — comportamento restrito a desenvolvimento.

### 5. Conectar o WhatsApp

Login → **Configurações → Conexões WhatsApp** → criar conexão → escanear o QR
Code com o celular (WhatsApp → Dispositivos conectados). O status muda para
"Conectado" automaticamente e as conversas passam a chegar em tempo real.

## Testes e build

```bash
npm test               # front (Jest) — 74 testes
npm run build          # front (vite build)
cd apps/api && npm run build   # backend (nest build)
```

> O backend ainda não tem testes — é a Fase 4 do roadmap.

## Serviços e URLs (desenvolvimento)

| Serviço | URL | Credenciais (apenas dev) |
|---|---|---|
| Front-end | http://localhost:3000 | `admin@demo.com` / `Admin@123` |
| Backend (API) | http://localhost:3001/api/v1 | JWT via `/auth/login` |
| PostgreSQL | `localhost:5432` | `atendehub` / `atendehub_secret` |
| Redis | `localhost:6379` | senha `redis_secret` |
| MinIO Console | http://localhost:9001 | `atendehub_minio` / `minio_secret_123` |
| Evolution API | http://localhost:8080 | `apikey` = `EVOLUTION_API_KEY` do `.env` |

> 🔒 Estes valores são defaults de desenvolvimento. Em produção, **todos os
> segredos devem ser trocados** (checklist na Fase 6 do roadmap).

## Estado atual (2026-07-16)

| Área | Status |
|---|---|
| Login real (JWT + refresh + blacklist) | ✅ |
| Conversas em tempo real (socket `/ws`) | ✅ |
| Envio/recepção de mensagens WhatsApp (validado ponta a ponta) | ✅ |
| Mídia: figurinhas/fotos/áudio no chat + envio de prints (Ctrl+V) | ✅ |
| Fotos de perfil dos contatos | ✅ |
| Configurações: conexões WhatsApp (QR), usuários/níveis, grupos, tema | ✅ |
| Modo demonstração explícito (banner) e resiliência de conexão | ✅ |
| SLA (detecção de violação) | ⬜ módulo escrito, não ativado (Fase 3) |
| Testes no backend | ⬜ (Fase 4) |
| Métricas com dados reais | ⬜ (B-2) |
| CI / deploy de produção | ⬜ (Fase 7) |

O detalhamento item a item, com evidências e changelog, está no
[`ROADMAP_ESTABILIZACAO.md`](ROADMAP_ESTABILIZACAO.md).
