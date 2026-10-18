# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere ao
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

> **Nota histórica:** até 2026-07-28 o histórico de execução foi registrado em
> `ROADMAP_ESTABILIZACAO.md` (documento vivo, com evidência item a item). Este arquivo passa a ser o
> changelog formal por versão a partir da primeira tag. O roadmap continua sendo a fonte de verdade do
> **progresso**; este arquivo é a fonte de verdade das **versões liberadas**.

## [Não lançado]

### Adicionado
- **B-63 (2026-10-17):** testes end-to-end na CI. Job novo `api-e2e` com Postgres, Redis e MinIO reais
  roda todos os e2e da API a cada PR — antes só rodavam na máquina de quem lembrava. Novo e2e de
  autorização HTTP com a aplicação inteira (papéis, dono do recurso, isolamento entre empresas e escopo
  por departamento). Cobertura mínima dos testes unitários no job `api` (catraca logo abaixo da atual).
- Estrutura de documentação em 41 áreas numeradas, cada uma com README declarando objetivo,
  responsabilidade, conteúdo esperado, quem utiliza, quando utilizar e quem pode alterar
- `docs/00-Governanca/` com plano de reestruturação, convenção de nomenclatura e boas práticas
- `docs/05-ADR/` com template, índice e ADR-0001 registrando a decisão de estrutura
- `docs/37-Templates/` com modelos de post-mortem, RFC, ata e plano de teste
- `.github/` com templates de issue e PR, `CODEOWNERS` e configuração do Dependabot
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` e este `CHANGELOG.md`
- Itens B-38 a B-47 no roadmap, resultado da auditoria técnica de 2026-07-28

### Alterado
- **B-84 (2026-10-18, M-10):** o painel faz bem menos requisições com muitos atendentes conectados. Uma
  sequência de eventos em tempo real atualiza as métricas e as notificações uma vez só, e o sino de
  notificações só recarrega quando a conversa é atribuída ao próprio atendente.
- **B-79 (2026-10-18, M-06):** as mensagens recebidas de contatos diferentes passam a ser processadas em
  paralelo, sem que a conversa de um cliente espere a de outro, e as de um mesmo contato continuam em
  ordem. A hora de cada mensagem recebida passa a ser a do WhatsApp, e não a do processamento.
- **2026-10-18:** o check `api-e2e` (B-63) passa a ser obrigatório no `master`, junto com `api` e `web`.
  Filas de atendimento (B-65 a B-68) registradas no roadmap como evolução, depois da Fase 2.
- **B-64 (2026-10-18):** mídia de produção no **Cloudflare R2**. A imagem do MinIO usada no projeto saiu
  do Docker Hub e do quay.io, e um servidor novo não subia a stack. O MinIO fica só em desenvolvimento e
  na CI (`bitnamilegacy/minio`, mesmo build, fixado por digest, no `docker-compose.override.yml`). A API
  assina as URLs com o host do storage e troca só a origem pela do domínio de mídia; o nginx repassa
  `media.<domínio>` ao R2. A CI passa a conferir toda semana se as imagens fixadas existem. Impacto no
  deploy: conta e bucket no R2, token só de objetos e a variável nova `MEDIA_STORAGE_HOST` (ver RUNBOOK);
  em dev, o volume do MinIO criado pela imagem antiga precisa de um ajuste de dono (RUNBOOK).
- **B-57 (2026-10-17):** Node.js 20 (fora de suporte desde 30/04/2026) substituído pelo **Node.js 24
  LTS** nas imagens Docker da API e do nginx, na CI e no campo `engines` (`>=24`); actions
  `checkout`/`setup-node` da v4 (que já avisavam da depreciação do Node 20 nos runners) para a v7.
  Impacto: desenvolvimento local passa a exigir Node 24.
- `README.md` reescrito: visão geral, arquitetura, estrutura, contribuição, fluxo Git, CI/CD, releases
- `docs/API_CONTRACT.md` movido para `docs/09-APIs/`
- `docs/RUNBOOK.md` movido para `docs/26-DevOps/`
- `docs/LOGO_GUIDELINES.md` movido para `docs/07-Frontend/`
- `docs/archive/` renomeado para `docs/99-Arquivo/`
- Repositório mantido público (decisão de 2026-10-16): `master` protegido (pull request obrigatório e
  checks `api`/`web` verdes, também para administradores), `LICENSE` sem a palavra "confidencial"
  (continua proprietária), `SECURITY.md` sem detalhes de falhas não corrigidas e README atualizado

### Removido
- **B-75 (2026-10-18, M-11):** envio de mídia por URL em `POST /conversations/:id/messages` — a rota
  passa a aceitar só texto. Mídia continua por upload (`POST .../messages/media`), que é o que o painel
  usa. Motivo: o servidor buscava a URL informada (risco de SSRF). Impacto: integração que mandava
  `mediaUrl` recebe 400 e precisa usar o upload.
- PDFs de relatório do controle de versão (movidos para `docs/99-Arquivo/relatorios-pdf/`, ignorados)

### Segurança
- **B-83 (2026-10-18, M-19 / B-41):** o banco passa a impedir, sozinho, que uma requisição de uma empresa
  leia ou altere dados de outra, mesmo que alguma consulta da API esqueça o filtro por empresa
  (Row-Level Security do Postgres). O script de inicialização do banco também deixa de exigir que o
  usuário do Postgres se chame `atendehub`.
- **B-74 (2026-10-18, M-09):** o tempo real (WebSocket) segue as mesmas regras de sessão do resto da
  API. Logout, troca ou reset de senha, desativação e mudança de papel derrubam as conexões abertas, e
  um token revogado não conecta mais. No painel, a reconexão não desiste mais depois de 5 tentativas,
  aparece o aviso "Reconectando ao tempo real" enquanto a conexão está fora, e a lista de conversas
  e as notificações são recarregadas quando ela volta.
- **B-72 (2026-10-18, M-08):** trocar ou resetar a senha encerra todas as sessões abertas do usuário, em
  qualquer aparelho. Quem troca a própria senha continua logado na aba atual (a resposta traz tokens
  novos). A renovação de sessão passou a ser atômica e reconhece reuso de um token já trocado. A API não
  sobe em produção/staging com `JWT_SECRET` igual a `JWT_REFRESH_SECRET`. Também corrige o erro 500 em
  dois logins do mesmo usuário no mesmo segundo. Impacto: tokens emitidos antes desta versão deixam de
  valer — é preciso entrar de novo uma vez.
- **B-71 (2026-10-18, M-13):** a exportação de relatório em CSV neutraliza células que começam como
  fórmula (`=`, `+`, `-`, `@`): o nome do contato, escolhido pelo próprio cliente no WhatsApp, não é
  mais executado como fórmula ao abrir o arquivo no Excel. Impacto: valores assim aparecem com um `'`
  na frente (ex.: telefone `'+5511...`).
