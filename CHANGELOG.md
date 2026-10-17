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
- Estrutura de documentação em 41 áreas numeradas, cada uma com README declarando objetivo,
  responsabilidade, conteúdo esperado, quem utiliza, quando utilizar e quem pode alterar
- `docs/00-Governanca/` com plano de reestruturação, convenção de nomenclatura e boas práticas
- `docs/05-ADR/` com template, índice e ADR-0001 registrando a decisão de estrutura
- `docs/37-Templates/` com modelos de post-mortem, RFC, ata e plano de teste
- `.github/` com templates de issue e PR, `CODEOWNERS` e configuração do Dependabot
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` e este `CHANGELOG.md`
- Itens B-38 a B-47 no roadmap, resultado da auditoria técnica de 2026-07-28

### Alterado
- `README.md` reescrito: visão geral, arquitetura, estrutura, contribuição, fluxo Git, CI/CD, releases
- `docs/API_CONTRACT.md` movido para `docs/09-APIs/`
- `docs/RUNBOOK.md` movido para `docs/26-DevOps/`
- `docs/LOGO_GUIDELINES.md` movido para `docs/07-Frontend/`
- `docs/archive/` renomeado para `docs/99-Arquivo/`

### Removido
- PDFs de relatório do controle de versão (movidos para `docs/99-Arquivo/relatorios-pdf/`, ignorados)

### Segurança
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
