# CLAUDE.md — Guia do projeto AtendeHub

Central de atendimento multiatendente via WhatsApp (SaaS multi-tenant).
**Idioma do projeto: PT-BR** — respostas, commits e documentação em português.

## 📌 Fontes de verdade (leia antes de trabalhar)

1. **`ROADMAP_ESTABILIZACAO.md`** (raiz) — painel curto e canônico: onde estamos,
   próximos passos, itens abertos e o backlog em uma linha por item. O detalhe de
   cada item, as decisões e o changelog ficam em
   `docs/03-Roadmap/ROADMAP-HISTORICO.md` (B-90). **Regras:** todo problema novo
   vira item com ID antes de ser corrigido (linha curta no painel + linha
   detalhada no histórico); todo item concluído exige evidência no changelog do
   histórico; atualizar "Onde estamos" e "Próximos passos" ao fim de cada sessão.
2. **`ROADMAP_BACKEND.md`** (raiz) — documento vivo com foco exclusivo em
   `apps/api`, Prisma/PostgreSQL e filas (Bull/Redis). Criado em 2026-07-21:
   decisão de fechar todo o backend e banco antes de retomar o frontend.
   Mesmas regras de documento vivo do item acima.
3. **`docs/09-APIs/API_CONTRACT.md`** — contrato real da API (shapes, enums, eventos
   socket). Atualizar no mesmo commit que alterar um endpoint.
4. `docs/99-Arquivo/` — relatórios históricos; **não** são fonte de verdade.

## Arquitetura

- **Front** (raiz): Vite 6 + React 19 **JavaScript** (decisão F5-3: permanece
  Vite+React), sem JSX transform manual — componentes usam
  `createElement as h`. Socket.IO client. Dev na porta **3000**.
  - `src/services/api.js` — ApiClient (REST, fallback mock só em dev, classe
    `ApiError`); `src/services/websocket.js` — wsClient (namespace `/ws`)
  - `src/services/sessionRefresh.js` — renovação de sessão (B-53): guarda o
    refresh token rotacionado e faz uma renovação por vez para o app inteiro;
    401 de login/cadastro/refresh não dispara renovação
  - `src/hooks/useConversations.js` — estado das conversas + normalizadores
    `toUiConversation`/`toUiMessage` (contrato API → shape da UI)
  - `src/components/icons.jsx` — TODO ícone vem do **svgrepo.com** (coleção
    Tabler Icons); **nunca** emoji na UI
- **Back** (`apps/api`): NestJS + Prisma + PostgreSQL, Redis/Bull, storage S3
  (MinIO em dev, Cloudflare R2 em produção — B-64), Socket.IO gateway.
  Porta **3001**, prefixo `/api/v1`.
  - Multi-tenant: **toda** query filtra por `companyId`; o RLS do Postgres é a
    rede de proteção nas requisições autenticadas (B-83). Escapes de propósito
    usam `runAsSystem` (e precisam de `await` dentro — a consulta do Prisma é
    preguiçosa)
  - `ValidationPipe` com `forbidNonWhitelisted` — campo extra no body = 400
- **Evolution API** (Docker, porta 8080) faz a ponte com o WhatsApp; fala com
  a API pelo webhook global da Evolution (`/api/v1/webhooks/evolution`; chave no
  campo `apikey` do corpo ou no header `x-evolution-signature` — B-82/B-88).

## Comandos

```bash
# Front (na raiz)
npm run dev          # dev server porta 3000
npm run lint         # ESLint do front (sem console.log fora de teste — B-103)
npm test             # Jest (contagens: node scripts/project-stats.mjs)
npm run build        # vite build

# Back (apps/api)
npm run start:dev    # watch | npm run start = dist
npm run build        # nest build
npm run db:migrate   # prisma migrate dev
npm run db:seed      # seed (senha do admin é ALEATÓRIA → .seed-credentials-*.txt)
npm run db:studio    # Prisma Studio :5555

# Infra (na raiz)
docker compose up -d         # postgres, redis, evolution + minio (só dev; portas em 127.0.0.1,
                             # via docker-compose.override.yml — B-55)
```

## Pitfalls conhecidos (custaram sessões de debug)

1. **`.env` da raiz** precisa de `EVOLUTION_API_KEY` idêntica à de
   `apps/api/.env` — o compose lê a da raiz; sem ela, API→Evolution = 401.
2. **Mídia do WhatsApp é criptografada** — baixar a URL `.enc` direto salva
   lixo; sempre usar `getBase64FromMediaMessage` da Evolution.
3. **Evolution não resolve `localhost:9000`** — mídia enviada a ela vai em
   base64; a URL do MinIO é só para o painel.
4. Em dev no Windows, API e front rodam em janelas próprias minimizadas
   ("AtendeHub API" / "AtendeHub Front") para sobreviverem à sessão. **Sempre
   subir via `scripts/dev-api.ps1`/`scripts/dev-front.ps1`** (nunca
   `Start-Process ... npm run start:dev` direto) — os scripts matam qualquer
   instância anterior antes de subir a nova. Sem isso, duas janelas da mesma
   API acabam concorrendo pela porta 3001/3000: uma fica com o processo vivo
   mas sem responder, e a API "cai" sem nenhum erro visível (B-37).
   ```powershell
   Start-Process powershell -ArgumentList '-NoExit','-File','C:\...\scripts\dev-api.ps1' -WindowStyle Minimized
   Start-Process powershell -ArgumentList '-NoExit','-File','C:\...\scripts\dev-front.ps1' -WindowStyle Minimized
   ```

## Convenções

- Commits: convencionais em PT (`fix(api): ...`, `feat(front): ...`,
  `docs: ...`), com ID do roadmap no título quando aplicável.
- Login demo local: `admin@demo.com` / `Admin@123` (real = mock).
- Front sem backend → modo demonstração com banner (nunca silencioso).
- Testes do front mockam `services/api` e `services/websocket` por módulo.