- **B-62 (2026-10-17):** anonimização de contato sem rastros de PII. Além do cadastro e da mídia, agora
  remove o telefone de `messages.metadata.remoteJid`, troca o nome do contato no texto das notificações
  e deixa de gravar nome/telefone/e-mail no próprio registro de auditoria da anonimização. Novo mapa
  técnico dos dados pessoais (`docs/35-LGPD/MAPA-DE-DADOS-PESSOAIS.md`) e script de purga da cópia
  que a Evolution guarda (`infra/postgres/lgpd-purga-evolution.sql`), que cobre conversas diretas,
  grupos, identificadores `@lid` e conexões antigas. Base legal e prazos de retenção seguem pendentes de
  decisão do encarregado/jurídico.
- **B-40 (2026-10-17):** escopo de conversas por departamento. Antes, qualquer atendente lia, assumia,
  respondia, anotava e encerrava qualquer conversa da empresa, exportava relatórios e recebia em tempo
  real todas as mensagens. Agora ADMIN e SUPERVISOR veem tudo; AGENT vê as conversas atribuídas a ele,
  as dos seus departamentos e as sem departamento — na listagem, nas estatísticas, no Dashboard, em
  toda rota da conversa (fora do escopo responde 404) e no WebSocket (salas por escopo). Relatórios
  passam a exigir SUPERVISOR (o menu some para AGENT). Impacto: atendentes precisam estar nos
  departamentos certos (Configurações → Usuários) para ver as conversas desses departamentos.
- **B-59 (2026-10-17):** a mídia do chat passa a carregar no navegador em produção. As URLs assinadas
  eram geradas com o host interno do MinIO, que o navegador não resolve (e trocar o host depois de
  assinar invalida a assinatura). Agora a API assina com `MINIO_PUBLIC_ENDPOINT` (obrigatória, com
  https, em produção) e o nginx serve `media.<domínio>` → MinIO, só leitura, com CSP `sandbox`; a CSP
  do app passa a liberar só esse host (mais a CDN do WhatsApp, das fotos de perfil). Impacto no
  deploy: DNS e certificado para o host de mídia e a variável nova (ver RUNBOOK).
