# 🛠️ Runbook — AtendeHub em produção

> Escopo: deploy, rollback, reset de filas e troubleshooting do que já
> aconteceu de verdade neste projeto. Não é um manual genérico — cada item
> de troubleshooting tem uma causa raiz registrada no `ROADMAP_BACKEND.md`.

## Topologia

```
                        ┌────────────────────────┐
 Internet ── 80/443 ──▶ │  nginx (SSL + estático) │
                        │  - serve o front (SPA)  │
                        │  - proxy_pass → api     │
                        └───────────┬─────────────┘
                                    │
                        ┌───────────▼─────────────┐
                        │   api (NestJS, :3001)   │
                        └───┬─────────┬───────────┘
                            │         │
                    ┌───────▼──┐  ┌───▼────┐   ┌───────┐   ┌───────────┐
                    │ postgres │  │ redis  │   │ minio │   │ evolution │
                    └──────────┘  └────────┘   └───────┘   └───────────┘
```

Sem container `web` separado — o front (Vite+React) é build estático,
servido direto pelo `nginx` (decisão B6-2).

## Pré-requisitos de deploy

Todo o `.env` de produção (raiz, ao lado do `docker-compose.yml`) precisa
estar preenchido **antes** de subir — o boot da API e o `docker compose
config` falham rápido (fail-hard) e nomeiam a variável que falta, em vez de
cair silenciosamente num valor de desenvolvimento:

| Variável | Onde é validada | Falha se... |
|---|---|---|
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | `docker-compose.prod.yml` (`${VAR:?...}`) | ausente |
| `EVOLUTION_API_KEY`, `EVOLUTION_SERVER_URL`, `EVOLUTION_WEBHOOK_URL` | `docker-compose.prod.yml` | ausente |
| `VITE_API_URL`, `VITE_WS_URL` | `docker-compose.prod.yml` (build args do `nginx`) | ausente — reflete no **build**, não dá pra trocar depois sem rebuildar a imagem |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | `apps/api/src/main.ts` (`validateSecrets`) | ausente, < 32 chars, ou contém placeholder inseguro conhecido |
| `CORS_ORIGINS` | `apps/api/src/main.ts` (`validateCorsOrigins`) | ausente ou `*` |

Gerar secrets fortes: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.

**Opcional:** `SENTRY_DSN` (backend, `.env` da raiz) e `VITE_SENTRY_DSN`
(frontend, build arg do `nginx`) — monitoramento de erros (B-18). Sem
preencher, o Sentry não é inicializado (no-op seguro, não bloqueia o
deploy). Ver seção própria abaixo.

Certificados SSL: colocar `fullchain.pem`/`privkey.pem` em `infra/nginx/certs/`
(montado como volume no serviço `nginx`) antes do primeiro `up`.

## Deploy

```bash
# 1. Puxar a versão desejada
git pull origin master   # ou checkout de uma tag específica

# 2. Build das imagens (api + nginx/front) — falha cedo se faltar secret
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# 3. Rodar migrations pendentes (Prisma) ANTES de subir a API nova
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api \
  npm run db:migrate:prod

# 4. Subir
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 5. Confirmar saúde
curl -f https://api.SEUDOMINIO.com/api/v1/health/ready
```

`GET /health` é liveness (processo de pé, não checa dependência).
`GET /health/ready` checa PostgreSQL e Redis de verdade — usar este para
health-check de orquestrador/load balancer, não o `/health`.

## Rollback

**Aplicação (sem mudança de schema):** voltar pra tag/commit anterior e
repetir os passos 2 e 4 do deploy. Como o front é build estático assinado
pela mesma imagem do `nginx`, front e API sempre andam juntos na mesma
versão — não existe risco de front novo falando com API antiga incompatível
(a menos que a mudança de schema quebre compatibilidade, ver abaixo).

**Com migration aplicada:** Prisma não gera migration de "descer" automática
— `prisma migrate deploy` só aplica pra frente. Se uma migration quebrar
produção:
1. Não dar rollback de código sem antes avaliar se o schema novo é
   compatível com o código antigo (na dúvida, não é).
2. Escrever uma migration nova que desfaz a mudança (ex.: recriar a coluna
   removida), nunca editar/apagar uma migration já aplicada em produção.
3. Só depois voltar o código.

## Backup e restore (B-10)

Dois alvos: **PostgreSQL** (dado principal — empresas, conversas, mensagens,
usuários; perda é irreversível) e **MinIO** (mídias do WhatsApp — fotos,
áudios, documentos; perda é inconveniente, mas não paralisa o produto).
Comandos abaixo testados de verdade contra o ambiente local desta sessão
(dump restaurado num banco separado, contagem de linhas conferida igual;
tarball do MinIO extraído e validado).

