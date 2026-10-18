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
                    ┌───────▼──┐  ┌───▼────┐   ┌───────────┐
                    │ postgres │  │ redis  │   │ evolution │
                    └──────────┘  └────────┘   └───────────┘

 Fora do servidor: Cloudflare R2 (bucket da mídia, B-64) — a API grava e
 assina; o nginx repassa media.<domínio> → R2. Não há MinIO em produção.
```

Sem container `web` separado — o front (Vite+React) é build estático,
servido direto pelo `nginx` (decisão B6-2).

**Portas (B-55):** em produção só o `nginx` publica portas (80/443). Postgres,
Redis, Evolution e API ficam só na rede interna `atendehub_net` —
nenhum deles é alcançável de fora do servidor. Não acrescente `ports` a esses
serviços no `docker-compose.prod.yml`: o Compose soma as listas ao combinar
arquivos, e o job `compose-ports` da CI recusa o PR. Para acessar um serviço
interno numa manutenção, use `docker compose exec` ou um túnel SSH, nunca uma
porta publicada.

**Sempre passe os dois `-f`** em produção (`-f docker-compose.yml -f
docker-compose.prod.yml`). Sem eles, o Compose carrega o
`docker-compose.override.yml` de desenvolvimento no lugar do override de
produção — um `up` recriaria o serviço sem as configurações de produção.

## Pré-requisitos de deploy

Todo o `.env` de produção (raiz, ao lado do `docker-compose.yml`) precisa
estar preenchido **antes** de subir — o boot da API e o `docker compose
config` falham rápido (fail-hard) e nomeiam a variável que falta, em vez de
cair silenciosamente num valor de desenvolvimento:

| Variável | Onde é validada | Falha se... |
|---|---|---|
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | `docker-compose.prod.yml` (`${VAR:?...}`) | ausente |
| `MEDIA_STORAGE_HOST` | `docker-compose.prod.yml` e boot do `nginx` (`infra/nginx/entrypoint/15-media-storage-host.sh`) | ausente, ou com esquema/porta — é só o host S3 do R2, ex. `<conta>.r2.cloudflarestorage.com` (B-64). Vira o `MINIO_ENDPOINT` da API e o upstream do nginx |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | `apps/api/src/shared/storage/storage.service.ts` (boot) | ausente — em produção são o **Access Key ID** e o **Secret Access Key** do token do R2 (o prefixo `MINIO_` é histórico) |
| `EVOLUTION_API_KEY`, `EVOLUTION_SERVER_URL`, `EVOLUTION_WEBHOOK_URL` | `docker-compose.prod.yml` | ausente — `EVOLUTION_WEBHOOK_URL` deve usar a rede interna (`http://api:3001/api/v1/webhooks/evolution`), já que a porta 3001 não é publicada |
| `SIGNUP_ENABLED`, `SIGNUP_DAILY_LIMIT_PER_IP` (B-85) | `docker-compose.prod.yml` | opcional — `SIGNUP_ENABLED=false` desliga o cadastro público de empresas; o teto diário por IP tem padrão 5 |
| `VITE_API_URL`, `VITE_WS_URL` | `docker-compose.prod.yml` (build args do `nginx`) | ausente — reflete no **build**, não dá pra trocar depois sem rebuildar a imagem |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | `apps/api/src/main.ts` (`validateSecrets`) | ausente, < 32 chars, ou contém placeholder inseguro conhecido |
| `CORS_ORIGINS` | `apps/api/src/main.ts` (`validateCorsOrigins`) | ausente ou `*` |
| `MINIO_PUBLIC_ENDPOINT` | `apps/api/src/shared/storage/storage.service.ts` (boot) | ausente ou sem `https://` — deve ser o host de mídia, ex. `https://media.atendehub.com` (B-59) |