- **B-58 (2026-10-17):** mensagens deixam de sumir quando duas conexões de WhatsApp cadastradas no
  AtendeHub conversam entre si (dois números da mesma empresa ou de empresas clientes). O `externalId`
  da mensagem passa a ser único **por conexão** (`messages.whatsappConnectionId`, preenchido a partir da
  conversa na migration `b58_message_external_id_unique_per_connection`), e as atualizações de status
  e exclusões vindas do webhook ficam restritas à conexão do evento — antes alcançavam a mensagem da
  outra empresa. Impacto no deploy: migration nova (`npm run db:migrate:prod`).
- **B-44 (2026-10-17):** container da API endurecido — roda como `node` em vez de root, `tini` como
  PID 1 (o `docker stop` deixa de terminar em SIGKILL), `HEALTHCHECK` na imagem, desligamento
  gracioso (`enableShutdownHooks`, 30 s de prazo no compose) e nginx esperando a API ficar saudável. A
  API deixa de travar no boot quando o Redis não responde (prazo de 5 s no adaptador do Socket.IO). A
  imagem fica menor (785 MB → 640 MB): o runtime reaproveita as dependências do build. Novo workflow
  `api-image-check.yml`. Impacto: nenhum no deploy além de reconstruir a imagem.
- **B-56 (2026-10-17):** o limite de requisições deixa de tratar todos os usuários como um só atrás do
  nginx. A API passa a confiar no `X-Forwarded-For` do proxy (`TRUST_PROXY`, padrão 1 em produção); a
  cota geral passa a ser por usuário autenticado (por IP nas rotas sem token); o webhook da Evolution
  ganha cota por instância de WhatsApp (1.200 eventos/min, antes 200/min somando todos os tenants); o
  contador vai para o Redis, compartilhado entre réplicas, com fail-open se o Redis cair. Impacto:
  nova variável opcional `TRUST_PROXY` (ver `apps/api/.env.example`); contrato atualizado em
  `docs/09-APIs/API_CONTRACT.md`. Arquivos: `apps/api/src/shared/rate-limit/`,
  `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/modules/webhook/webhook.controller.ts`.
- **B-43 (2026-10-17, parcial):** nginx de produção endurecido — HSTS, CSP, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy` no app; redirect 80→443 também na API;
  host desconhecido recusado; `X-Forwarded-For/Proto/Host` repassados à API (pré-requisito do limite de
  requisições por cliente); `Connection: upgrade` só no WebSocket, com timeout de 1 h; limite de
  requisições por IP (geral e rotas de autenticação); TLS no perfil intermediate da Mozilla, com
  HTTP/2. Impacto no deploy: os domínios `app.`/`api.atendehub.com` aparecem também na CSP
  (`infra/nginx/security-headers.conf`) — trocar o domínio exige ajustar os dois arquivos. Pendente:
  automação de certificado (ACME).
- **B-55 (2026-10-17):** em produção, só o nginx publica portas (80 e 443). Antes, Postgres, Redis,
  MinIO (API e console), Evolution e a API ficavam publicados em todas as interfaces do servidor, porque
  o Compose soma as listas de `ports` ao combinar arquivos e o `ports: []` do override de produção não
  tinha efeito. As portas de desenvolvimento passam para o novo `docker-compose.override.yml`, presas a
  `127.0.0.1` — o comando de dev (`docker compose up -d`) não muda. Novo workflow `compose-check.yml`
  recusa PR que volte a publicar portas. Impacto no deploy: `EVOLUTION_WEBHOOK_URL` de produção precisa
  apontar para a rede interna (`http://api:3001/api/v1/webhooks/evolution`).
- **B-54 (2026-10-17):** dependências de produção atualizadas para versões sem vulnerabilidades altas
  ou críticas conhecidas — na API, `proxy-addr` (crítica), `multer`, `axios`, `compression`,
  `engine.io`, `socket.io-parser` e `@nestjs/platform-express` (altas); no front, `socket.io-parser`
  (alta). Só atualizações compatíveis (`npm audit fix`, sem mudança no `package.json`). Novo workflow
  `dependency-audit.yml` audita as dependências de produção em todo push no `master`, todo PR e toda
  segunda-feira. Restam moderadas sem correção compatível (`bull`/`uuid` e `minio`).
