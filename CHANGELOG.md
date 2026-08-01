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
- **B-39 (2026-07-29):** retry da fila de webhook (Bull) estava inoperante — exceção de
  `WebhookService#handleEvent` era engolida antes de chegar ao processor, então `attempts`/`backoff`
  nunca tinham efeito e uma falha transitória (Postgres/Redis fora do ar, timeout da Evolution) perdia
  a mensagem do cliente em silêncio. DLQ, classificação de erro transitório/permanente e métricas
  adicionadas junto.
- **B-48 (2026-08-01):** race condition de idempotência em `MessageService#createFromWebhook` — sob
  concorrência real, `findFirst`+`create` não atômico podia gravar a mesma mensagem duas vezes.
  `@@unique([externalId])` + captura de `P2002`.
- **B-49 (2026-08-01):** mesma classe de race condition em `ConversationService#upsertFromWebhook` —
  índice único parcial no Postgres (`WHERE status IN ('WAITING','OPEN')`) + captura de `P2002`.

---

## Convenção deste arquivo

Categorias: **Adicionado** · **Alterado** · **Descontinuado** · **Removido** · **Corrigido** ·
**Segurança**

A partir da primeira tag, este arquivo é gerado por automação a partir dos commits (Conventional
Commits) e revisado manualmente antes da publicação.
