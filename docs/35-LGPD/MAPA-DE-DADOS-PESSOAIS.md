# Mapa de dados pessoais — AtendeHub

- **Status:** rascunho técnico (B-62, 2026-10-17). Descreve **o que o sistema faz**. Base legal,
  prazos de retenção e subprocessadores são decisões do encarregado de dados com apoio jurídico
  (ver [README](README.md)) e estão listados como pendências no fim.
- **Fonte:** leitura do código e dos bancos de desenvolvimento em 2026-10-17.

## 1. Onde ficam os dados pessoais

O titular típico é o **cliente final** que conversa pelo WhatsApp com uma empresa cliente do
AtendeHub — não é o contratante.

| Dado | Onde | Observação |
|---|---|---|
| Nome, telefone (ou identificador `@lid`), e-mail, foto do contato | Postgres `atendehub.contacts` | Foto é URL da CDN do WhatsApp (`pps.whatsapp.net`) |
| Conteúdo das mensagens | Postgres `atendehub.messages.content` | Texto livre — pode conter qualquer dado |
| Telefone de origem da mensagem | `messages.metadata.remoteJid` | Removido na anonimização (B-62) |
| Mídia (foto, áudio, vídeo, documento) | Bucket `atendehub-media`, pasta da empresa — em produção no **Cloudflare R2** (B-64), em desenvolvimento num MinIO local | Apagada na anonimização (B-29). Fora do Brasil em produção — pendência 7 |
| Nome do contato em notificações | Postgres `notifications.body` | Substituído na anonimização (B-62) |
| Notas internas dos atendentes | Postgres `internal_notes` | Texto livre escrito pela equipe |
| Auditoria | Postgres `audit_logs` | A anonimização não grava mais os dados apagados (B-62) |
| **Cópia integral na Evolution** | Banco `evolution` (tabelas `Message`, `Contact`, `Chat`, `MessageUpdate`, `IsOnWhatsapp`). O JSON das mensagens de mídia traz a **miniatura da imagem** (`jpegThumbnail`) e a **chave da mídia** (`mediaKey`), com que o arquivo pode ser baixado do WhatsApp enquanto ele o mantiver | Gravada pela Evolution (`DATABASE_SAVE_*`). Ela **não** grava arquivos de mídia no bucket: o S3 dela nunca esteve ligado (tabela `Media` vazia; no dev, 2.232 mensagens com miniatura — conferido no B-64). **Não é alcançada pela anonimização automática** — ver seção 4 |
| Usuários da empresa (atendentes) | Postgres `users` (nome, e-mail, hash de senha) | Dado do contratante, não do cliente final |
| Logs da aplicação | stdout do container (JSON) | Nível `debug` (que inclui telefone) é bloqueado em produção |
| Erros enviados ao Sentry | Sentry (se `SENTRY_DSN` configurado) | `beforeSend` remove corpo de requisição; ver `shared/monitoring/sentry.ts` |
| Backups | Arquivos `pg_dump` (RUNBOOK); da mídia de produção, a cópia do bucket do R2 (RUNBOOK, B-64) | Mantêm os dados até serem descartados |

Mensagens de **grupos** do WhatsApp não entram no AtendeHub (são ignoradas no webhook), mas
**ficam na cópia da Evolution**.

## 2. Atendimento ao titular

| Pedido | Como atender | Quem |
|---|---|---|
| Acesso / portabilidade (art. 18, II e V) | `GET /contacts/:id/export` — JSON com cadastro, tags, conversas, mensagens e anexos (URLs assinadas válidas por `MEDIA_SIGNED_URL_EXPIRATION`, padrão 10 min: baixar os arquivos antes de entregar) | ADMIN |
| Eliminação (art. 18, VI) | `DELETE /contacts/:id` — **anonimiza** (ver abaixo) **e** rodar a purga da Evolution (seção 4) | ADMIN + operação |

**O que a anonimização faz** (`ContactService#remove`):

1. Contato: nome vira "Contato removido"; telefone, e-mail, foto e metadata são substituídos ou
   apagados; `anonymizedAt` preenchido.
2. Mídia das conversas do contato: objetos apagados do MinIO e linhas de `attachments` removidas.
3. `messages.metadata.remoteJid` removido de todas as mensagens das conversas do contato.
4. Texto das notificações ligadas às conversas do contato vira "Contato removido".
5. Auditoria `contact.anonymized` registra **quais campos** foram anonimizados e as contagens —
   nunca os valores.