- **B-51 (2026-10-17):** a troca de senha (`PATCH /users/:id/password`) passa a aceitar só o próprio
  usuário — qualquer outro `:id` responde 403 antes de consultar o banco —, ganha limite próprio de 5
  tentativas por minuto e registra `user.password_changed` em auditoria. Antes, um usuário autenticado
  podia tentar a senha atual de outro usuário da mesma empresa com o limite genérico da API. Impacto:
  nenhuma mudança para o frontend, que já enviava o próprio id. Arquivos:
  `apps/api/src/modules/user/user.service.ts`, `apps/api/src/modules/user/user.controller.ts`;
  contrato em `docs/09-APIs/API_CONTRACT.md`.
- **B-50 (2026-10-16):** removido o caminho alternativo de download de mídia do webhook que buscava a
  URL vinda no conteúdo da mensagem enviando a `EVOLUTION_API_KEY` no cabeçalho — a chave podia chegar
  a um host externo. A mídia passa a vir exclusivamente do `getBase64FromMediaMessage` da Evolution; se
  ela não entregar, a mensagem fica sem anexo (com log). Chave da Evolution trocada no ambiente local,
  inclusive o token das instâncias existentes. Impacto: nenhuma mudança de contrato da API. Arquivos:
  `apps/api/src/modules/webhook/webhook.service.ts`,
  `apps/api/src/modules/webhook/media-download.service.ts`; procedimento de troca da chave em
  `docs/26-DevOps/RUNBOOK.md`.
- **B-38 (2026-07-29):** bucket de mídia do MinIO deixa de ser público em leitura — mitiga risco de
  violação da LGPD Art. 46 (dado pessoal de cliente — foto, áudio, documento — acessível por qualquer
  pessoa com a URL, sem autenticação). Mídia passa a ser servida exclusivamente por URL assinada
  (expiração configurável via `MEDIA_SIGNED_URL_EXPIRATION`, padrão 600s). Impacto: nenhuma mudança de
  contrato para o consumidor da API (`attachments[].url`/`avatarUrl` continuam sendo strings de URL) —
  só passam a expirar, documentado em `docs/09-APIs/API_CONTRACT.md`. Arquivos:
  `apps/api/src/shared/storage/storage.service.ts` (`onModuleInit`, `presignUrl`, `presignDeep`),
  `apps/api/src/shared/storage/media-presign.interceptor.ts` (novo), `apps/api/src/app.module.ts`.
- **B-38 — hardening pós-auditoria (2026-08-01):** achado ao vivo por teste E2E contra MinIO real
  durante auditoria pós-implementação — a correção original de 2026-07-29 só evitava aplicar uma
  policy pública em boots *futuros*; não revogava uma policy pública que uma versão anterior do
  código já tivesse deixado gravada no bucket (bucket policy é estado persistente no MinIO, não
  efêmero). Ambientes onde o código pré-B-38 já tinha rodado ao menos uma vez continuavam com leitura
  pública ativa mesmo com o "fix" aplicado — confirmado com evidência real (GET anônimo devolvendo
  200, policy `Principal:{"AWS":["*"]}` ainda presente no bucket de dev). `StorageService#onModuleInit`
  agora chama `setBucketPolicy(bucket, '')` a cada boot, revogando qualquer policy herdada
  (idempotente quando já não há nenhuma). Risco mitigado: exposição pública residual sobrevivendo ao
  deploy do "fix" em qualquer ambiente que já tivesse rodado a versão antiga. Arquivo:
  `apps/api/src/shared/storage/storage.service.ts`. Ver `B38_AUDITORIA_POS_HARDENING.pdf` (raiz do
  repo) para o relatório completo.

### Corrigido
- **B-82 (2026-10-18, M-26):** a Evolution passa a entregar cada evento uma vez só, pelo webhook global.
  Antes cada número conectado tinha também um webhook próprio que chamava um endereço inexistente da
  API e era repetido a cada evento. Números já conectados têm esse webhook desligado na próxima vez que
  o QR code for gerado.
- **B-81 (2026-10-18, M-02):** mensagens do WhatsApp que chegavam vazias passam a aparecer: temporárias,
  de visualização única, documento com legenda, enquetes e respostas de botão ou lista. Quando o cliente
  edita uma mensagem, o texto é atualizado e o balão ganha a marca "editada". A reação aparece no balão
  da mensagem original e não abre mais uma conversa nova (com saudação e menu) quando a conversa já foi
  encerrada. Status, listas de transmissão e canais deixam de virar conversa.