### PostgreSQL

O mesmo Postgres hospeda **dois bancos**: `atendehub` (a API, prioridade —
schema custom `atendehub`, não `public`) e `evolution` (sessões/instâncias
do WhatsApp via Evolution API — perder esse banco não é catastrófico, o
WhatsApp é re-pareado via QR; ainda assim, incluído abaixo por completude).

**Backup** (formato `-Fc`, comprimido e restaurável seletivamente com `pg_restore`):
```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d atendehub -Fc \
  > "backups/atendehub_$(date +%Y%m%d_%H%M%S).dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d evolution -Fc \
  > "backups/evolution_$(date +%Y%m%d_%H%M%S).dump"
```
No Git Bash/Windows, redirecionar a saída (`>`) para um arquivo do host
evita problemas de conversão de caminho POSIX↔Windows do `-f` do próprio
`pg_dump` dentro do container.

**Restore** — banco novo/vazio (servidor novo, disaster recovery):
```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE atendehub;"
cat backups/atendehub_XXXXXXXX.dump | \
  docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d atendehub --no-owner --no-privileges
```
**Restore por cima de um banco com dado vivo** (ex.: corrupção parcial, não
disaster recovery total): usar `--clean --if-exists` no `pg_restore` — isso
**apaga** as tabelas existentes antes de recriar. Rodar num banco de teste
primeiro (`... -d atendehub_verificacao`) pra conferir a contagem de linhas
antes de apontar pro banco real; nunca restaurar direto em cima de produção
sem essa checagem.

Depois de restaurar: `npx prisma migrate deploy` (dentro do container `api`)
antes de subir a API — o dump é só o dado, não garante que o schema bate com
a versão do código que vai rodar.

### MinIO (bucket `atendehub-media`)

Nível de fidelidade: cópia do volume Docker (`atendehub_minio_data`) via
container Alpine descartável — mais simples que `mc mirror` (o projeto já
apanhou de `minio/mc` uma vez, B-5: a tag da imagem sumiu do Docker Hub no
meio de um `docker compose up`) e suficiente porque mídia do WhatsApp é
escrita uma vez e nunca alterada depois.

```bash
mkdir -p backups
docker run --rm -v atendehub_minio_data:/data -v "$(pwd)/backups":/backup alpine \
  tar czf /backup/minio_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```
> No Git Bash/Windows, prefixar com `MSYS_NO_PATHCONV=1` se o comando falhar
> com caminho tipo `C:/Program Files/Git/data` — o Git Bash tenta "corrigir"
> os caminhos `/data`/`/backup` (que são caminhos **dentro do container**,
> não do Windows) antes de repassar pro Docker.

**Ressalva honesta:** isso é uma cópia de arquivo, não um backup S3-nativo —
tirado com o MinIO rodando ao vivo, existe uma janela (pequena, mas real)
de pegar um arquivo no meio da escrita se um upload estiver em andamento
naquele instante exato. Pra backup crítico/agendado, rodar em horário de
baixo tráfego é suficiente pra esse porte de projeto; não vale a
complexidade de pausar o container só por causa disso.

**Restore:**
```bash
docker volume create atendehub_minio_data   # se o volume não existir mais
docker run --rm -v atendehub_minio_data:/data -v "$(pwd)/backups":/backup alpine \
  tar xzf /backup/minio_data_XXXXXXXX.tar.gz -C /data
docker compose up -d minio
```

## Retenção de dados e LGPD (B-17)

O produto processa PII de terceiros via WhatsApp (nome, telefone, mídia,
conteúdo de conversa) sem nenhum consentimento explícito coletado — dados
chegam via webhook da Evolution API a partir do próprio uso do WhatsApp
pelo cliente final. É relevante pra LGPD por ser um produto brasileiro que
processa dado pessoal de titular que não é o contratante.

### O que é retido, e por quanto tempo

| Dado | Onde vive | Retenção hoje |
|---|---|---|
| Contato (nome, telefone, e-mail, foto) | Postgres, tabela `contacts` | Indefinida — sem expiração automática |
| Conversas e mensagens | Postgres, tabelas `conversations`/`messages` | Indefinida — sem expiração automática |
| Mídia (foto, áudio, documento do WhatsApp) | MinIO, bucket `atendehub-media` | Indefinida — **nunca é apagada**, nem quando a mensagem/conversa/contato é apagado/anonimizado (`StorageService#delete` existe mas não é chamado em nenhum lugar do código) |
| Logs de auditoria (`audit_logs`) | Postgres | Indefinida — sem TTL/purga; só desaparece se a `Company` inteira for removida (cascade), o que não é uma operação exposta hoje |