Gerar secrets fortes: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`.

**Opcional:** `SENTRY_DSN` (backend, `.env` da raiz) e `VITE_SENTRY_DSN`
(frontend, build arg do `nginx`) — monitoramento de erros (B-18). Sem
preencher, o Sentry não é inicializado (no-op seguro, não bloqueia o
deploy). Ver seção própria abaixo.

Certificados SSL: colocar `fullchain.pem`/`privkey.pem` em `infra/nginx/certs/`
(montado como volume no serviço `nginx`) antes do primeiro `up`. O certificado
precisa cobrir os **três** hosts: `app.`, `api.` e `media.` (B-59), e o DNS dos
três precisa apontar para o servidor. A renovação
ainda é manual (automação ACME pendente no B-43): certificado vencido derruba
app e API ao mesmo tempo — agendar a troca antes do vencimento.

**nginx (B-43):**
- Os domínios `app.atendehub.com` e `api.atendehub.com` estão no `server_name`
  do `infra/nginx/nginx.conf` **e** na CSP do
  `infra/nginx/security-headers.conf` (`connect-src`). Trocar o domínio exige
  ajustar os dois e rebuildar a imagem do `nginx` — esquecer a CSP deixa o
  front sem conseguir falar com a API (erro de CSP no console do navegador).
- Limite por IP no nginx: 20 req/s (pico de 100) no geral e 30/min (pico de
  30) em `/api/v1/auth/`; acima disso responde 429. Se um balanceador ou CDN
  entrar na frente do nginx, configurar `set_real_ip_from` com a faixa dele —
  senão todos os clientes viram um único IP e o limite passa a valer para a
  plataforma inteira.
- Host desconhecido (inclusive acesso pelo IP do servidor) é recusado: 444 no
  HTTP e handshake TLS recusado no HTTPS.

**Mídia (B-59, B-64):** fotos, áudios e documentos do chat são baixados pelo
navegador em `https://media.<domínio>/<bucket>/...`, com URL assinada pela API
(válida por `MEDIA_SIGNED_URL_EXPIRATION`, padrão 600 s). A API assina com o
host do R2 e troca só a origem da URL pela do `MINIO_PUBLIC_ENDPOINT`; o nginx
repassa ao R2 só GET/HEAD no caminho do bucket (`/atendehub-media/`), com o
`Host` de volta ao do R2 e TLS verificado; o resto responde 404. Trocar o
domínio de mídia exige ajustar `server_name` do bloco `media.` no `nginx.conf`,
`img-src`/`media-src` no `security-headers.conf` e `MINIO_PUBLIC_ENDPOINT`;
trocar o `MINIO_BUCKET` exige ajustar o `location` do bloco `media.`. Sintomas:
- imagem quebrada com **403** (`SignatureDoesNotMatch`): o host assinado não é o
  que o R2 recebeu — `MEDIA_STORAGE_HOST` diferente do host do R2, ou token de
  outra conta;
- imagem quebrada com **502**: o nginx não alcança o R2 (DNS ou TLS) — ver
  `docker compose ... logs nginx`;
- erro de CSP no console do navegador: domínio de mídia fora da CSP.

**Limite de requisições na API (B-56):**
- Atrás do nginx, a API calcula o IP do cliente pelo `X-Forwarded-For`
  (`TRUST_PROXY`, padrão 1 em produção). Se um balanceador entrar na frente do
  nginx, usar `TRUST_PROXY=2` — com o valor errado, ou todos os clientes viram
  um IP só (limite vale para a plataforma inteira), ou o cliente consegue
  escolher o próprio IP.
- Cota geral (`THROTTLE_LIMIT`/`THROTTLE_TTL`) por usuário autenticado; sem
  token, por IP. Login 5/min por IP; webhook da Evolution 1.200/min por
  instância de WhatsApp.