- **B-80 (2026-10-18, M-27 / B-46):** a busca de foto de perfil dos contatos deixa de acumular memória a
  cada contato novo e passa a valer para todas as réplicas da API. A contagem de conexões em tempo real
  passa a somar todas as réplicas. Internamente, um só cliente Redis atende os três usos de estado simples.
- **B-78 (2026-10-18, M-05):** auto-atendimento. A mensagem do robô não aparece mais duplicada como se
  fosse do atendente, e o texto do menu não substitui mais a prévia da conversa na lista. O cliente que
  manda áudio, foto ou uma resposta inválida com o menu aberto não tem mais a conversa encerrada "por
  inatividade". As respostas do robô saem de uma fila própria e não atrasam mais o recebimento de
  mensagens.
- **B-77 (2026-10-18, M-03):** anexos comuns enviados pelo cliente (PowerPoint, RAR, 7z, OpenDocument,
  foto HEIC do iPhone, WebM e arquivos genéricos) passam a ser salvos. Eles chegam ao atendente como
  download, não abrem direto no navegador. Quando um anexo não pode ser salvo, o balão avisa o motivo
  em vez de ficar carregando para sempre.
- **B-76 (2026-10-18, M-01):** mídia recebida pelo WhatsApp não se perde mais numa falha passageira — o
  download é tentado de novo por alguns minutos. E se o processamento de uma mensagem cair no meio, a
  nova tentativa faz o que faltou (prévia na lista, saudação, resposta do menu, aviso em tempo real) em
  vez de pular tudo.
- **B-73 (2026-10-18, M-07):** atribuir um atendente não reabre mais uma conversa encerrada (responde
  400). Reabrir ou atribuir uma conversa resolvida quando o contato já tem outra conversa ativa responde
  409 com o motivo, em vez de erro 500.
- **B-69 (2026-10-18, M-14):** filtros booleanos das listagens (`?isActive=`, `?isBlocked=`,
  `?unreadOnly=`) deixam de inverter o resultado. A conversão implícita de tipos transformava o
  texto `"false"` da query em `true`; agora ela fica desligada no ValidationPipe e cada campo
  declara a própria conversão. Hoje nenhum efeito visível (o front não envia `=false`), mas
  corrige integrações e a futura API pública.
- **B-61 (2026-10-17):** datas e horários passam a seguir o fuso da empresa (novo campo
  `companies.timezone`, padrão `America/Sao_Paulo`, editável pelo ADMIN em `PATCH /company/me`). Antes
  tudo usava o fuso do servidor (UTC no Docker): o expediente do auto-atendimento ficava deslocado em 3
  horas, "resolvidas hoje" virava às 21h, o último dia dos relatórios ficava de fora, e as datas do
  CSV/PDF saíam em UTC; no front, o filtro de relatórios abria com o dia seguinte depois das 21h.
  Impacto no deploy: migration nova (`b61_company_timezone`).
- **B-60 (2026-10-17):** a caixa de entrada passa a sinalizar mensagens novas. Áudio, imagem, vídeo,
  documento e figurinha sem legenda agora sobem a conversa na lista, contam como não lidos e aparecem
  com rótulo na prévia ("Áudio", "Imagem"...) — antes só texto do cliente atualizava a conversa (B-42).
  A resposta do auto-atendimento deixa de contar como não lida; mensagens do atendente e as enviadas
  pelo celular atualizam a prévia. No front: contador de não lidas por conversa, fila ordenada pela
  última atividade e conversa marcada como lida ao abrir (a rota `PATCH /conversations/:id/read`
  existia, mas nunca era chamada).
- **B-53 (2026-10-17):** a sessão do frontend caía a cada ~30 minutos — o refresh token rotacionado
  pelo backend não era guardado, e a renovação seguinte era recusada. A renovação passa a guardar o
  token novo e a acontecer uma vez por vez para o app inteiro (requisições simultâneas e WebSocket
  esperam a mesma); erro de rede na renovação não desloga mais. Também corrigido: senha errada no login
  aparecia como "Sessão expirada". Arquivos: `src/services/sessionRefresh.js` (novo),
  `src/services/api.js`.
- **B-52 (2026-10-17):** em produção a API não gravava nenhuma linha de log — o nível configurado
  (`'log'`) não existe no Winston, que descartava todas as mensagens, inclusive erros e o motivo de um
  boot abortado. Passa a usar `info` em produção (`debug` segue desligado, por poder conter dado
  pessoal), com testes que verificam a saída real. Arquivo:
  `apps/api/src/shared/logging/winston.logger.ts`; RUNBOOK atualizado.
