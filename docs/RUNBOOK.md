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