**Não existe hoje** nenhuma rotina automática (cron/job) de expiração de
conversa, mensagem ou mídia — confirmado lendo todo `apps/api/src` em busca
de `@Cron`/`@Interval`: o único cron do projeto é a limpeza de refresh
tokens expirados (`refresh-token-cleanup.service.ts`), que não tem relação
com dado de titular.

### Direito de exclusão do titular (`DELETE /contacts/:id`)

**Concluído nesta sessão, junto com a documentação** (ver B-28 no backlog):
a rota existia desde antes, mas fazia hard delete (`prisma.contact.delete`)
sem cascade configurado em `Conversation.contact` — na prática, **quebrava
com violação de FK pra qualquer contato que já tivesse uma conversa**, ou
seja, o único mecanismo de atendimento a uma solicitação de exclusão nunca
funcionava de verdade para o caso comum. Corrigido: a rota agora
**anonimiza** em vez de apagar — `name` vira `"Contato removido"`,
`phone`/`email`/`avatarUrl`/`metadata` são zerados/substituídos,
`anonymizedAt` é preenchido, e o registro (com seu histórico de
conversas/mensagens) permanece intacto. Restrita a `ADMIN+` (antes
qualquer usuário autenticado podia chamar); idempotente (recusa com 400
se já estiver anonimizado); auditada como `contact.anonymized`.

Decisão consciente: **anonimizar, não apagar de verdade** — LGPD (art. 16)
permite reter dado após solicitação de exclusão quando há motivo
legítimo (aqui, o histórico de atendimento da empresa), desde que
anonimizado. Apagar a conversa inteira destruiria histórico de negócio que
não pertence só ao titular (ex.: a resposta do atendente).

**Gaps conhecidos, registrados como itens novos de backlog (não corrigidos
nesta sessão):**
- **B-29** — a mídia do contato anonimizado permanece acessível no MinIO
  (a URL pública não expira nem é invalidada) mesmo depois da PII do
  contato ser removida do Postgres.
- **B-30** — não existe nenhum endpoint de exportação/portabilidade
  (LGPD art. 18, IV/V). Hoje, atender uma solicitação desse tipo é
  manual: um `ADMIN` consulta `GET /contacts/:id` (dados do contato +
  últimas 10 conversas) e `GET /conversations/:id/messages` de cada
  conversa relevante, e monta a resposta a mão.

### Processo hoje (enquanto B-29/B-30 não são resolvidos)

1. **Exclusão**: `DELETE /contacts/:id` (autenticado como `ADMIN`) — cobre o
   caso comum de verdade agora (antes falhava silenciosamente com 500 pra
   contato com histórico).
2. **Portabilidade/acesso**: manual — `GET /contacts/:id` + `GET
   /conversations?...` filtrando pelo `contactId` + `GET
   /conversations/:id/messages` de cada uma, compilados por um `ADMIN`.
3. **Mídia**: não há como purgar isoladamente hoje — fica registrado como
   limitação até B-29 ser resolvido.

## Reset de filas (Bull/Redis)

As duas filas do projeto são `webhook` e `sla-check` (a fila de envio de
mensagem foi removida — decisão B2-1, envio é síncrono). A conexão Bull usa
`keyPrefix: 'bull:'` no nível do client ioredis (`app.module.ts`) — **não**
é a opção `prefix` do Bull em si, então as chaves reais no Redis saem como
`bull::<queue>:<sufixo>` (com dois-pontos duplicado — confirmado rodando
`--scan` de verdade: `bull::webhook:id`). Qualquer script que for mexer
nessas filas precisa usar exatamente essa mesma opção pra enxergar as chaves
certas.

**Inspecionar sem mexer:**
```bash
docker compose exec redis redis-cli -a $REDIS_PASSWORD --scan --pattern 'bull*' | head -50
```

**Limpar uma fila travada** (jobs presos com o mesmo `jobId` determinístico
impedindo um novo agendamento — mesmo sintoma encontrado ao escrever o teste
E2E do SLA, ver B2-5 no `ROADMAP_BACKEND.md`): não dá pra fazer via
`redis-cli` com segurança (é preciso passar pelo cliente Bull pra limpar
listeners/locks corretamente). Rodar um script one-off dentro do container
da API — **validado de verdade nesta sessão** contra o Redis local:

```bash
docker compose exec api node -e "
const Queue = require('bull');
const q = new Queue('webhook', { redis: { host: 'redis', password: process.env.REDIS_PASSWORD, keyPrefix: 'bull:' } });
q.obliterate({ force: true }).then(() => { console.log('ok'); process.exit(0); });
"
```
Trocar `'webhook'` por `'sla-check'` conforme a fila. **Isso apaga jobs
pendentes de verdade** — um `sla-check` obliterado perde o alerta de SLA
daquela conversa (ela só vai ser verificada de novo na próxima mudança de
status). Usar só quando a fila está genuinamente travada, não como rotina.

