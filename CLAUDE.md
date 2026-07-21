# CLAUDE.md — Guia do projeto AtendeHub

Central de atendimento multiatendente via WhatsApp (SaaS multi-tenant).
**Idioma do projeto: PT-BR** — respostas, commits e documentação em português.

## 📌 Fontes de verdade (leia antes de trabalhar)

1. **`ROADMAP_ESTABILIZACAO.md`** (raiz) — documento vivo canônico do projeto
   como um todo: status por item, decisões e changelog. **Regras:** todo
   problema novo vira item com ID antes de ser corrigido; todo item concluído
   exige evidência no changelog; atualizar painel e "Próxima ação" ao fim de
   cada sessão.
2. **`ROADMAP_BACKEND.md`** (raiz) — documento vivo com foco exclusivo em
   `apps/api`, Prisma/PostgreSQL e filas (Bull/Redis). Criado em 2026-07-21:
   decisão de fechar todo o backend e banco antes de retomar o frontend.
   Mesmas regras de documento vivo do item acima.
3. **`docs/API_CONTRACT.md`** — contrato real da API (shapes, enums, eventos
   socket). Atualizar no mesmo commit que alterar um endpoint.
4. `docs/archive/` — relatórios históricos; **não** são fonte de verdade.

## Arquitetura

- **Front** (raiz): Vite 6 + React 19 **JavaScript** (decisão F5-3: permanece
  Vite+React), sem JSX transform manual — componentes usam
  `createElement as h`. Socket.IO client. Dev na porta **3000**.
  - `src/services/api.js` — ApiClient (REST, fallback mock só em dev, classe
    `ApiError`); `src/services/websocket.js` — wsClient (namespace `/ws`)
  - `src/hooks/useConversations.js` — estado das conversas + normalizadores
    `toUiConversation`/`toUiMessage` (contrato API → shape da UI)
  - `src/components/icons.jsx` — TODO ícone vem do **svgrepo.com** (coleção
    Tabler Icons); **nunca** emoji na UI
- **Back** (`apps/api`): NestJS + Prisma + PostgreSQL, Redis/Bull, MinIO,
  Socket.IO gateway. Porta **3001**, prefixo `/api/v1`.
  - Multi-tenant: **toda** query filtra por `companyId`
  - `ValidationPipe` com `forbidNonWhitelisted` — campo extra no body = 400
- **Evolution API** (Docker, porta 8080) faz a ponte com o WhatsApp; fala com
  a API via webhooks (`/api/v1/webhooks/evolution`, header `apikey`).

## Comandos

```bash
# Front (na raiz)
npm run dev          # dev server porta 3000
npm test             # Jest (74 testes)
npm run build        # vite build

# Back (apps/api)
npm run start:dev    # watch | npm run start = dist
npm run build        # nest build
npm run db:migrate   # prisma migrate dev
npm run db:seed      # seed (senha do admin é ALEATÓRIA → .seed-credentials-*.txt)
npm run db:studio    # Prisma Studio :5555

# Infra (na raiz) — NÃO use `docker compose up -d` sem listar serviços (B-5)
docker compose up -d postgres redis minio evolution
```

## Pitfalls conhecidos (custaram sessões de debug)

1. **`.env` da raiz** precisa de `EVOLUTION_API_KEY` idêntica à de
   `apps/api/.env` — o compose lê a da raiz; sem ela, API→Evolution = 401.
2. **`minio_init`** do compose tem tag que saiu do Docker Hub — suba os
   serviços nominalmente; o bucket é criado pela API no boot.
3. **Mídia do WhatsApp é criptografada** — baixar a URL `.enc` direto salva
   lixo; sempre usar `getBase64FromMediaMessage` da Evolution.
4. **Evolution não resolve `localhost:9000`** — mídia enviada a ela vai em
   base64; a URL do MinIO é só para o painel.
5. Em dev no Windows, API e front rodam em janelas próprias minimizadas
   ("AtendeHub API" / "AtendeHub Front") para sobreviverem à sessão.

## Convenções

- Commits: convencionais em PT (`fix(api): ...`, `feat(front): ...`,
  `docs: ...`), com ID do roadmap no título quando aplicável.
- Login demo local: `admin@demo.com` / `Admin@123` (real = mock).
- Front sem backend → modo demonstração com banner (nunca silencioso).
- Testes do front mockam `services/api` e `services/websocket` por módulo.