**Preservado de propósito** (decisão do B-17): o conteúdo das mensagens e as conversas, como
histórico de atendimento da empresa. Se o titular tiver escrito dados pessoais no texto das
mensagens, eles permanecem — ponto a confirmar com o jurídico (pendência 3).

## 3. O que não é apagado automaticamente

- **Cópia na Evolution** (banco, com miniaturas e chaves de mídia): procedimento manual na seção 4.
- **Backups**: seguem a política de descarte dos backups (pendência 2).
- **Logs** e **Sentry**: seguem a retenção de cada ferramenta.
- **Contato bloqueado**: as mensagens dele são descartadas no webhook, sem gravar nada no
  AtendeHub (a Evolution ainda guarda a cópia).

## 4. Purga na Evolution (manual)

A Evolution guarda o número em várias formas: `remoteJid`, `remoteJidAlt`, `participant` e
`participantAlt`, com ou sem sufixo de dispositivo (`5511999999999:12@s.whatsapp.net`), em
conversas diretas e em grupos. O script
[`infra/postgres/lgpd-purga-evolution.sql`](../../infra/postgres/lgpd-purga-evolution.sql)
cobre todas essas formas e termina em `ROLLBACK` — primeiro confere, depois troca por `COMMIT`.

```bash
# 1. Conferir (nada é apagado — o script termina em ROLLBACK)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d evolution -v ON_ERROR_STOP=1 \
  -v numero=5511999999999 \
  -v instancias=sessao-atual,sessao-antiga \
  -f - < infra/postgres/lgpd-purga-evolution.sql
```

- `numero`: só dígitos. `instancias`: **todas** as conexões da empresa, inclusive as antigas —
  listar com `SELECT name FROM "Instance";` no banco `evolution`.
- A Evolution não grava arquivos de mídia no bucket (tabela `Media` vazia, B-64). Se a saída
  listar algum, apagar esses objetos antes do `COMMIT`.
- Para apagar de fato: trocar `ROLLBACK;` por `COMMIT;` numa cópia do script e rodar de novo.

Validado no ambiente de desenvolvimento em 2026-10-17 (com `ROLLBACK`): para um número de
teste, 62 mensagens em duas instâncias (uma delas antiga), 14 atualizações de status, 3
contatos e 2 registros de `IsOnWhatsapp`. Uma versão que olhava só `remoteJid` encontrava 0.

## 5. Pendências — decisão do encarregado/jurídico

1. **Base legal** de cada tratamento (atendimento ao cliente, histórico, auditoria).
2. **Prazos de retenção** — hoje nada expira: conversas, mensagens, mídia, auditoria, backups e a
   cópia da Evolution ficam indefinidamente. Com prazos definidos, a engenharia implementa a purga
   automática.
3. **Conteúdo das mensagens** na eliminação: preservar como histórico (como hoje) ou apagar.
4. **Cópia da Evolution**: manter `DATABASE_SAVE_*` ligado (necessário hoje para baixar mídia
   pela Evolution) ou reduzir o que ela guarda; automatizar a purga da seção 4.
5. **Subprocessadores** (Meta/WhatsApp, provedor de hospedagem, Sentry e, desde o B-64, a
   Cloudflare, que guarda a mídia de produção no R2) e contrato de processamento com as
   empresas clientes.
6. **Plano de resposta a incidente** com dado pessoal.
7. **Mídia fora do Brasil** (B-64): o R2 não tem região no Brasil. Para clientes da saúde, a
   mídia inclui pedidos médicos, receitas e resultados de exames — dado sensível (art. 11) —, e
   guardá-la fora do país é transferência internacional (art. 33), que exige o mecanismo
   adequado no contrato com a Cloudflare (ex.: cláusulas-padrão da ANPD). Alternativa sem
   transferência: AWS S3 em São Paulo (`sa-east-1`) — mesmo código e mesmo nginx (o cliente S3
   usa path-style também na AWS, conferido no B-64); mudam `MEDIA_STORAGE_HOST`, credenciais e
   região, e o teste de cadeia do B-64 precisa ser repetido contra o bucket real. Decidir
   **antes** de a primeira empresa da saúde subir mídia real.