## Monitoramento de erros (B-18)

O winston (B6-3) cobre logs estruturados, mas não agrupa exceções nem
alerta — antes do B-18 não existia nenhuma captura de erro em produção além
de vasculhar log manualmente. Backend e frontend cada um manda pro seu
próprio projeto Sentry (ou GlitchTip self-hosted — o SDK é o mesmo,
`@sentry/node`/`@sentry/react`, só muda o DSN).

**Configurar:** criar um projeto Node.js (backend) e um React (frontend) em
sentry.io (ou instância própria de GlitchTip), preencher `SENTRY_DSN` no
`.env` da raiz e `VITE_SENTRY_DSN` (build arg do `nginx`, ver "Pré-requisitos
de deploy"). **Sem preencher, o SDK não é inicializado — no-op seguro, não
bloqueia boot nem build.**

**O que é capturado:**
- Backend: `SentryExceptionFilter` (`shared/monitoring/sentry.ts`) — só
  exceções inesperadas (5xx / erro não tratado). `HttpException` com status
  < 500 (validação, 404, 409...) é fluxo normal da aplicação, não vira
  evento — senão o Sentry vira ruído.
- Frontend: `ErrorBoundary` (B-12) reporta todo erro de render não
  capturado, além dos `window.onerror`/`unhandledrejection` globais que o
  SDK do Sentry já instrumenta sozinho.

**Privacidade (mesma cautela de B-17/B-28/B-29/B-30):** `beforeSend` em
ambos os lados remove `request.data`/`cookies` do evento antes de enviar —
o corpo de uma requisição pode conter telefone/conteúdo de mensagem de
cliente. Só stack trace e metadata técnica saem da sua infra.

## Troubleshooting

### API não sobe / conexão recusada
- Ver o log de boot primeiro — `validateSecrets`/`validateCorsOrigins`
  (`main.ts`) fazem `process.exit(1)` com uma mensagem `❌ FALHA CRÍTICA`
  nomeando exatamente a variável de ambiente que falta ou está fraca.
  Isso é intencional (B5-1/B5-5) — não é bug, é a validação de boot
  funcionando.

### `docker compose build` falha no serviço `nginx`/`api`
- Confira se todas as variáveis da tabela de pré-requisitos estão no `.env`
  da raiz — o build falha citando a variável, não com um erro genérico de
  Docker.

### Evolution API retorna 401 nos webhooks
- `EVOLUTION_API_KEY` do `.env` da raiz (lido pelo `docker-compose.yml`)
  precisa ser **idêntica** à de `apps/api/.env` — o compose sobe a Evolution
  com uma chave e a API valida webhooks com outra se elas divergirem.

### Mídia do WhatsApp corrompida/ilegível
- A URL de mídia que a Evolution recebe do WhatsApp é **criptografada**
  (sufixo `.enc`) — baixar direto salva lixo. O código já usa
  `getBase64FromMediaMessage` da Evolution (mídia decriptada); se voltar a
  acontecer, o bug está em algum caminho que passou a baixar a URL direta de
  novo.

### Evolution não entrega mídia enviada pelo painel
- O container da Evolution não resolve `localhost:9000` (MinIO) — mídia
  enviada a ela precisa ir em **base64**, nunca como URL. A URL do MinIO é
  só pro navegador do atendente.

### SLA parou de disparar / notificação de SLA sumiu
- Confirmar que o processor está registrado: log de boot deve mostrar
  `SlaModule dependencies initialized`. Se sim, verificar se a fila
  `sla-check` não está com jobs travados (ver seção de reset acima) — jobs
  com o mesmo `jobId` determinístico (`sla-check:<conversationId>`) presos
  de uma execução anterior bloqueiam o agendamento do próximo.

### Logs sem `requestId` / não corr elacionam
- O `requestId` só existe dentro do ciclo de vida de uma requisição HTTP
  (via `AsyncLocalStorage`, `apps/api/src/shared/logging/`). Logs emitidos
  no boot da aplicação (antes de qualquer requisição) ou por um cron
  (`RefreshTokenCleanupService`, `@Cron`) legitimamente não têm `requestId`
  — não é bug.

### Nível `debug` aparecendo em produção
- Não deveria: `main.ts` calcula o nível do winston uma vez, no boot, com
  base em `NODE_ENV`. Confirmar que `NODE_ENV=production` está de fato
  setado no ambiente do container — se estiver e ainda assim aparecer
  `debug`, é regressão em `winston.logger.ts`.
