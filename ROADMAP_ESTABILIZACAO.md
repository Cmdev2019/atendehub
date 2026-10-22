# 🗺️ Roadmap — AtendeHub (painel)

> **📌 Documento vivo e curto.** Responde "onde estamos e o que vem depois". O detalhe de cada
> item (descrição, evidência, arquivos), as Fases 0–8, o registro de decisões e o changelog ficam
> em [`docs/03-Roadmap/ROADMAP-HISTORICO.md`](docs/03-Roadmap/ROADMAP-HISTORICO.md) — separado no
> B-90 (M-24), quando este arquivo tinha 390 KB e linhas de até 8.700 caracteres.
>
> **Última atualização:** 2026-10-21

## 📍 Onde estamos

- **Projeto de estudo, gratuito, sem produção** (decisão do responsável, 2026-10-18): o que só
  vale com deploy real fica **em espera**, não como bloqueio.
- **Auditoria de 2026-10-16 — Fases 0 e 1 concluídas.** Em espera: B-43 (certificado/SSL Labs) e
  B-64 (conta do Cloudflare R2).
- **Fase 2 (estabilização) concluída** em 2026-10-18: B-69 a B-90 — segurança (sessões,
  WebSocket, SSRF, CSV), webhook e mídia (retry por etapa, filas próprias, shards por contato,
  tipos de mensagem, webhook único), RLS no Postgres, amplificação de requisições, cadastro
  público, processo de Git, contrato da API e documentação. Em espera: verificação de e-mail e
  CAPTCHA no cadastro (B-85), validação dos tipos de mensagem com número real (B-81).
- **Fase 3 (higiene) concluída** em 2026-10-18: B-91 a B-106 — Dependabot, CORS e token do
  WebSocket, `x-request-id`, guards duplicados, robustez do login, blacklist por hash, SLA,
  validação do auto-atendimento e do WhatsApp, retenção, diagnóstico de dependências, lint do
  front (B-47), busca da fila, limites de relatório e divisão do bundle. **Plano de ação da
  auditoria de 2026-10-16 encerrado** (tags `v0.1.0` e `v0.2.0`).
