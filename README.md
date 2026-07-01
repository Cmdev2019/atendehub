# AtendeHub

Plataforma SaaS de atendimento omnichannel multi-tenant com integração WhatsApp via Evolution API.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | Next.js 14 + React + TypeScript |
| Back-end | NestJS + TypeScript |
| ORM | Prisma 5 |
| Banco | PostgreSQL 16 |
| Cache / Filas | Redis 7 + BullMQ |
| Tempo real | Socket.IO |
| WhatsApp | Evolution API v2 |
| Storage | MinIO (S3 compatível) |
| Containers | Docker + Docker Compose |
| Proxy | Nginx |

---

## Estrutura do projeto

```
atendehub/
├── apps/
│   ├── api/                  # Backend NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   └── web/                  # Front-end Next.js (Fase 8)
├── infra/
│   ├── postgres/
│   │   └── init.sql
│   └── nginx/
│       └── nginx.conf
├── docker-compose.yml        # Infraestrutura local
├── docker-compose.prod.yml   # Override de produção
└── .env.example
```

---

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac/Linux)
- Node.js >= 20
- npm >= 10

---

## Configuração inicial

### 1. Copiar variáveis de ambiente

```bash
cp .env.example .env
```

> Em desenvolvimento os valores padrão do `.env.example` já funcionam.
> Em produção, **troque todos os segredos** antes de subir.

### 2. Subir a infraestrutura

```bash
docker compose up -d
```

Isso sobe em background:
- **PostgreSQL** → `localhost:5432`
- **Redis** → `localhost:6379`
- **MinIO** → `localhost:9000` (API S3) / `localhost:9001` (Console web)
- **Evolution API** → `localhost:8080`

### 3. Verificar se tudo está saudável

```bash
docker compose ps
```

Todos os serviços devem aparecer com status `healthy` ou `running`.

### 4. Instalar dependências do backend

```bash
cd apps/api
npm install
```

### 5. Gerar o client Prisma e rodar as migrations

```bash
npm run db:generate
npm run db:migrate
```

### 6. Popular o banco com dados iniciais

```bash
npm run db:seed
```

Cria:
- Empresa **demo**
- Admin: `admin@demo.com` / `Admin@123`
- Departamentos: Atendimento, Financeiro, Suporte
- Filas e tags padrão

### 7. Abrir o Prisma Studio (visualizador do banco)

```bash
npm run db:studio
```

Acesse: http://localhost:5555

---

## Serviços e suas URLs

| Serviço | URL | Credenciais |
|---|---|---|
| PostgreSQL | `localhost:5432` | user: `atendehub` / pass: `atendehub_secret` |
| Redis | `localhost:6379` | senha: `redis_secret` |
| MinIO Console | http://localhost:9001 | user: `atendehub_minio` / pass: `minio_secret_123` |
| Evolution API | http://localhost:8080 | API Key: `evolution_api_key_dev` |
| Prisma Studio | http://localhost:5555 | — |
| Backend NestJS | http://localhost:3001 | — |
| Front-end | http://localhost:3000 | — |

---

## Comandos úteis

```bash
# Parar tudo
docker compose down

# Parar e apagar volumes (reset completo do banco)
docker compose down -v

# Ver logs de um serviço específico
docker compose logs -f evolution
docker compose logs -f postgres

# Resetar banco (apaga tudo e re-roda seed)
cd apps/api && npm run db:reset

# Criar nova migration após alterar schema.prisma
cd apps/api && npm run db:migrate
```

---

## Roteiro de desenvolvimento

| Fase | Descrição | Status |
|---|---|---|
| 1 | Docker Compose + Prisma schema | ✅ Concluída |
| 2 | Auth (JWT, RBAC, multi-tenant guard) | 🔜 |
| 3 | CRUD: Company, User, Department | 🔜 |
| 4 | Módulo WhatsApp — QR Code + sessão | 🔜 |
| 5 | Webhook + Contact + Conversation + Message | 🔜 |
| 6 | Socket.IO gateway (tempo real) | 🔜 |
| 7 | Envio de mensagem (ciclo completo) | 🔜 |
| 8 | Front-end Next.js + TypeScript | 🔜 |
| 9 | Filas BullMQ, automações, SLA | 🔜 |
| 10 | Relatórios, auditoria, notificações | 🔜 |