- **B-39 (2026-07-29):** retry da fila de webhook (Bull) estava inoperante — exceção de
  `WebhookService#handleEvent` era engolida antes de chegar ao processor, então `attempts`/`backoff`
  nunca tinham efeito e uma falha transitória (Postgres/Redis fora do ar, timeout da Evolution) perdia
  a mensagem do cliente em silêncio. DLQ, classificação de erro transitório/permanente e métricas
  adicionadas junto.
- **B-48 (2026-08-01):** race condition de idempotência em `MessageService#createFromWebhook` — sob
  concorrência real (dois workers do Bull processando o mesmo evento, ou o próprio
  `SendMessageService` correndo contra o eco do webhook da mensagem que o agente acabou de enviar),
  o padrão `findFirst`+`create` não atômico podia gravar a mesma mensagem duas vezes. Impacto: sem a
  correção, mensagem duplicada visível pro cliente/agente e efeitos colaterais duplicados (mídia
  baixada 2x, auto-atendimento respondendo 2x). Mitigação: `@@unique([externalId])` no schema (troca
  o `@@index` antigo) + `MessageService#createUnique` novo — `create()` direto, capturando `P2002`
  como "outro processo venceu a corrida" em vez de erro; atomicidade garantida pelo Postgres dentro
  do próprio INSERT. Validado com concorrência real (2 a 100 chamadas simultâneas contra Postgres,
  sempre exatamente 1 registro). Arquivos: `apps/api/prisma/schema.prisma`,
  `apps/api/prisma/migrations/20260801204336_b48_message_external_id_unique/`,
  `apps/api/src/modules/message/message.service.ts`,
  `apps/api/src/modules/message/send-message.service.ts`. Hardening pós-auditoria (mesmo dia):
  observabilidade — `MessageService` ganhou `Logger` e passou a registrar (nível `warn`) toda colisão
  de `P2002` resolvida, antes invisível em produção. Relatório técnico completo em
  `B48_AUDITORIA_POS_HARDENING.pdf` (raiz do repo).
- **B-49 (2026-08-01):** race condition em `ConversationService#upsertFromWebhook` — sob concorrência
  real (duas mensagens do mesmo contato processadas quase juntas, nem precisa de retry), o padrão
  `findFirst`+`create` não atômico podia criar 2 conversas ativas pro mesmo contato. Impacto: pior que
  duplicar mensagem — a conversa do cliente ficava "split-brain" entre 2 tickets (um agente responde
  numa, mensagens futuras do cliente resolvem pra outra, a 1ª vira ficha fantasma na fila). Diferente
  do B-48 (unicidade de coluna inteira), a invariante aqui é condicional — no máximo 1 conversa ATIVA
  (`WAITING`/`OPEN`) por contato; conversas `RESOLVED`/`CLOSED` continuam coexistindo livremente
  (histórico). Mitigação: índice único PARCIAL no Postgres
  (`conversations_active_per_contact_key`, `WHERE status IN ('WAITING','OPEN')` — não expressável via
  `@@unique`/`@@index` do Prisma, migration SQL manual) + captura de `P2002` em
  `ConversationService#upsertFromWebhook`, devolvendo a conversa vencedora em vez de duplicar.
  Validado com concorrência real (2 a 100 chamadas simultâneas, sempre exatamente 1 conversa ativa,
  todos os chamadores convergindo pro mesmo `conversationId`). Arquivos:
  `apps/api/prisma/schema.prisma`,
  `apps/api/prisma/migrations/20260801211919_b49_conversation_active_unique_per_contact/`,
  `apps/api/src/modules/conversation/conversation.service.ts`. Hardening pós-auditoria (mesmo dia):
  observabilidade — `ConversationService` ganhou `Logger` e passou a registrar (nível `warn`) toda
  colisão de `P2002` resolvida, antes invisível em produção (mesmo gap corrigido em `MessageService`
  no B-48). Relatório técnico em `B49_RELATORIO_TECNICO_CORRECAO_E_VALIDACAO.pdf` e
  `B49_AUDITORIA_POS_HARDENING.pdf` (raiz do repo).

---

## Convenção deste arquivo

Categorias: **Adicionado** · **Alterado** · **Descontinuado** · **Removido** · **Corrigido** ·
**Segurança**

A partir da primeira tag, este arquivo é gerado por automação a partir dos commits (Conventional
Commits) e revisado manualmente antes da publicação.