- O contador fica no Redis (chaves `throttle:*`). Com o Redis fora, a API
  libera as requisições sem limite (fail-open, log "Redis indisponível para o
  limite de requisições" no máximo uma vez por minuto) em vez de responder 500;
  o limite por IP do nginx continua valendo.
- Para liberar um bloqueio na hora (ex.: escritório inteiro travado no login):
  `docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis redis-cli -a $REDIS_PASSWORD --scan --pattern 'throttle:*:block' | xargs -r docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis redis-cli -a $REDIS_PASSWORD del`

### Storage de mídia (Cloudflare R2) — B-64

Em produção a mídia não fica no servidor: fica num bucket do Cloudflare R2. O
bucket é criado e mantido **privado** no painel do R2 — a API não cria bucket
nem mexe em política (`MINIO_MANAGE_BUCKET=false`, fixado no
`docker-compose.prod.yml`; o R2 nem implementa bucket policy).

> **Antes de subir mídia real de cliente da saúde**, ver a pendência 7 do
> [mapa de dados pessoais](../35-LGPD/MAPA-DE-DADOS-PESSOAIS.md): o R2 não tem
> região no Brasil (transferência internacional). A alternativa (AWS S3 em São
> Paulo) usa o mesmo código e o mesmo nginx.

Configuração (uma vez):
1. No painel do R2, criar o bucket `atendehub-media`. **Não** ligar acesso
   público (subdomínio `r2.dev` nem domínio próprio no bucket): a mídia só sai
   por URL assinada, pelo `media.<domínio>` — URL assinada do R2 nem funciona
   em domínio próprio.
2. Criar um token de API do R2 com permissão **Object Read & Write** só neste
   bucket. Ele mostra o Access Key ID e o Secret Access Key uma única vez.
3. No `.env` de produção:
   ```bash
   MEDIA_STORAGE_HOST=<conta>.r2.cloudflarestorage.com   # host S3 da conta, sem https://
   MINIO_ROOT_USER=<Access Key ID do token>
   MINIO_ROOT_PASSWORD=<Secret Access Key do token>
   MINIO_BUCKET=atendehub-media
   MINIO_REGION=auto
   MINIO_PUBLIC_ENDPOINT=https://media.<domínio>
   ```
   O `MINIO_ENDPOINT` da API sai do `MEDIA_STORAGE_HOST` (um valor no `.env` é
   ignorado em produção) — assim a API e o nginx nunca divergem de host.

Conferir depois do deploy — o log da API deve trazer `StorageService
inicializado — bucket: atendehub-media (gerenciado pelo provedor; ...)`, e este
teste, rodado no servidor, sobe uma imagem de 1 pixel, baixa pelo domínio de
mídia e apaga (validado contra o MinIO de dev em 2026-10-18):
```bash
P="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
URL=$($P exec -T api node -e '
const { StorageService } = require("./dist/shared/storage/storage.service");
const s = new StorageService({ get: (k, d) => process.env[k] ?? d });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
s.upload(png, "image/png", "smoke-b64").then((up) => s.presignUrl(up.url)).then((u) => console.log(u));
' | tail -1)
echo "$URL"                                           # https://media.<domínio>/atendehub-media/smoke-b64/...
curl -s -o /dev/null -w '%{http_code}\n' "$URL"       # tem de dar 200
KEY=$(echo "$URL" | sed -E 's#^https?://[^/]+/[^/]+/([^?]+).*#\1#')
$P exec -T api node -e '
const { StorageService } = require("./dist/shared/storage/storage.service");
new StorageService({ get: (k, d) => process.env[k] ?? d }).delete(process.argv[1]).then(() => console.log("apagado:", process.argv[1]));
' "$KEY"
```

**Evolution e storage:** a Evolution não grava mídia no bucket (a API baixa
cada mídia por ela, em base64, e guarda no bucket dela). Não ligar o S3 da
Evolution (`S3_ENABLED`) apontando para o bucket da API: no boot ela aplica
leitura **anônima** no bucket, a menos que `S3_SKIP_POLICY=true`. As variáveis
`STORAGE_*` que existiam no compose nunca tiveram efeito (a v2 só lê `S3_*`) e
foram removidas no B-64.

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

**Container da API (B-44):** roda como `node` (não root), com `tini` como PID
1 e `HEALTHCHECK` próprio em `/api/v1/health` — `docker ps` mostra
`(healthy)`, e o `nginx` só sobe depois disso. No `docker compose ... stop`/
deploy, a API recebe SIGTERM, fecha filas, Prisma e Redis e sai; tem 30 s
(`stop_grace_period`) antes do SIGKILL. Se o Redis não responder no boot, a
API sobe mesmo assim em até ~15 s (Socket.IO em instância única, limite de
requisições liberado) e o `/health/ready` responde 503 com `redis: down` —
antes ela travava sem abrir a porta e sem log.

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
usuários; perda é irreversível) e a **mídia** (fotos, áudios, documentos do
WhatsApp; perda é inconveniente, mas não paralisa o produto) — em produção no
Cloudflare R2, em desenvolvimento no MinIO local (B-64).
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

### Mídia em produção (R2)

Não há volume no servidor: o backup é uma **cópia do bucket** para outro lugar
(outra conta/provedor S3), por exemplo com `rclone sync` usando um remote do
tipo S3 com `provider = Cloudflare`, com uma chave **só de leitura** no bucket
de origem. Procedimento ainda não validado (sem conta R2 de teste) e sem
automação — entra junto da automação de backup pendente. A cópia guarda mídia
de titulares: segue a mesma política de descarte dos backups (pendência 2 do
mapa de dados pessoais).

### MinIO de desenvolvimento (bucket `atendehub-media`)