- **Filas de atendimento — ADR-0019 aprovado** (2026-10-19, PR #104): fila compartilhada por
  setor ("quem atender primeiro"), atendente Online/Offline, SLAs de espera e de atendimento por
  setor e setores escolhidos no cadastro do atendente. A distribuição automática saiu do plano.
  **B-65 concluído** (2026-10-19): o atendente escolhe Online/Offline no topo da tela, o logout e a
  desativação põem Offline e o supervisor vê a troca na hora. **B-113 concluído** (2026-10-19): os
  setores do atendente são escolhidos no cadastro e na edição dele. **B-66 concluído**
  (2026-10-19): quem atender primeiro fica com a conversa (o outro vê "Fulano já está atendendo"),
  Offline não pega da fila, transferências com as permissões do responsável, fila só `MANUAL` e
  seed com os 13 setores e o menu. **B-67 concluído** (2026-10-20): "Pegar próxima" na API — a
  conversa que espera há mais tempo nos setores de quem pede, sem dois atendentes receberem a
  mesma (o botão entra no painel, B-68). **B-112 concluído** (2026-10-20): o prazo do SLA da espera
  só corre no expediente do auto-atendimento, no fuso da empresa — quem chega com a clínica fechada
  passa a ter prazo, contado da abertura. **B-114 concluído** (2026-10-21): SLA do atendimento, do
  Atender ao Encerrar, com prazo por setor na tela de Filas; ao estourar, avisa quem atende e o
  supervisor. Falta só o painel da fila (B-68). **B-116 concluído** (2026-10-21): os 13 setores
  eram exemplos — o admin cria os setores conforme a necessidade, até 20 ativos por empresa, e o
  seed não cria nenhum. **B-68, parte 1** (2026-10-21): painel do atendente — "Pegar próxima" na
  Fila, prazo de SLA em cada conversa e aviso de conversa nova só para quem está Online. **B-68
  concluído** (2026-10-21): "Painel da fila" do supervisor, com setores × atendentes. **Trilha das
  filas encerrada** — ADR-0019 implementado.
- **B-115 concluído** (2026-10-20): um aviso alto novo no `follow-redirects`, que a API usa por
  meio do `axios`, deixou a auditoria de dependências do CI vermelha; a versão corrigida entrou
  só no lockfile.
- **B-86 em andamento** (2026-10-21): versões major, um PR por major ou família acoplada.
  **Prisma 5 → 7 concluído** (PR #118): o cliente é gerado em `apps/api/src/generated/prisma` e fala
  com o Postgres pelo `pg`; uma migration põe chave primária nas três tabelas de junção N:N.
  **ioredis 5 → 6 concluído** (PR #119): RESP3 por padrão, com teste novo do Socket.IO entre réplicas.
  **Nest 11 → 12 concluído** (PR #PR), com o Jest 30 da API: os pacotes do Nest 12 são só ESM, e o
  Jest os carrega com o `--experimental-vm-modules` (já nos scripts de teste).
- **Números do projeto:** `node scripts/project-stats.mjs` (publicado no resumo do job `web`).

## ⏭️ Próximos passos

1. **Atualização de majors** (B-86) — em andamento, um PR por vez: Prisma 7 ✅, ioredis 6 ✅, Nest 12 ✅
   (com o Jest 30); a seguir Sentry 11, class-validator 0.15 e ESLint 10 na API, e no front Vite 8, `@vitejs/plugin-react` 6, ESLint 10 e jest-dom 7.
2. **Pendências registradas** — B-45 (Swagger), B-107 a B-111 (recomendações dos relatórios antigos).
3. ~~Evolução: filas de atendimento~~ (ADR-0019) ✅ — trilha encerrada em 2026-10-21: B-65, B-113, B-66,
   B-67, B-112, B-114 e B-68 (com o B-116, setores pelo admin).

## 📊 Painel de status

| Fase | Objetivo | Prioridade | Progresso | Status |
|---|---|---|---|---|
| [Fase 0](#-fase-0--religar-frontend--backend) | Religar frontend ↔ backend | 🔴 P0 | 13/13 | ✅ Concluída |
| [Fase 1](#-fase-1--contrato-de-dados-único) | Contrato de dados único | 🔴 P1 | 11/11 | ✅ Concluída |
| [Fase 2](#-fase-2--modo-demo-explícito-e-resiliência) | Modo demo explícito e resiliência | 🟠 P1 | 8/8 | ✅ Concluída |
| [Fase 3](#-fase-3--ativar-o-módulo-de-sla) | Ativar o módulo de SLA | 🟠 P1 | 5/5 | ✅ Concluída |
| [Fase 4](#-fase-4--testes-no-backend) | Testes no backend | 🟠 P1→P2 | 6/6 | ✅ Concluída (via B4, `ROADMAP_BACKEND.md`) |
| [Fase 5](#-fase-5--higiene-do-repositório-e-documentação) | Higiene do repo e documentação | 🟡 P2 | 5/5 | ✅ Concluída |
| [Fase 6](#-fase-6--hardening-de-segurança-pré-produção) | Hardening de segurança | 🟡 P2 | 5/5 | ✅ Concluída |
| [Fase 7](#-fase-7--pronto-para-produção) | Pronto para produção | 🟢 P3 | 5/5 | ✅ Concluída |
| [Fase 8](#-fase-8--administração--configurações) | Administração & Configurações | 🟠 P1 | 12/12 | ✅ Concluída |
| **Total** | | | **70/70** | |

**Ciclo pós-auditoria de 2026-10-16** — fases próprias, não confundir com as Fases 0-8 acima:

| Fase | Objetivo | Itens | Status |
|---|---|---|---|
| Fase 0 | Imediato (C-01, C-02, C-05, C-06, C-08, C-12) | B-50 a B-54 | ✅ Concluída |
| Fase 1 | Bloqueadores de go-live | B-55 a B-64, B-40, B-43, B-44 | ✅ Concluída (B-43 e B-64 parciais, em espera) |
| **Fase 2** | **Estabilização:** M-01, M-02, M-03, M-05 a M-11, M-13, M-14, M-16, M-19, M-20, M-21, M-23, M-25, M-26, M-27 e revisão da documentação (M-24) | B-69 em diante (M-16 resolvido no B-64; M-21 registrado como B-66) | ✅ Concluída 2026-10-18 (B-69 a B-90; em espera: e-mail/CAPTCHA do B-85, número real no B-81) |
| Fase 3 | Higiene contínua: itens baixos L-01 a L-17 | — | ✅ Concluída 2026-10-18 (B-91 a B-106; L-01 no B-89; recomendações antigas registradas como B-107 a B-111) |
| Evolução | **Filas de atendimento** — fora do plano da auditoria, depois da Fase 2 (decisão de 2026-10-17) | ADR-0019, B-65 a B-68, B-112 a B-114 | ✅ Concluída 2026-10-21 (ADR-0019 implementado: B-65, B-113 e B-66 em 2026-10-19; B-67 e B-112 em 2026-10-20; B-114, B-116 e B-68 em 2026-10-21) |

**Legenda de status:** ⬜ Pendente · 🔄 Em andamento · 🔍 Em validação · ✅ Concluído · ⛔ Bloqueado · 🚫 Cancelado

**Dependências entre fases:** Fase 0 destrava as Fases 1, 2 e 3. As Fases 4 e 5 podem rodar em paralelo a qualquer momento. A Fase 6 é pré-requisito de produção; a Fase 7 fecha o ciclo.

## 🟡 Itens abertos

| ID | Origem | Resumo | Status |
|---|---|---|---|
| B-43 | — | infra/nginx/nginx.conf não define nenhum header de segurança | 🔄 Parcial 2026-10-17 · em espera (projeto de estudo) |
| B-45 | — | Não há Swagger/OpenAPI: @nestjs/swagger não está nas dependências de apps/api/package.json e não há nenhuma referência a SwaggerModule… | ⬜ Pendente |
| B-64 | — | A imagem do MinIO fixada no docker-compose.yml (minio/minio:RELEASE.2025-06-13T11-33-47Z) não existe mais no Docker Hub nem no quay.io —… | 🔄 Parcial 2026-10-18 · em espera (projeto de estudo) |
| B-86 | M-23 | Versões major pendentes, cada uma com migração própria | 🔄 Em andamento — Prisma 7, ioredis 6 e Nest 12 ✅ 2026-10-21 |
| B-107 | L-17 | Fila (producer) sem fail-fast quando o Redis cai: enfileirar pode ficar pendurado em vez de falhar rápido | ⬜ Pendente |
| B-108 | L-17 | Sem circuit breaker nas chamadas à Evolution: com ela fora do ar, cada chamada espera o timeout inteiro | ⬜ Pendente |
| B-109 | L-17 | Logs do processamento de webhook sem o id da mensagem em todas as linhas | ⬜ Pendente |
| B-110 | L-17 | A API usa a credencial administrativa do storage em dev (menor privilégio) | ⬜ Pendente |
| B-111 | L-17 | Payload dos eventos de socket sem tipo compartilhado entre API e front | ⬜ Pendente |

**Concluídos em parte** (o resto em espera):

| ID | Origem | Resumo | Status |
|---|---|---|---|
| B-85 | M-20 | Auto-cadastro público sem freio | ✅ 2026-10-18 (parcial — verificação de e-mail e CAPTCHA em espera) |

## 📋 Backlog completo (resumo)

Uma linha por item; o detalhe está no [histórico](docs/03-Roadmap/ROADMAP-HISTORICO.md#-backlog).

| ID | Origem | Resumo | Status |
|---|---|---|---|
| B-1 | — | Upload real de anexos | ✅ 2026-07-16 |
| B-2 | — | Dashboard/Métricas com dados reais (hoje calculadas sobre mock) | ✅ 2026-07-24 |
| B-3 | — | Notificações e consulta de auditoria | ✅ 2026-07-22 |
| B-4 | — | Paginação/scroll infinito real na fila de conversas e no histórico de mensagens (o back já pagina | ✅ 2026-07-24 |
| B-5 | — | docker compose up falha ao baixar minio/mc:RELEASE.2025-06-13T11-33-47Z (tag não existe mais no Docker Hub), o que aborta também o pull… | ✅ 2026-07-24 |
| B-6 | — | A fila message-send tem processor registrado mas nenhum produtor — o envio real é 100% síncrono no send-message.service (Evolution →… | ✅ 2026-07-22 |
| B-7 | — | wsClient.off(event) (src/services/websocket.js) remove todos os listeners registrados pro nome do evento, não só o do componente que… | ✅ 2026-07-25 |
| B-8 | — | O backend expõe GET /notifications, PATCH /notifications/:id/read e PATCH /notifications/read-all desde B1-3 (ROADMAP_BACKEND.md,… | ✅ 2026-07-25 |
| B-9 | — | Não existe nenhuma forma de dar onboarding a uma empresa (tenant) nova | ✅ 2026-07-25 |
| B-10 | — | docs/26-DevOps/RUNBOOK.md documenta deploy, rollback, reset de fila e troubleshooting, mas não tem nenhuma seção de backup/restore do… | ✅ 2026-07-25 |
| B-11 | — | docs/09-APIs/API_CONTRACT.md afirma cobrir "todos" os recursos REST, mas GET /conversations/:conversationId/messages/:id existe em… | ✅ 2026-07-25 |
| B-12 | — | Não existe nenhum React Error Boundary em todo o src/ — main.js monta a árvore direto, sem componentDidCatch/boundary | ✅ 2026-07-25 |
| B-13 | — | 7 pontos usam alert()/confirm() nativos do navegador em vez de um modal próprio | ✅ 2026-07-25 |
| B-14 | — | Acessibilidade desbalanceada | ✅ 2026-07-25 |
| B-15 | — | O endpoint de webhook (POST /api/v1/webhooks/evolution) não tem @Throttle dedicado — só herda o limite global do throttler (100… | ✅ 2026-07-25 |
| B-16 | — | .github/workflows/api-ci.yml e web-ci.yml existem e fazem sentido lidos, mas o próprio B6-1 (ROADMAP_BACKEND.md) já registrava que nunca… | ✅ 2026-07-25 |
| B-17 | — | Nenhuma política de retenção de dados, exportação/portabilidade ou anonimização documentada, apesar do produto processar PII de… | ✅ 2026-07-25 |
| B-18 | — | Monitoramento de erros em produção (Sentry ou equivalente) chegou a ser citado em docs/99-Arquivo/CODE_QUALITY_CHECKLIST.md como… | ✅ 2026-07-25 |
| B-19 | — | A decisão de manter tokens em localStorage (F6-1/B5-1) foi tomada quando o frontend estava pausado, com o argumento explícito de não… | ✅ 2026-07-25 (decisão: manter) |
| B-20 | — | email do User só é único por empresa (@@unique([companyId, email]) em schema.prisma:149) — mas o login (auth.service.ts#validateUser)… | ✅ 2026-07-25 |
| B-21 | — | 2 botões existem só visualmente, sem onClick | ✅ 2026-07-25 |
| B-22 | — | useConversations.js inicializava conversations com o fixture mock (initialConversations) e só o substituía por dados reais se… | ✅ 2026-07-25 |
| B-23 | — | apiClient.logout() não enviava refreshToken no corpo de POST /auth/logout, mas o backend exige (RefreshTokenDto com @IsNotEmpty) — 400… | ✅ 2026-07-25 |
| B-24 | — | Depois de passar a enviar refreshToken, o logout passou a receber 204 No Content de verdade do backend — e ApiClient#request chama… | ✅ 2026-07-25 |
| B-25 | — | npm audit --omit=dev em apps/api aponta 20 vulnerabilidades nas dependências de produção (1 crítica, 6 altas, 13 moderadas), nunca… | ✅ 2026-07-25 |
| B-26 | — | Não existe nenhum fluxo de recuperação de senha — nem self-service, nem administrativo | ✅ 2026-07-25 |
| B-27 | — | B1-1 (ROADMAP_BACKEND.md) entregou CRUD completo de Tag + atribuição em conversa/contato (POST/DELETE /conversations/:id/tags/:tagId,… | ✅ 2026-07-25 |
| B-28 | — | ContactService#remove fazia hard delete (prisma.contact.delete), mas Conversation.contact não tem onDelete configurado no schema… | ✅ 2026-07-25 |
| B-29 | — | Mídia de um contato anonimizado (fotos, áudios, documentos do WhatsApp) permanece no MinIO indefinidamente — StorageService#delete… | ✅ 2026-07-25 |
| B-30 | — | Não existe endpoint de exportação/portabilidade de dados do titular (LGPD art | ✅ 2026-07-25 |
| B-31 | — | "Criar as etapas de atendimento | ✅ 2026-07-25 |
| B-32 | — | Dashboard com dados reais no lugar do botão "Funis" (placeholder desabilitado desde sempre, nunca teve tela) — vira a 1ª tela do… | ✅ 2026-07-26 |
| B-33 | — | Gerador de relatórios | ✅ 2026-07-26 |
| B-34 | — | Base de administração de contatos no frontend — listar/paginar contatos existentes, cadastrar e editar contato pela plataforma, "tudo… | ✅ 2026-07-26 |
| B-35 | — | Auto-atendimento configurável em Configurações | ✅ 2026-07-26 |
| B-36 | — | No diálogo de encerrar | ✅ 2026-07-26 |
| B-37 | — | Backend "cai" de tempos em tempos sem erro visível — investigado a pedido do usuário ("suba nosso backend ele caiu novamente, veja o por… | ✅ 2026-07-26 |
| B-38 | — | O bucket de mídia do MinIO é tornado público em leitura pelo próprio boot da API: StorageService#onModuleInit aplica uma policy com… | ✅ 2026-07-29 (hardening 2026-08-01) |
| B-39 | — | O retry da fila de webhook nunca dispara | ✅ 2026-07-29 |
| B-40 | — | Não existe escopo de permissão dentro do domínio de atendimento | ✅ 2026-10-17 |
| B-41 | — | O isolamento multi-tenant é 100% manual e sem rede de proteção | ✅ 2026-10-18 (pelo B-83) |
| B-42 | — | Mensagem de mídia sem legenda não atualiza a conversa | ✅ 2026-10-17 |
| B-43 | — | infra/nginx/nginx.conf não define nenhum header de segurança | 🔄 Parcial 2026-10-17 · em espera (projeto de estudo) |
| B-44 | — | apps/api/Dockerfile não declara USER em nenhum estágio — a API roda como root no container de produção | ✅ 2026-10-17 |
| B-45 | — | Não há Swagger/OpenAPI: @nestjs/swagger não está nas dependências de apps/api/package.json e não há nenhuma referência a SwaggerModule… | ⬜ Pendente |
| B-46 | — | Há estado em memória de processo que impede rodar a API em mais de uma réplica corretamente — o que colide com a existência do Redis… | ✅ 2026-10-18 (pelo B-80) |
| B-47 | — | O frontend não tem linter | ✅ 2026-10-18 (pelo B-103) |
| B-48 | — | Sob concorrência REAL (não sequencial), a deduplicação de mensagem de webhook tem uma condição de corrida | ✅ 2026-08-01 |
| B-49 | — | ConversationService#upsertFromWebhook (conversation.service.ts:543-588, chamado por WebhookService#processMessage — mesmo pipeline… | ✅ 2026-08-01 |
| B-50 | — | O download de mídia do webhook tinha um caminho alternativo (MediaDownloadService#downloadAndStore, acionado por… | ✅ 2026-10-16 |
| B-51 | — | PATCH /users/:id/password não conferia se o :id era o do próprio usuário e usava o limite genérico da API (100/min, contra 5/min do login) | ✅ 2026-10-17 |
| B-52 | — | Em produção a API não gravava nenhuma linha de log | ✅ 2026-10-17 |
| B-53 | — | A sessão do frontend caía a cada ~30 minutos de uso | ✅ 2026-10-17 |
| B-54 | — | Dependências de produção com vulnerabilidades conhecidas e correção disponível | ✅ 2026-10-17 |
| B-55 | — | O compose de produção publicava Postgres (5432), Redis (6379), MinIO (9000 e console 9001), Evolution (8080) e a API (3001) em todas as… | ✅ 2026-10-17 |
| B-56 | — | O limite de requisições trataria todos os usuários como um só em produção | ✅ 2026-10-17 |
| B-57 | M-15 | O Node.js 20 está fora de suporte desde 30/04/2026 (sem correções de segurança) e ainda era usado nas imagens Docker da API e do nginx e… | ✅ 2026-10-17 |
| B-58 | C-09 | O B-48 tornou externalId único no banco inteiro, mas o WhatsApp usa o mesmo id de mensagem nos dois lados de uma conversa | ✅ 2026-10-17 |
| B-59 | C-07 | A mídia não carregaria no navegador em produção | ✅ 2026-10-17 |
| B-60 | C-11 | A caixa de entrada não sinalizava mensagens novas de forma confiável | ✅ 2026-10-17 |
| B-61 | M-04 | Fuso horário | ✅ 2026-10-17 |
| B-62 | M-12 | LGPD: a anonimização de contato estava incompleta — o telefone continuava em messages.metadata.remoteJid de toda mensagem recebida, o… | ✅ 2026-10-17 |
| B-63 | M-22 | Cobertura de ~50% na API com 0% em controllers, guards, estratégias JWT, DTOs e main.ts — por isso C-02, C-06 e as falhas de… | ✅ 2026-10-17 |
| B-64 | — | A imagem do MinIO fixada no docker-compose.yml (minio/minio:RELEASE.2025-06-13T11-33-47Z) não existe mais no Docker Hub nem no quay.io —… | 🔄 Parcial 2026-10-18 · em espera (projeto de estudo) |
| B-65 | — | Atendente Online/Offline: só ele troca (seletor no topo), logout e desativação põem Offline, supervisor vê na hora | ✅ 2026-10-19 |
| B-66 | M-21 | Fila compartilhada: quem atender primeiro fica com a conversa (409 "Fulano já está atendendo"), Offline não pega, transferência com permissões, estratégia só MANUAL, seed com 13 setores | ✅ 2026-10-19 |
| B-67 | — | "Pegar próxima": a conversa que espera há mais tempo nos setores de quem pede, nunca a mesma para dois atendentes (FOR UPDATE SKIP LOCKED); Offline 409, fila vazia 204 | ✅ 2026-10-20 |
| B-68 | L-09 | Painel da fila: o do atendente (Pegar próxima, prazos de SLA, aviso de conversa nova) e a visão do supervisor (setores × atendentes) | ✅ 2026-10-21 |
| B-69 | M-14 | Filtros booleanos de query invertidos | ✅ 2026-10-18 |
| B-70 | — | O e2e storage.e2e-spec.ts era intermitente | ✅ 2026-10-18 |
| B-71 | M-13 | A exportação de relatório em CSV não neutralizava fórmulas | ✅ 2026-10-18 |
| B-72 | M-08 | Sessões não acompanhavam a troca de senha | ✅ 2026-10-18 |
| B-73 | M-07 | Atribuir agente punha qualquer conversa em OPEN, inclusive uma encerrada — contornava a regra do updateStatus de que CLOSED não reabre | ✅ 2026-10-18 |
| B-74 | M-09 | WebSocket sem paridade de sessão com o HTTP: o handshake só conferia a assinatura, então token revogado no logout, de usuário desativado… | ✅ 2026-10-18 |
| B-75 | M-11 | O envio de mídia por URL (POST .../messages com mediaUrl) fazia o servidor buscar um endereço informado pelo usuário, protegido só por… | ✅ 2026-10-18 |
| B-76 | M-01 | Efeitos do webhook em regime de "no máximo uma vez": o download da mídia recebida rodava em segundo plano, sem retry e engolindo o erro | ✅ 2026-10-18 |
| B-77 | M-03 | A lista de tipos aceitos pelo storage descartava em silêncio anexos comuns recebidos pelo WhatsApp (pptx, rar, 7z, odt, heic, webm,… | ✅ 2026-10-18 |
| B-78 | M-05 | Auto-atendimento | ✅ 2026-10-18 |
| B-79 | M-06 | Um único worker, com concorrência 1, processava os webhooks de todas as empresas | ✅ 2026-10-18 |
| B-80 | M-27 | Executa o B-46, confirmado pela auditoria | ✅ 2026-10-18 |
| B-81 | M-02 | Tipos de mensagem do WhatsApp sem tratamento viravam texto vazio e a mídia não era baixada (documento com legenda, temporárias, de… | ✅ 2026-10-18 |
| B-82 | M-26 | Webhook configurado em duplicidade na Evolution | ✅ 2026-10-18 |
| B-83 | M-19 | Executa o B-41, confirmado pela auditoria | ✅ 2026-10-18 |
| B-84 | M-10 | Amplificação de requisições | ✅ 2026-10-18 |
| B-85 | M-20 | Auto-cadastro público sem freio | ✅ 2026-10-18 (parcial — verificação de e-mail e CAPTCHA em espera) |
| B-86 | M-23 | Versões major pendentes, cada uma com migração própria | 🔄 Em andamento — Prisma 7, ioredis 6 e Nest 12 ✅ 2026-10-21 |
| B-87 | M-23 | Processo de Git documentado e não praticado | ✅ 2026-10-18 |
| B-88 | M-25 | API_CONTRACT.md desatualizado em pontos operacionais | ✅ 2026-10-18 |
| B-89 | M-24 | Divergências confirmadas na documentação (seção 10.2 da auditoria) | ✅ 2026-10-18 |
| B-90 | M-24 | Roadmap ilegível (390 KB, linhas de 8.700 caracteres): painel curto aqui, detalhe e histórico em docs/03-Roadmap/ROADMAP-HISTORICO.md | ✅ 2026-10-18 |
| B-91 | L-02 | Raiz do repositório limpa: relatório de inclusão de padrões movido para docs/99-Arquivo (os PDFs já tinham saído no B-89) | ✅ 2026-10-18 |
| B-92 | L-03 | Dependabot: prisma e @prisma/client agrupados, Node ímpar ignorado na imagem | ✅ 2026-10-18 |
| B-93 | L-04 | CORS_ORIGINS tolera espaço depois da vírgula; WebSocket aceita o token só em auth | ✅ 2026-10-18 |
| B-94 | L-05 | x-request-id do cliente só é aceito se for curto e simples; senão a API gera um | ✅ 2026-10-18 |
| B-95 | L-06 | JwtAuthGuard e RolesGuard deixam de rodar duas vezes por requisição | ✅ 2026-10-18 |
| B-96 | L-07 | Login com e-mail que não é texto responde 400, não 500; senha nova limitada a 72 bytes; boot com tratamento de erro | ✅ 2026-10-18 |
| B-97 | L-08 | Blacklist de tokens guarda o SHA-256 do token, não o JWT inteiro; sai o count() com KEYS | ✅ 2026-10-18 |
| B-98 | L-10 | SLA: marca de violação zerada ao sair da espera; sem SLA para conversa aberta pela empresa nem fora do expediente | ✅ 2026-10-18 |
| B-99 | L-11 | Auto-atendimento: businessHours validado; todo id da opção conferido contra a empresa; order repetido vira 409 | ✅ 2026-10-18 |
| B-100 | L-12 | Conexão de WhatsApp só aceita departamento da própria empresa; sincronizar status virou POST restrito a ADMIN | ✅ 2026-10-18 |
| B-101 | L-15 | Retenção: notificações lidas expiram em 90 dias (configurável); purga de auditoria pronta, desligada até a decisão de LGPD; sai o log de query sem ouvinte | ✅ 2026-10-18 (mecanismo — prazos de auditoria e conversas em espera) |
| B-102 | L-16 | Diagnóstico de dependências (GET /health/dependencies, ADMIN): banco, Redis, storage e Evolution com timeout de 2 s | ✅ 2026-10-18 |
| B-103 | L-14 | Front ganha ESLint (React, hooks, no-console) na CI; os 10 console.log de produção saíram — resolve o B-47 | ✅ 2026-10-18 |
| B-104 | L-09 | Busca da fila no servidor (com o filtro da aba) e tempo na fila / última atividade em cada conversa | ✅ 2026-10-18 |
| B-105 | L-13 | Relatórios com limite de período (366 dias) e de linhas (5.000); front carrega Dashboard, Relatórios, Contatos e Configurações sob demanda (856 → 462 kB no carregamento inicial) | ✅ 2026-10-18 |
| B-106 | L-17 | Recomendações abertas dos relatórios em PDF registradas como itens B-107 a B-111 | ✅ 2026-10-18 |
| B-107 | L-17 | Fila (producer) sem fail-fast quando o Redis cai: enfileirar pode ficar pendurado em vez de falhar rápido | ⬜ Pendente |
| B-108 | L-17 | Sem circuit breaker nas chamadas à Evolution: com ela fora do ar, cada chamada espera o timeout inteiro | ⬜ Pendente |
| B-109 | L-17 | Logs do processamento de webhook sem o id da mensagem em todas as linhas | ⬜ Pendente |
| B-110 | L-17 | A API usa a credencial administrativa do storage em dev (menor privilégio) | ⬜ Pendente |
| B-111 | L-17 | Payload dos eventos de socket sem tipo compartilhado entre API e front | ⬜ Pendente |
| B-112 | — | Relógio do SLA só no expediente, no fuso da empresa: quem chega com a clínica fechada tem prazo contado da abertura | ✅ 2026-10-20 |
| B-113 | — | Setores do atendente escolhidos no cadastro e na edição dele (um ou vários); mudar os setores reconecta o socket | ✅ 2026-10-19 |
| B-114 | — | SLA do atendimento do Atender ao Encerrar, prazo por setor e no expediente; ao estourar, avisa quem atende e o supervisor | ✅ 2026-10-21 |
| B-115 | — | Aviso alto novo no follow-redirects 1.16.0 (via axios, na API) deixou a auditoria de dependências do CI vermelha | ✅ 2026-10-20 |
| B-116 | — | Setores criados pelo admin conforme a necessidade, até 20 ativos por empresa; o seed não cria mais os 13 setores de exemplo | ✅ 2026-10-21 |
| B-117 | — | No Windows, o localhost do DATABASE_URL fazia transações simultâneas do Prisma falharem (P2028); exemplo e .env local com 127.0.0.1 | ✅ 2026-10-21 |

## 📖 Regras do documento vivo

1. **Problema novo** vira item com ID **antes** de ser corrigido: uma linha curta aqui (Backlog
   completo e, se aberto, Itens abertos) e a linha detalhada no Backlog do histórico.
2. **Ao concluir:** só marcar ✅ depois do critério de aceite; a evidência vai para o Changelog do
   histórico, e o status muda aqui e lá.
3. **Ao fim de cada sessão:** atualizar "Onde estamos" e "Próximos passos".
4. **Decisão de arquitetura/produto:** Registro de decisões do histórico (e ADR, quando couber).
5. **Linhas curtas:** aqui, uma frase por item. Descrição longa só no histórico.
6. **Nunca** remover itens — cancelados viram 🚫 com justificativa.