**Volume criado pela imagem antiga (B-64):** a imagem atual
(`bitnamilegacy/minio`) roda como UID 1001 e lê os dados em
`/bitnami/minio/data`; a oficial antiga (`minio/minio`) rodava como root em
`/data`. O volume é o mesmo (`atendehub_minio_data`) — só os donos dos arquivos
precisam mudar, uma vez:
```bash
docker compose stop minio && docker compose rm -f minio
MSYS_NO_PATHCONV=1 docker run --rm -v atendehub_minio_data:/data alpine chown -R 1001:1001 /data
docker compose up -d minio
```
Feito no ambiente de dev em 2026-10-18: 25 objetos preservados, bucket privado.
A imagem antiga continua lendo o volume (roda como root), então a troca tem
volta.

Nível de fidelidade do backup: cópia do volume Docker (`atendehub_minio_data`) via
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
  sh -c 'tar xzf /backup/minio_data_XXXXXXXX.tar.gz -C /data && chown -R 1001:1001 /data'
docker compose up -d minio
```

## Retenção de dados e LGPD (B-17)

> **Atualização 2026-10-17 (B-62):** a fonte atual é
> [`docs/35-LGPD/MAPA-DE-DADOS-PESSOAIS.md`](../35-LGPD/MAPA-DE-DADOS-PESSOAIS.md) — onde
> ficam os dados, o que a anonimização apaga e o **procedimento de purga da cópia na
> Evolution** (`infra/postgres/lgpd-purga-evolution.sql`), que não é automática. Os gaps
> B-29 e B-30 citados abaixo já foram fechados; esta seção fica como histórico do B-17.

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

### Trocar a `EVOLUTION_API_KEY` (rotação)
A mesma chave aparece em três lugares e os três precisam mudar juntos:
1. `.env` da raiz (vira `AUTHENTICATION_API_KEY` do container da Evolution);
2. `apps/api/.env` (a API usa para chamar a Evolution e para validar webhooks);
3. o `token` de cada instância já criada no banco `evolution` (tabela
   `"Instance"`) — o `EvolutionService#createInstance` usa a chave global
   como token da instância, e a Evolution manda esse token no campo
   `apikey` de cada webhook. Se só os `.env` mudarem, os webhooks das
   instâncias antigas passam a ser recusados com 403.

Passos (sem expor a chave em log ou terminal compartilhado):
1. Backup dos dois `.env` **fora do repositório**.
2. Gerar a chave nova (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   e gravá-la nos dois `.env`.
3. `UPDATE "Instance" SET token = '<nova>' WHERE token = '<antiga>';` no banco
   `evolution` (`docker exec -i atendehub_postgres psql -U atendehub -d evolution`).
4. `docker compose up -d evolution` (recria o container com a chave nova).
5. Reiniciar a API (`scripts/dev-api.ps1` em dev) para carregar o `.env` novo.
6. Conferir: `GET /instance/fetchInstances` responde 200 com a chave nova e
   401 com a antiga.

Última troca: 2026-10-16 (B-50), ambiente local.

### Mídia do WhatsApp corrompida/ilegível
- A URL de mídia que a Evolution recebe do WhatsApp é **criptografada**
  (sufixo `.enc`) — baixar direto salva lixo. O código usa exclusivamente
  `getBase64FromMediaMessage` da Evolution (mídia decriptada). Desde o B-50
  não existe caminho alternativo: se a Evolution não devolver a mídia, a
  mensagem fica sem anexo e o log registra
  `Não foi possível baixar mídia para msg <id>`. Nunca reintroduzir download
  da URL que vem no conteúdo da mensagem.

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

### Nível de log em produção
- Em produção o nível é `info` (B-52): `log`, `warn` e `error` do Nest saem
  em JSON, um objeto por linha; `debug` nunca sai, porque pode carregar dado
  pessoal (telefone, conteúdo de mensagem). O nível é definido uma vez, no
  boot, por `buildWinstonOptions` em `apps/api/src/shared/logging/winston.logger.ts`
  a partir de `NODE_ENV`.
- **Nenhuma linha de log em produção:** era o sintoma do B-52 (nível com um
  nome que o Winston não conhece, que fazia ele descartar tudo — inclusive o
  erro de segredo inválido antes do `process.exit(1)` no boot). Se voltar a
  acontecer, conferir o nível em `winston.logger.ts`; o teste
  `winston.logger.spec.ts` existe para pegar exatamente isso.
- **`debug` aparecendo em produção:** confirmar que `NODE_ENV=production` está
  de fato setado no container; se estiver, é regressão em `winston.logger.ts`.
