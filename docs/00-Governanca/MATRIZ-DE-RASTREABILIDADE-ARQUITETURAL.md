# Architecture Traceability Matrix (ATM) — AtendeHub

**Versão:** 1.0 · **Data:** 2026-08-05 · **Status:** Proposta
**Sucede:** ACR (2026-08-01) → ABR → AGR → AER/Constituição → ASNF/Manual (todos de 2026-08-05,
mesma sessão).

**Natureza deste documento:** rastreabilidade pura. Não cria regra, norma ou decisão nova.
Toda ligação abaixo ou (a) cita o documento/linha de código de onde já foi extraída, ou (b) foi
reverificada diretamente no repositório nesta sessão (contagem de arquivo, grep, leitura),
ou (c) está marcada **NÃO ENCONTRADO**/**NÃO FOI POSSÍVEL VALIDAR**. Nenhum código,
configuração ou outro documento foi alterado na produção deste arquivo.

## Atualização registrada — 2026-08-05 (revisão de ADRs)

Esta ATM previa, na sua própria Parte XV ("Quando atualizar? A cada novo documento da cadeia"),
que a criação de novas ADRs dispararia uma atualização. Dez novas ADRs (`ADR-0009` a
`ADR-0018`) foram escritas na mesma sessão, em `docs/05-ADR/`. Partes I, II, X e XIII desta ATM
foram atualizadas de forma aditiva (novas linhas, correções pontuais) para refletir isso — o
resto do documento não foi reexecutado nem revalidado nesta passada. Um achado novo surgiu
dessa atualização: a Constituição (AER) havia proposto se tornar `ADR-0009`; esse número foi
ocupado por outra decisão antes da Constituição ser formalizada como ADR — ver Parte XIII.

## Achado de abertura — por que este documento já paga por si

Ao reconstruir a Matriz de Componentes (Parte IV), a contagem direta de arquivo
(`find apps/api/src -name "*.controller.ts" | wc -l`) retornou **19**, não 18. Os quatro
documentos anteriores (ABR §1/§2, AGR §2/§11/§12, AER via ASNF Parte X "15/18") usam "18
controllers" na prosa — mas a própria tabela da ABR §2 e a própria tabela de cobertura da ABR
§10.1 **já listavam as 19 linhas corretamente** (`audit-log`, `auth`, `auto-attendance`,
`company`, `contact`, `conversation`, `dashboard`, `department`, `health`, `message`, `note`,
`notification`, `queue`, `report`, `tag`, `user`, `webhook-dlq`, `webhook`, `whatsapp`) — o erro
está só no número resumido em prosa, nunca nos dados subjacentes, e nunca afetou uma conclusão
de segurança (a lista de "5 controllers sem `RolesGuard`" do B-40 está correta e completa nas
duas contagens). Esta ATM usa **19** daqui em diante e sinaliza a correção onde o número "18"
apareceu nos documentos anteriores — ver Parte XIII.

---

# PARTE I — Mapa Mestre de Artefatos

| Código | Artefato | Descrição | Responsabilidade | Dependências | Docs. relacionados | Componentes relacionados | Status |
|---|---|---|---|---|---|---|---|
| ACR | Architecture Consolidation Review (2026-08-01) | Consolidação de padrões pós B-38/B-39/B-48/B-49 | Inventariou módulos, extraiu duplicações (`isUniqueConstraintViolation`, `formatStructuredLog`) | Nenhuma (ponto de partida da cadeia) | `docs/04-Arquitetura/padroes-consolidados-2026-08.md`, `PADROES-ARQUITETURAIS-ATENDEHUB.md`, ADR-0002/0003/0007/0008 | `shared/prisma/prisma-errors.util.ts`, `shared/logging/structured-log.util.ts` | ✅ Concluído |
| ABR | Architecture Baseline Review | Inventário arquitetural com evidência de código | Documentar o estado atual, sem corrigir | ACR (contexto) | `docs/04-Arquitetura/ABR_2026-08-05_baseline.md` | Todos os 19 controllers, ~30 services, guards, Redis, Bull, Prisma, testes | ✅ Concluído |
| AGR | Architecture Governance Review | Auditoria de governança sobre a ABR | Identificar GAPs entre implementado e desejado | ABR | `docs/04-Arquitetura/AGR_2026-08-05_governance.md` | Fluxos de autorização/tenancy, trust boundaries, dependências | ✅ Concluído |
| AER / Constituição | Architecture Enforcement Review | Normas de mais alto nível + mecanismos de enforcement | Definir princípios, políticas, regras `AER-001..025`, RACI, exceções | ABR, AGR | `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` | Todos — é a autoridade normativa proposta | ⚠️ Proposta, não adotada formalmente (ver Parte I §"Como se torna vinculante" do próprio documento) |
| ASNF / Manual | Architecture Standards & Normative Framework | Catálogo detalhado de normas `ASNF-001..125` + 16 antipadrões | Detalhar AER em nível de implementação por domínio técnico | AER | `docs/00-Governanca/MANUAL-DE-ENGENHARIA-DE-SOFTWARE.md` | Todos os componentes técnicos | ⚠️ Proposta, não adotada |
| ATM | Este documento | Rastreabilidade entre todos os artefatos acima | Conectar, não criar | ACR, ABR, AGR, AER, ASNF | Este arquivo | Todos (índice) | ⚠️ Proposta |
| ASM | Architecture Scorecard/Monitoring (futuro, citado no prompt original da AER) | Dashboard vivo de conformidade | — | ATM (quando existir mecanismo automatizado) | **NÃO ENCONTRADO** — não existe nenhum artefato com este nome no repositório | — | ❌ Não existe |
| AEM | (futuro, citado no prompt original da AER) | **NÃO ENCONTRADO** — nome não aparece em nenhum documento além da menção no prompt original | — | — | — | — | ❌ Não existe |
| `ADR-0001..0008` | Architecture Decision Records | Decisões pontuais já aceitas | Registrar decisão com alternativas comparadas | Nenhuma entre si (decisões independentes) | `docs/05-ADR/` | Ver Parte X | ✅ Aceitas |
| `ADR-0009..0018` | Architecture Decision Records (ciclo de vida estendido) | 10 novas ADRs — Modular Monolith, RLS (proposta), Storage, Autorização, Tokens/`localStorage`, Redis, Docker, Nginx, WebSocket, Testes | Formalizar decisões já implementadas ou propor direção para itens pendentes do roadmap | ABR, AGR, AER, ASNF (citadas individualmente em cada ADR) | `docs/05-ADR/` (`INDICE.md` atualizado com dashboard e ciclo de vida) | Ver Parte X (atualizada) | ⚠️ Mistas — ver Parte X para status individual |
| `ADR-0009` (revisão desta ATM: **não é mais "proposto", foi criado**) | ~~Constituição Arquitetural como ADR~~ — nota: a numeração `ADR-0009` foi ocupada por "Modular Monolith" na revisão de ADRs de 2026-08-05, não pela Constituição. A Constituição segue **sem** ADR próprio — ver achado abaixo | — | — | AER | `CONSTITUICAO-ARQUITETURAL.md` §"Como este documento se torna vinculante" | — | ❌ Constituição em si ainda sem ADR — **achado desta atualização**, ver nota |
| `ROADMAP_ESTABILIZACAO.md` | Roadmap técnico ativo | Documento vivo, fonte de verdade #1 do `CLAUDE.md` | Rastrear item por ID, changelog, painel de status | Nenhuma | Cita B-38 a B-49 | Todo o backend/frontend | 🔄 Vivo, atualizado por sessão |
| `ROADMAP_BACKEND.md` | Roadmap técnico histórico | Fechado, virou registro histórico (B1 a B7, 31/31) | — | — | — | `apps/api` | ✅ Encerrado, referência histórica |
| `CLAUDE.md` | Guia do projeto | Convenções, comandos, pitfalls, fontes de verdade | Orienta todo trabalho de código | Nenhuma | Referenciado por todos os documentos desta cadeia | Todo o projeto | ✅ Vigente |
| `CONVENCAO-DE-NOMENCLATURA.md` | Convenção de nomenclatura | Nomeação de arquivo/pasta/identificador/API/banco/teste | Autoridade sobre nomenclatura — ASNF-001..007 a referenciam, não duplicam | Nenhuma | ASNF Parte I | Todo o código | ✅ Vigente, 2026-07-28 |
| `.github/CODEOWNERS` | Política de revisão obrigatória | Define revisor por caminho | Hoje: `@Cmdev2019` em todas as áreas | Nenhuma | AER Parte VI (RACI), AER-024 | Todo o repositório | ✅ Vigente, com gap conhecido (`modules/events/` não coberto especificamente — AER-024) |
| `.github/PULL_REQUEST_TEMPLATE.md` | Checklist de PR | Campo de item de roadmap + checklist técnico | Base do "Checklist de Pull Request" da ASNF Parte XV | Nenhuma | ASNF-013, ASNF-023(checklist) | Todo PR | ✅ Vigente |
| `.github/workflows/api-ci.yml` | Pipeline CI backend | `lint:check` + `tsc --noEmit` + `npm test` (sem `--coverage`) | Gate de merge do backend | Nenhuma | ASNF-107, AER-022 | `apps/api` | ✅ Vigente, com gap (sem cobertura medida — AER-022/ASNF-103) |
| `.github/workflows/web-ci.yml` | Pipeline CI frontend | `npm test` + `npm run build`, **sem lint** (confirmado por leitura integral nesta sessão) | Gate de merge do frontend | Nenhuma | B-47 (roadmap) | `src/` (frontend) | ⚠️ Vigente, gap conhecido e já registrado (B-47) |
| Código (`apps/api/src`) | Implementação real | 19 controllers, 30 services, 3 guards, 3 processors | — | — | Ver Parte IV | — | 🔄 Em produção |
| Testes (`*.spec.ts`, `*.e2e-spec.ts`) | Suíte de teste | 40 arquivos de spec, 367 testes (medição ao vivo desta sessão) | Validar regra de negócio | — | ABR §10, ASNF Parte X | — | 🔄 50,28% de cobertura agregada |

---

# PARTE II — Matriz de Requisitos

Interpretação adotada (explicitada porque o prompt não define "requisito" de forma única para
este projeto): os **10 princípios da Constituição (P-1 a P-10)** são o requisito arquitetural
de mais alto nível já formalizado — cada um se decompõe em políticas (AER Parte II), regras
(`AER-XXX`), normas (`ASNF-XXX`) e, por fim, componente/teste/pipeline real. A Parte VII desta
ATM cobre o roadmap técnico (`B-XX`) em detalhe próprio, para não duplicar.

| Requisito | Origem | ABR | AGR | AER | ASNF | ADR | Implementação (exemplo) | Teste | Pipeline | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| P-1 Secure by Default | AER Parte I | §2 | §2, §3 | AER-001..004 | ASNF-016,070 | ADR-0012 | `JwtAuthGuard`/`RolesGuard` por rota | 3/19 controllers com `*.controller.spec.ts` | `api-ci.yml` (`npm test`) | ⚠️ Parcial — 5 controllers sem `RolesGuard` (B-40) |
| P-2 Menor Privilégio | AER Parte I | §2, §9 | §10 | AER-002,010 | ASNF-017,085 | ADR-0012, ADR-0015 | `RolesGuard`; `Dockerfile` | `roles.guard.spec.ts` (100% cobertura, ABR §10.4) | `api-ci.yml` | ⚠️ Parcial — B-40 (role) e B-44 (root) pendentes |
| P-3 Defesa em Profundidade | AER Parte I | §9 | §6 | Constituição Parte II (Política Storage) | ASNF-078 | — | `storage.service.ts` (allowlist+magic-bytes+key) | **NÃO ENCONTRADO** teste dedicado a magic-bytes | `api-ci.yml` | ✅ Cumprido no único subsistema auditado a fundo (upload) |
| P-4 Multi-tenancy Estrutural | AER Parte I | §4.2 | §4 | AER-005,006 | ASNF-038,046,049 | ADR-0010 (Proposta) | RLS (ausente), `Prisma Extension` (ausente) | **NÃO ENCONTRADO** teste cross-tenant em qualquer camada | `api-ci.yml` | ❌ Não cumprido — B-41 pendente |
| P-5 Separação de Responsabilidades | AER Parte I | — | §5.3 | AER-017 | ASNF-020,120 | ADR-0009 | `WebhookService` (caso violador conhecido) | `webhook.service.spec.ts` (83,24% cobertura, ABR §10) | `api-ci.yml` | ⚠️ 1 violação conhecida, não corrigida |
| P-6 Idempotência | AER Parte I | — | — | AER-018 | ASNF-051,069 | ADR-0002 | `MessageService#createUnique`, `ConversationService#upsertFromWebhook` | `validate-b48-concurrency.ts`, `validate-b49-concurrency.ts` (2-100 workers) | `api-ci.yml` (suíte padrão; scripts de concorrência são execução manual documentada) | ✅ Cumprido nos 2 casos conhecidos |
| P-7 Observabilidade Proporcional | AER Parte I | — | — | AER-018 | ASNF-093,094 | ADR-0008 | `Logger`/`formatStructuredLog` em `MessageService`/`ConversationService` | Cobertos pelos specs dos 2 services | `api-ci.yml` | ✅ Cumprido nos 2 casos conhecidos |
| P-8 Fail Fast (config) / Fail Safe (runtime) | AER Parte I | §9 | §10 | AER-016,023(ASNF) | ASNF-036,062 | — | `validateSecrets`/`validateCorsOrigins` (`main.ts`) | **NÃO ENCONTRADO** teste automatizado do `process.exit(1)` (validado só por log observado em execução manual) | `api-ci.yml` | ✅ Boot / ⚠️ Runtime (fail-open do `TokenBlacklistService` documentado, não testado) |
| P-9 Explícito sobre Implícito | AER Parte I | §4.1 | §4.1 | AER-004 | ASNF-045 | — | Parâmetro `companyId` explícito em todo service | Cobertura indireta (services que o violassem quebrariam testes existentes) | `api-ci.yml` | ✅ Cumprido, sem exceção encontrada |
| P-10 Config sobre Convenção Justificada | AER Parte I | §11 | §2 | — | ASNF-023 | ACR 2026-08-01 | Ausência de Repository (decisão registrada) | N/A | N/A | ✅ Decisão documentada, dependente de P-1/P-4 se tornarem estruturais |

---

# PARTE III — Matriz de Governança

Fluxo: **Princípio → Política → Norma → Controle → Implementação → Validação → Monitoramento.**
Uma linha por princípio, mostrando a cadeia completa até onde ela hoje chega — muitas param em
"Implementação" porque "Validação"/"Monitoramento" automatizados **não existem ainda** (mesmo
aviso final da Constituição e do Manual, reafirmado aqui com evidência específica por linha).

| Princípio | Política (AER Parte II) | Norma (ASNF) | Controle (AER Parte V / regra) | Implementação | Validação | Monitoramento |
|---|---|---|---|---|---|---|
| P-1 | Política de Controllers | ASNF-016,017,070 | AER-001,002 | `JwtAuthGuard`/`RolesGuard` (código real) | Code review (manual, hoje) | **NÃO ENCONTRADO** — nenhum controle automático roda em CI |
| P-2 | Política Docker | ASNF-085 | AER-010 | `apps/api/Dockerfile` (roda como root — violação ativa) | Code review | **NÃO ENCONTRADO** |
| P-3 | Política Storage | ASNF-078 | AER Política Storage | `storage.service.ts` | Testes unitários de `StorageService` (existem, ABR §10 mostra `96,66%` de cobertura) | **NÃO ENCONTRADO** alerta de tentativa de upload rejeitada em produção |
| P-4 | Política Prisma | ASNF-038,046,049 | AER-005,006 | **NÃO ENCONTRADO** (RLS não implementado) | **NÃO ENCONTRADO** | **NÃO ENCONTRADO** — Constituição Parte V propõe controle diário via `pg_tables`, não implementado |
| P-5 | Política de Services | ASNF-020,120 | AER-017 | `WebhookService` (violação conhecida, não corrigida) | Contagem de dependências é manual hoje | **NÃO ENCONTRADO** |
| P-6 | ADR-0002/0003 | ASNF-051,069 | AER-018 | `createUnique`/`upsertFromWebhook` | `message.service.spec.ts`, `conversation.service.upsert-from-webhook.spec.ts` | Log estruturado (`formatStructuredLog`, nível `warn`) — **é o único princípio desta lista com monitoramento real, ainda que passivo (log, não alerta ativo)** |
| P-7 | Política de Logs | ASNF-093,094 | AER Política de Logs | Winston + Sentry | Testado indiretamente | Sentry captura erro 5xx em produção (mecanismo real, ativo) |
| P-8 | — | ASNF-036,062 | AER-016,023 | `validateSecrets`/`validateCorsOrigins` | Validado ao vivo no boot (derruba o processo se errado — é o próprio mecanismo de validação) | Log de erro no boot (`logger.error`) — visível em log do container, sem alerta dedicado |
| P-9 | — | ASNF-045 | AER-004 | Parâmetro explícito em todo service | Code review | **NÃO ENCONTRADO** |
| P-10 | Política de Repositories | ASNF-023 | — | Ausência de Repository | ADR (ACR 2026-08-01) documenta a decisão | Revisão periódica proposta (Constituição Parte X, "longo prazo") |

**Resposta às perguntas obrigatórias da Parte III:**
- **Onde cada princípio é implementado?** Coluna "Implementação" acima — 8 de 10 têm
  implementação real hoje (P-4 é o único sem nenhuma; P-5 tem violação ativa conhecida).
- **Onde é validado?** Majoritariamente "code review" (processo manual) — só P-6/P-7/P-8 têm
  validação que roda de fato (teste automatizado ou comportamento observável em runtime).
- **Onde é auditado?** Nenhum princípio tem auditoria periódica automatizada rodando hoje — a
  Constituição Parte V **propõe** controles recorrentes (cobertura, deriva de RLS, fan-out,
  headers, consolidação de Redis, CODEOWNERS, idade de exceção), nenhum implementado.

---

# PARTE IV — Matriz de Componentes

Contagem verificada nesta sessão (`find`, ver achado de abertura): **19 controllers, 30
services, 3 guards, 3 processors de fila, 40 arquivos de spec** (3 de controller, 22 de
service, 15 restantes entre utilitários/middlewares/shared).

| Tipo de componente | Qtd. | Docs. relacionados | Normas aplicáveis | Regras AER | ADR | Testes | Pipeline | Responsável | Criticidade |
|---|---|---|---|---|---|---|---|---|---|
| Controllers | 19 | ABR §2, AGR §2/§3 | ASNF-015..018 | AER-001,002,003 | — | 3/19 com spec próprio (ABR §10.1, corrigido de "3/18" para "3/19" nesta ATM) | `api-ci.yml` | Backend Dev | 🔴 (autorização) |
| Services | 30 | ABR §5/§11, AGR §5 | ASNF-019..022 | AER-017,019 | ADR-0002,0003 | 22/30 com spec próprio | `api-ci.yml` | Backend Dev | 🟠 |
| Guards (`JwtAuthGuard`, `LocalAuthGuard`, `RolesGuard`) | 3 | ABR §3 | ASNF-031 | AER-001,002,015 | — | `roles.guard.spec.ts` (100% cobertura); `jwt-auth.guard.ts` (69,23%, branch 0%); `local-auth.guard.ts` (0%) | `api-ci.yml` | Security | 🔴 |
| Middlewares (`RequestIdMiddleware`) | 1 | ABR §4.1 | ASNF-030 | — | ADR-0008 | `request-id.middleware.spec.ts` | `api-ci.yml` | Backend Dev | 🟢 |
| Interceptors (`MediaPresignInterceptor`) | 1 (global, `APP_INTERCEPTOR`) | ABR §2 | ASNF-032 | — | — | `media-presign.interceptor.spec.ts` | `api-ci.yml` | Backend Dev | 🟡 |
| Pipes | `ValidationPipe` (global, do Nest) | ABR §9 | ASNF-025 | — | — | Coberto indiretamente por todo teste de DTO | `api-ci.yml` | Backend Dev | 🟠 |
| Workers/Bull (filas) | 4 (`webhook`, `webhook-dlq`, `sla-check`, `auto-attendance-inactivity`); 3 processors (webhook-dlq não tem `@Processor` próprio) | ABR §7 | ASNF-063..069 | AER-008 | ADR-0005,0006 | `sla-check.processor.spec.ts`, `webhook.processor.spec.ts`, `webhook-dlq.service.spec.ts` | `api-ci.yml` | Backend Dev | 🟠 |
| Redis (clients) | 5 (4 explícitos + BullMQ) | ABR §6 | ASNF-057..062 | Constituição Parte V (controle) | — | `token-blacklist.service.spec.ts`, `health.service.spec.ts` (mockam `ioredis`) | `api-ci.yml` | DevOps | 🟡 |
| Prisma | 1 `PrismaService`, fan-in 26 | ABR §5, AGR §5.1 | ASNF-046..056 | AER-005,006,007 | ADR-0002,0003 | Coberto indiretamente por todo spec de service | `api-ci.yml` | Backend Dev | 🔴 |
| Docker | `apps/api/Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml` | AGR §10 | ASNF-085..092 | AER-010,011,012 | — | **NÃO ENCONTRADO** teste automatizado de container | Nenhum (gap — não há step de build/scan de imagem no CI hoje) | DevOps | 🟠 |
| Nginx | `infra/nginx/nginx.conf`, `infra/nginx/Dockerfile` | AGR §6/§9 | ASNF-075,088 | AER-013,014 | — | **NÃO ENCONTRADO** | Nenhum | DevOps | 🟠 |
| Storage (MinIO) | `shared/storage/storage.service.ts` | ABR §9, AGR §4.3 | ASNF-041,078 | AER-009 | — | `storage.service.spec.ts` (96,66%) | `api-ci.yml` | Backend Dev | 🟡 |
| WebSocket | `events.gateway.ts`, `redis-io.adapter.ts` | ABR §2, AGR §9.1 | ASNF-084,114 | AER-015 | — | **NÃO ENCONTRADO** `events.gateway.spec.ts` — `events.service.ts` tem 15,38% de cobertura (ABR §10.3) | `api-ci.yml` | Backend Dev + Security | 🟠 |

---

# PARTE V — Matriz Multi-Tenant

Reconstrução do fluxo já diagramado na AGR §4.1, com colunas de rastreabilidade adicionadas —
nenhum estágio novo, nenhuma reinterpretação.

| Etapa | ABR | AGR | AER | ASNF | ADR | Testes | Pipeline |
|---|---|---|---|---|---|---|---|
| JWT (nasce no login) | §4.1 | §4.2 | — | ASNF-070 | — | `auth.service.spec.ts` | `api-ci.yml` |
| Middleware | §4.1 | §4.1 | — | ASNF-030 | ADR-0008 (só `requestId`, não `companyId` — confirmado, não é gap, é P-9) | `request-id.middleware.spec.ts` | `api-ci.yml` |
| Request Context (`AsyncLocalStorage`) | §4.1 | §4.1 | P-9 | ASNF-045 | — | **NÃO ENCONTRADO** (não há o que testar — `companyId` não passa por aqui, por desenho) | — |
| Controller | §2 | §3 | AER-001,002 | ASNF-016,017 | — | 3/19 controllers com spec | `api-ci.yml` |
| Service | §4.4, §5 | §4.2 | AER-005..009 | ASNF-019,038 | — | 22/30 services com spec | `api-ci.yml` |
| Repository | §11 | §2 | — | ASNF-023 | ACR 2026-08-01 | N/A (não existe) | — |
| Prisma | §5 | §4 | AER-006,007 | ASNF-046..056 | ADR-0002,0003 | Indireto via specs de service | `api-ci.yml` |
| Redis | §6 | §4.1 | Constituição Parte V | ASNF-057..062 | — | Mockado nos 2 specs relevantes | `api-ci.yml` |
| Bull | §7 | §4.1 | AER-008 | ASNF-063 | ADR-0005,0006 | `sla-check.processor.spec.ts` (carrega `companyId`) | `api-ci.yml` |
| Worker | §7 | §4.1 | AER-008 | ASNF-063 | — | Idem | `api-ci.yml` |
| WebSocket | §2 | §4.1, §9.1 | AER-015 | ASNF-084,114 | — | **NÃO ENCONTRADO** | — |
| Storage | §9 | §4.3 | AER-009 | ASNF-041 | — | `storage.service.spec.ts` — **não cobre o cenário cross-tenant especificamente** (achado da AGR, não corrigido) | `api-ci.yml` |
| Banco (RLS) | §4.2 | §4 | AER-005 | ASNF-049 | — | **NÃO ENCONTRADO** | — |

**Cobertura de rastreabilidade desta matriz: 13 estágios, 11 com ao menos 1 documento+norma+teste
citável (mesmo que o teste seja "mockado" ou "indireto"), 2 sem nenhum teste
(`AsyncLocalStorage`/`companyId` — não aplicável por desenho; WebSocket — gap real) e 1 sem
implementação (RLS/Banco).**

---

# PARTE VI — Matriz de Segurança

| Risco | Origem | Controle | Norma | Implementação | Teste | CI | Pipeline | Responsável | Status |
|---|---|---|---|---|---|---|---|---|---|
| Vazamento cross-tenant via ausência de RLS | AGR §4.2 (Heat Map 🔴) | AER-005 | ASNF-049 | **NÃO ENCONTRADO** | **NÃO ENCONTRADO** | Não | `api-ci.yml` (não cobre) | Security | ❌ Sem mitigação |
| `AGENT` acessa conversa de outro departamento (B-40) | AGR §2/§3 (🔴) | AER-001,002 | ASNF-016,017 | **NÃO ENCONTRADO** guard de escopo | **NÃO ENCONTRADO** | Não | `api-ci.yml` (não cobre) | Security | ❌ Sem mitigação |
| `updateMany` sem `companyId` (3 pontos) | ABR §4.3 | AER-006 | ASNF-046 | `message.service.ts:261`, `webhook.service.ts:365`, `whatsapp.service.ts:289` (violações ativas) | Cobertos por spec de comportamento funcional, **não** por teste de isolamento de tenant | Sim (spec roda no CI) | `api-ci.yml` | Backend Dev | ⚠️ Parcialmente mitigado (funcional ok, tenant não testado) |
| WebSocket sem checagem de blacklist/`isActive` | AGR §9.1 (🟠) | AER-015 | ASNF-084 | `events.gateway.ts:63-89` (violação ativa) | **NÃO ENCONTRADO** | Não | — | Security | ❌ Sem mitigação |
| Nginx sem headers/rate limit próprios | AGR §6/§9 (🟠), roadmap B-43 | AER-013,014 | ASNF-075,088 | **NÃO ENCONTRADO** | **NÃO ENCONTRADO** | Não | — | DevOps | ❌ Sem mitigação |
| Container roda como root | AGR §10 (🟠), roadmap B-44 | AER-010 | ASNF-085 | **NÃO ENCONTRADO** | **NÃO ENCONTRADO** | Não | — | DevOps | ❌ Sem mitigação |
| `StorageService` não reconfere `companyId` na leitura/exclusão | AGR §4.3 (🟡) | AER-009 | ASNF-041 | **NÃO ENCONTRADO** | Não (spec cobre o caminho feliz, não o cross-tenant) | Sim (spec existente roda) | `api-ci.yml` | Backend Dev | ❌ Sem mitigação específica |
| Força bruta de login | ABR §9 | AER (Constituição Política JWT) | ASNF-073 | `@Throttle({limit:5,ttl:60_000})`, `auth.controller.ts:30` | **NÃO ENCONTRADO** teste dedicado ao throttle em si (comportamento do `ThrottlerGuard`, biblioteca de terceiro) | Sim (implementação roda) | `api-ci.yml` | Security | ✅ Mitigado |
| Upload malicioso (MIME/spoofing) | ABR §9 | Política Storage | ASNF-078 | `storage.service.ts:21-59,161-211` | `storage.service.spec.ts` (96,66% cobertura) | Sim | `api-ci.yml` | Backend Dev | ✅ Mitigado e testado |
| Idempotência sob concorrência real (B-48/B-49) | ADR-0002/0003 | AER-018 | ASNF-051,105 | `createUnique`, `upsertFromWebhook` | `validate-b48-concurrency.ts`, `validate-b49-concurrency.ts` (execução manual, 2-100 workers, documentado no roadmap) | Não (script não roda no CI automaticamente — **achado desta ATM**, ver Parte XIII) | Não integrado ao `api-ci.yml` | Backend Dev | ⚠️ Mitigado, validação não é contínua |

**Respostas obrigatórias:**
- **Todo risco possui mitigação?** Não — 5 de 9 riscos listados estão em ❌ (sem mitigação),
  todos já eram conhecidos (B-40, B-41, B-43, B-44, e o achado novo do `StorageService`).
- **Toda mitigação possui teste?** Não — mesmo onde a mitigação existe (upload, idempotência,
  rate limit), só upload e idempotência funcional têm teste automatizado que roda no CI; o
  script de concorrência real (a validação mais forte que o projeto tem) **não está integrado
  ao pipeline**, é execução manual pontual documentada no roadmap.
- **Todo teste possui pipeline?** Sim, para o que existe como `*.spec.ts` (todos rodam via
  `api-ci.yml`/`npm test`). Não, para os scripts de validação de concorrência (`validate-b48-
  concurrency.ts`/`validate-b49-concurrency.ts`) — **achado**: eles não são referenciados em
  nenhum workflow do `.github/workflows/`.
- **Toda pipeline possui responsável?** Sim, por convenção de CODEOWNERS (`@Cmdev2019` cobre
  `/apps/api/` e `/.github/workflows/`), mas não há um responsável **nomeado por pipeline
  individual** documentado fora do CODEOWNERS genérico.

---

# PARTE VII — Matriz de Roadmaps

| Item | Descrição (resumo) | Docs. relacionados | Normas relacionadas | ADR | Componentes afetados | Testes | Pipeline | Status | Prioridade |
|---|---|---|---|---|---|---|---|---|---|
| B-38 | Bucket MinIO privado + URL assinada | ABR §9 (referência positiva) | ASNF-078 | — | `storage.service.ts` | `storage.service.spec.ts`, `storage.e2e-spec.ts` | `api-ci.yml` | ✅ Concluído | — |
| B-39 | Retry de webhook com DLQ | ABR §7 | ASNF-064,068 | ADR-0005,0006 | `webhook.processor.ts`, `webhook-dlq.*` | `webhook.processor.spec.ts`, `webhook-dlq.service.spec.ts` | `api-ci.yml` | ✅ Concluído | — |
| B-40 | Escopo de permissão por departamento/agente | ABR §2, AGR §2/§3/§13 | ASNF-016,017,042,043 | Sugerido: novo ADR de autorização (AER-025) | 5 controllers (`Conversation`, `Message`, `Note`, `Dashboard`, `Report`) | **NÃO ENCONTRADO** — nenhum teste ainda, é o próprio motivo do gap | `api-ci.yml` (não cobre autorização por escopo hoje) | ⬜ Pendente | 🔴 Crítica |
| B-41 | RLS + `updateMany` sem `companyId` | ABR §4.2/§4.3, AGR §4.2/§13 | ASNF-046,049 | Sugerido: novo ADR de multi-tenancy | `infra/postgres/init.sql`, 3 pontos de código | **NÃO ENCONTRADO** | — | ⬜ Pendente | 🔴 Crítica |
| B-42 | Preview de mídia sem legenda não atualiza conversa | ABR §2 (tabela B-40..44) | — | — | `webhook.service.ts:226-228,421-501` | `webhook.service.spec.ts` (não cobre este caso ainda, por definição do bug) | `api-ci.yml` | ⬜ Pendente | 🟠 Alta |
| B-43 | Nginx sem headers/rate limit/redirect | ABR, AGR §6/§9 | ASNF-075,088 | — | `infra/nginx/nginx.conf` | **NÃO ENCONTRADO** | Nenhum | ⬜ Pendente | 🟠 Alta |
| B-44 | Docker root, sem healthcheck/shutdown gracioso | ABR, AGR §10 | ASNF-085..091 | — | `Dockerfile`, `docker-compose.prod.yml`, `main.ts` | **NÃO ENCONTRADO** | Nenhum | ⬜ Pendente | 🟠 Alta |
| B-45 | Sem Swagger/OpenAPI | ABR §2 | — | — | `main.ts`, todos os controllers | N/A | — | ⬜ Pendente | 🟢 Baixa |
| B-46 | 5 clients Redis sem provider compartilhado | ABR §6, AGR §5 | ASNF-057 | — | 4 services + BullMQ | Specs mockados existentes, não testam consolidação (não existe ainda) | `api-ci.yml` | ⬜ Pendente | 🟡 Média |
| B-47 | Frontend sem lint | AGR (citado por completude) | — | — | `web-ci.yml`, `package.json` (raiz) | N/A | `web-ci.yml` (confirma ausência, lido nesta sessão) | ⬜ Pendente | 🟢 Baixa |
| B-48 | Corrida de idempotência de mensagem | ABR (referência), roadmap | ASNF-051,105 | ADR-0002,0003 | `message.service.ts` | `message.service.spec.ts`, `validate-b48-concurrency.ts` | `api-ci.yml` (spec) / manual (script) | ✅ Concluído | — |
| B-49 | Corrida equivalente em `ConversationService` | ABR, roadmap | ASNF-051,105,052 | ADR-0002,0003 | `conversation.service.ts` | `conversation.service.upsert-from-webhook.spec.ts`, `validate-b49-concurrency.ts` | `api-ci.yml` (spec) / manual (script) | ✅ Concluído | — |
| *(sem ID)* — Paridade WebSocket | AGR §9.1/§16 (sugestão A) | ASNF-084 | AER-015 | `events.gateway.ts` | **NÃO ENCONTRADO** | — | ⬜ Sugerido, sem ID no roadmap | 🟠 Alta |
| *(sem ID)* — Decomposição `WebhookService` | AGR §5.3/§16 (sugestão B) | ASNF-021 | AER-017 | `webhook.service.ts` | `webhook.service.spec.ts` (83,24%) | `api-ci.yml` | ⬜ Sugerido, sem ID | 🟡 Média |
| *(sem ID)* — Cobertura de controller pré-requisito de B-40 | AGR §16 (sugestão C) | ASNF-101 | AER-020 | Os 19 controllers | 3/19 têm spec hoje | `api-ci.yml` | ⬜ Sugerido, sem ID | 🟠 Alta |
| *(sem ID)* — Storage reconferir `companyId` | AGR §4.3/§16 (sugestão D) | ASNF-041 | AER-009 | `storage.service.ts` | **NÃO ENCONTRADO** | — | ⬜ Sugerido, sem ID | 🟡 Média |

---

# PARTE VIII — Matriz de Testes

Base: medição real via `npx jest --coverage` executada na sessão da ABR (40 suites, 367
testes, 50,28% statements agregado) — não uma estimativa.

| Componente | Unit | Integração | E2E | Cobertura medida | Pipeline | Critério mínimo (ASNF) | Atende? |
|---|---|---|---|---|---|---|---|
| Controllers (19) | 3/19 têm spec | — | 2 e2e cobrem fluxo parcial (`sla`, `storage`) | 3 controllers >90%; **16/19 em 0%** (corrigido de "15/18") | `api-ci.yml` | ASNF-101: todo controller com guard tem spec cobrindo caminho negativo | ❌ Não — 16 controllers não atendem |
| Services (30) | 22/30 têm spec | — | Parcial via e2e | Agregado alto nos que têm spec; `company.service.ts`/`department.service.ts`/`note.service.ts` em 0% | `api-ci.yml` | Constituição Política de Testes: caminho negativo de autorização coberto | ⚠️ Parcial — 3 services em 0% |
| Guards (3) | 2/3 têm spec dedicado | — | — | `roles.guard.ts` 100%; `jwt-auth.guard.ts` 69,23% (branch 0%); `local-auth.guard.ts` 0% | `api-ci.yml` | ASNF-100 | ⚠️ Parcial |
| Workers/Processors (3) | 3/3 têm spec | — | — | Não extraído individualmente nesta sessão para os 3 — **NÃO FOI POSSÍVEL VALIDAR** número exato por processor além do que a ABR já capturou para `webhook.processor.ts`/`sla-check.processor.ts` | `api-ci.yml` | ASNF-069 | ✅ Parcial, sem gap crítico conhecido |
| Redis (5 clients) | 2/5 diretamente testados (mockados) | — | — | `token-blacklist.service.ts` 82,85%; `health.service.ts` 92,85% | `api-ci.yml` | ASNF Parte V (sem critério numérico definido) | ⚠️ Sem critério formal para avaliar |
| Prisma | Indireto (todo service) | — | `storage.e2e-spec.ts`, `sla.e2e-spec.ts` batem em Postgres real | `prisma.service.ts` 45,45% (linha), 0% função | `api-ci.yml` | ASNF-105 (concorrência real) | ⚠️ Concorrência validada só manualmente (B-48/B-49) |
| Storage | `storage.service.spec.ts` | `storage.e2e-spec.ts` | — | 96,66% | `api-ci.yml` | ASNF-078 | ✅ Atende |
| WebSocket | **NÃO ENCONTRADO** spec de `events.gateway.ts` | — | — | `events.service.ts` 15,38% | `api-ci.yml` (não cobre gateway) | ASNF-084 | ❌ Não atende |

**Respostas obrigatórias:**
- **Existe componente crítico sem testes?** Sim — `EventsGateway` (autenticação WebSocket, 🔴 na
  Parte VI), `CompanyService`/`DepartmentService`/`NoteService` (0% de cobertura, ABR §10.2), 16
  controllers.
- **Existe regra sem validação?** Sim — todas as regras `AER-XXX`/normas `ASNF-XXX` marcadas
  ❌/⚠️ nas Partes III/VI/VIII desta ATM.
- **Existe norma sem cobertura?** Sim — qualquer norma cujo componente afetado esteja na lista
  acima em 0%/❌ (ex.: ASNF-084 sobre `EventsGateway`).

---

# PARTE IX — Matriz de Automação

Tally real, extraído por contagem programática do texto já publicado (não reclassificado
manualmente de novo nesta sessão, para não introduzir uma segunda opinião divergente da
primeira):

**AER (25 regras, Constituição Parte III):** 9 com automação de "alta viabilidade", 7 "média/
parcial", 4 "baixa", 5 sem essa classificação textual explícita (ex.: mecanismos já
implementados como o teste tripwire do AER-019, ou processuais como aprovação de exceção).

**ASNF (125 normas):** por leitura da coluna "Automatizável" — aproximadamente 28 normas
majoritariamente ✅, 31 majoritariamente ⚠️, 49 majoritariamente ❌, e o restante em células
compostas (ex.: "✅ detecção / ❌ decisão") que não se resumem a um único símbolo.

| Faixa de regra/norma | Validação manual | Lint | CI/GitHub Actions | Testes | Análise estática | Scripts | Monitoramento | Ferramenta futura citada |
|---|---|---|---|---|---|---|---|---|
| AER-001,002,003 (guards) | ✅ hoje | — | Script de varredura de controller (proposto, não existe) | — | — | — | — | Script de CI (Constituição Parte IV) |
| AER-005,006 (RLS, updateMany) | ✅ hoje | — | Cron/CI de deriva de RLS (proposto) | — | — | — | Query `pg_tables` periódica (proposta) | Prisma Client Extension |
| AER-010,011 (Docker) | ✅ hoje | — | — | — | `hadolint` (proposto, não instalado) | — | — | `hadolint` |
| AER-013 (Nginx headers) | ✅ hoje | — | Smoke test pós-deploy (proposto) | — | — | `curl -I` (proposto) | — | — |
| AER-017/ASNF-120 (fan-out) | ✅ hoje | Regra ESLint customizada (proposta, não existe) | — | — | — | Script de contagem (já usado *nesta sessão* como método manual, não integrado a CI) | — | — |
| ASNF-025 (DTO validation) | Parcial (`ValidationPipe` cobre shape, não decorator ausente) | — | — | Indireto | — | — | — | — |
| ASNF-046,048 (Prisma raw/updateMany) | ✅ hoje | Lint customizado (proposto) | — | — | — | — | — | Prisma Client Extension |
| ASNF-079 (secrets) | ✅ hoje | — | `gitleaks`/`trufflehog` (proposto, não instalado) | — | — | — | — | `gitleaks` |
| ASNF-100..103 (cobertura) | ✅ hoje | — | `jest --coverage` + `coverageThreshold` (proposto — CI hoje roda sem `--coverage`) | ✅ (a suíte em si já roda) | — | — | — | — |
| ASNF-121 (duplicação) | ✅ hoje | — | `jscpd` (proposto, não instalado) | — | — | — | — | `jscpd` |
| AER-019/ASNF-052 (enum tripwire) | — | — | **✅ Já em produção, roda a cada `npm test`** | ✅ | — | — | — | — |

**Único controle 100% automático já em produção hoje, confirmado nesta sessão:** o teste
tripwire de `ConversationStatus` (AER-019). **Todo o resto do conjunto AER+ASNF depende de
revisão manual hoje**, com a via de automação já desenhada (ferramenta nomeada) em boa parte
dos casos — o gap não é de desenho, é de implementação, e nenhuma delas foi instalada por regra
desta cadeia de revisões (nenhuma alterou código/configuração).

---

# PARTE X — Matriz de Decisões

| ADR | Título | AER relacionado | ASNF relacionado | Código | Teste | Pipeline | Roadmap |
|---|---|---|---|---|---|---|---|
| ADR-0001 | Estrutura de monorepo com documentação numerada | — | ASNF-002,003,004 | Estrutura de pastas (`apps/`, `docs/NN-Nome/`) | N/A (estrutural) | N/A | Não referenciado a um `B-XX` específico (decisão de reestruturação, própria fase) |
| ADR-0002 | Estratégia de idempotência | AER-018 | ASNF-051,069 | `MessageService#createUnique` | `message.service.spec.ts` | `api-ci.yml` | B-48 |
| ADR-0003 | Persistência atômica — sem helper genérico | — (referenciado na ASNF Parte IV como racional de ASNF-056) | ASNF-056 | `prisma-errors.util.ts` | `prisma-errors.util.spec.ts` | `api-ci.yml` | B-48/B-49 |
| ADR-0004 | Estratégia de concorrência e seus testes | AER (Constituição Política de Testes, sem número específico) | ASNF-105 | `validate-b48-concurrency.ts`, `validate-b49-concurrency.ts` | Os próprios scripts (execução manual) | **NÃO integrado ao CI** (achado, ver Parte VI/XIII) | B-48/B-49 |
| ADR-0005 | Estratégia de retry | AER-008 (parcial) | ASNF-065 | `webhook-queue.config.ts` | `webhook-queue.config.spec.ts` | `api-ci.yml` | B-39 |
| ADR-0006 | Dead Letter Queue | — | ASNF-064,068 | `webhook-dlq.*` | `webhook-dlq.service.spec.ts` | `api-ci.yml` | B-39 |
| ADR-0007 | Três classificadores de erro, um por camada | — | Não referenciado diretamente na ASNF (gap — ver Parte XIII) | `sentry.ts`, `webhook.errors.ts`, `ValidationPipe` | `sentry.spec.ts`, `webhook.errors.spec.ts` | `api-ci.yml` | B-18, B-39 |
| ADR-0008 | Observabilidade (correlação de log) | P-7 (Constituição) | ASNF-093,094 | `request-context.ts`, `winston.logger.ts` | `request-id.middleware.spec.ts`, `winston.logger.spec.ts` | `api-ci.yml` | — |
| ADR-0009 | Modular Monolith; critérios de extração | Princípio P-5 | ASNF-020,021,120..123 | `webhook.service.ts` | N/A | `api-ci.yml` | B-38..B-49 (contexto), sem item próprio |
| ADR-0010 | RLS — rede de isolamento multi-tenant (**Proposta**) | AER-005,006 | ASNF-038,046,049 | `infra/postgres/init.sql` | NÃO ENCONTRADO | NÃO ENCONTRADO | **B-41** |
| ADR-0011 | Storage privado com URL assinada | Política Storage | ASNF-032,041,078 | `storage.service.ts` | `storage.service.spec.ts` | `api-ci.yml` | B-38 |
| ADR-0012 | Modelo de autorização RBAC + escopo (**parcial Proposta**) | AER-001..004 | ASNF-016,017,042,043 | `roles.guard.ts` | `roles.guard.spec.ts` | `api-ci.yml` | **B-40** |
| ADR-0013 | Tokens em `localStorage` | Política JWT | ASNF-070..084 | `auth.controller.ts` | `auth.service.spec.ts` | `api-ci.yml` | B-19, **B-43** (condicionante) |
| ADR-0014 | Redis especializado sem provider compartilhado | Constituição Parte V | ASNF-057..062 | `token-blacklist.service.ts` e outros 3 | 2 specs mockados | `api-ci.yml` | **B-46** |
| ADR-0015 | Docker multi-stage; hardening pendente (**parcial Proposta**) | AER-010..012 | ASNF-085..092 | `apps/api/Dockerfile` | NÃO ENCONTRADO | NÃO ENCONTRADO | **B-44** |
| ADR-0016 | Nginx borda única; hardening pendente (**parcial Proposta**) | AER-013,014 | ASNF-075,088 | `infra/nginx/nginx.conf` | NÃO ENCONTRADO | NÃO ENCONTRADO | **B-43** |
| ADR-0017 | WebSocket handshake JWT; paridade pendente (**parcial Proposta**) | AER-015 | ASNF-031,084,114 | `events.gateway.ts` | NÃO ENCONTRADO | NÃO ENCONTRADO | sem ID (sugestão AGR §16) |
| ADR-0018 | Testes: unitário mockado, e2e dirigido; gate pendente (**parcial Proposta**) | AER-020..022 | ASNF-100..109 | 40 arquivos de spec | Os próprios specs | `api-ci.yml` (sem `--coverage`) | sem ID (sugestão AGR §16) |
| ADR-0009 (Constituição) | **NÃO CRIADO** — a Constituição propôs se tornar `ADR-0009`, mas esse número foi ocupado por "Modular Monolith" na revisão de ADRs de 2026-08-05 (que priorizou o backlog v1.0 já listado em `INDICE.md`, não a auto-referência da Constituição) | Toda a Constituição | Todo o Manual | — | — | — | Achado desta atualização — ver Parte XIII |

---

# PARTE XI — Matriz de Riscos

Consolidação do Heat Map da AGR §11 com colunas de rastreabilidade — nenhum risco novo.

| Risco | Origem | Componente | Mitigação | Norma | Controle | Teste | Pipeline | Status | Criticidade |
|---|---|---|---|---|---|---|---|---|---|
| Ausência de escopo por departamento/agente | AGR §11 | 5 controllers | Guard de escopo (não implementado) | ASNF-016,017 | AER-002 | Nenhum | Nenhum | ❌ | 🔴 |
| RLS ausente | AGR §11 | Postgres | RLS + Prisma Extension (não implementado) | ASNF-049 | AER-005 | Nenhum | Nenhum | ❌ | 🔴 |
| `WebhookService` God Service | AGR §11 | `webhook.service.ts` | Decomposição (não implementado) | ASNF-021,120 | AER-017 | `webhook.service.spec.ts` (83,24%, cobre comportamento, não a decomposição) | `api-ci.yml` | ⚠️ | 🔴 |
| Nginx sem headers/rate limit | AGR §11 | `nginx.conf` | Headers/rate limit (não implementado) | ASNF-075,088 | AER-013,014 | Nenhum | Nenhum | ❌ | 🟠 |
| Docker sem healthcheck/shutdown | AGR §11 | `Dockerfile`/compose | (não implementado) | ASNF-085..091 | AER-010,011,012 | Nenhum | Nenhum | ❌ | 🟠 |
| WebSocket sem blacklist/`isActive` | AGR §11 | `events.gateway.ts` | (não implementado) | ASNF-084 | AER-015 | Nenhum | Nenhum | ❌ | 🟠 |
| 5 clients Redis sem consolidação | AGR §11 | 4 services + Bull | Provider compartilhado (não implementado) | ASNF-057 | Constituição Parte V | Specs mockados existentes (não testam consolidação, que não existe) | `api-ci.yml` | ⚠️ | 🟡 |
| Cobertura de controller 0% (16/19) | AGR (achado desta ATM, corrige "15/18") | 16 controllers | Specs novos (não implementado) | ASNF-101 | AER-020 | Nenhum | `api-ci.yml` (roda o que existe, não cobre o resto) | ❌ | 🟡 |
| `StorageService` sem reconferência de tenant | AGR §4.3 | `storage.service.ts` | (não implementado) | ASNF-041 | AER-009 | `storage.service.spec.ts` (não cobre este cenário) | `api-ci.yml` | ⚠️ | 🟡 |
| Script de concorrência não integrado ao CI | Achado desta ATM (Parte VI/IX) | `validate-b48/b49-concurrency.ts` | Execução manual documentada | ASNF-105 | ADR-0004 | Os próprios scripts | **Não integrado** | ⚠️ | 🟡 |

---

# PARTE XII — Bidirectional Traceability

## Exemplo 1 — de cima para baixo (B-40 → implementação → monitoramento)

```
B-40 (ROADMAP_ESTABILIZACAO.md)
  ↓
ASNF-016, ASNF-017, ASNF-042, ASNF-043 (Manual, Parte II/III)
  ↓
AER-001, AER-002, AER-003 (Constituição, Parte III)
  ↓
AGR §2, §3, §13 (achado + gap analysis)
  ↓
ABR §2 (evidência de código: os 5 controllers, linha exata de cada `@UseGuards`)
  ↓
Controller: `conversation.controller.ts:24`, `message.controller.ts:26`,
`note.controller.ts:20`, `dashboard.controller.ts:9`, `report.controller.ts:11`
  ↓
Service: `ConversationService`, `MessageService`, `NoteService` (ownership-check existente,
mas sem escopo de departamento)
  ↓
Teste: NÃO ENCONTRADO (é o próprio gap — nenhum teste cobre o cenário porque a funcionalidade
não existe)
  ↓
Pipeline: `api-ci.yml` roda o que existe, não bloqueia por ausência do guard
  ↓
Dashboard ASM: NÃO ENCONTRADO — artefato não existe (ver Parte I)
```

## Exemplo 2 — de baixo para cima (Controller → documentação → roadmap)

```
Controller: `dashboard.controller.ts:9` (`@UseGuards(JwtAuthGuard)`, sem `RolesGuard`)
  ↓
ABR §2 (linha da tabela de controllers, coluna "Guards de classe")
  ↓
AGR §2, §3.2 (classificado como "AuthGuard sem autorização granular")
  ↓
AER-002 (regra formal, Constituição Parte III)
  ↓
ASNF-017 (norma detalhada, Manual Parte II)
  ↓
ADR: NÃO ENCONTRADO (nenhum ADR cobre autorização hoje — gap já registrado em AER-025/ASNF-011)
  ↓
Roadmap: B-40
  ↓
Pipeline: `api-ci.yml` (não bloqueia, porque não há mecanismo automático — Parte IX)
  ↓
ASM: NÃO ENCONTRADO
```

**Nota sobre "ASM" no fluxo bidirecional pedido pelo prompt original:** o próprio prompt que deu
origem à AER já citava ASM/AEM como "(futuro)". Esta ATM confirma, por busca no repositório
inteiro, que nenhum dos dois nomes aparece em nenhum arquivo além das menções dentro dos
prompts que originaram AER/ATM — não há dashboard, script, ou documento correspondente. Toda
cadeia bidirecional desta Parte XII termina em "NÃO ENCONTRADO" no elo ASM, de forma
consistente e honesta, não por omissão.

---

# PARTE XIII — Gap de Rastreabilidade

Respostas diretas às perguntas obrigatórias:

**Existe documento sem ligação?** Não — todos os 6 documentos da cadeia (ACR, ABR, AGR, AER,
ASNF, e esta ATM) se referenciam mutuamente (Parte I). ADR-0001 é o único artefato de
`docs/05-ADR/` sem uma ligação de normas ASNF **específica** além da estrutural
(ASNF-002/003/004) — aceitável, é uma decisão sobre organização de repositório, não sobre um
domínio técnico coberto por norma dedicada.

**Existe norma sem implementação?** Sim, extensivamente — toda linha ❌/⚠️ nas Partes III, VI,
VIII, IX, XI. Os casos mais críticos: ASNF-049 (RLS), ASNF-016/017 (guard de escopo, B-40),
ASNF-085 (Docker root), ASNF-075 (Nginx headers).

**Existe implementação sem norma?** **NÃO ENCONTRADO de forma sistemática** — a varredura desta
sessão (Partes IV, V) não achou um componente relevante sem ao menos uma norma ASNF/regra AER
associável. Exceção pontual: `HealthController`/`HealthService` são bem implementados
(cobertura 100%/92,85%) mas não têm uma norma ASNF dedicada além da menção em ASNF-097 — é
proporcional ao risco baixo do componente, não um gap real.

**Existe risco sem mitigação?** Sim — 5 de 10 na matriz da Parte XI (RLS, escopo de
departamento, Nginx, Docker, WebSocket).

**Existe controle sem responsável?** Não no nível de papel (RACI da Constituição atribui todo
controle a uma função) — mas **sim** no nível de pessoa nomeada por controle individual (hoje
só `@Cmdev2019` genérico via CODEOWNERS, sem um dono por métrica/controle específico — mesmo
achado já registrado na Constituição Parte VI).

**Existe componente sem testes?** Sim — 16 controllers, `EventsGateway`, `CompanyService`,
`DepartmentService`, `NoteService`, `WhatsappService` (11,76%) — todos já listados na Parte
VIII.

**Existe pipeline sem documentação?** Não — `api-ci.yml` e `web-ci.yml` estão ambos
referenciados nesta ATM e em documentos anteriores. **Achado novo desta ATM:** os scripts
`validate-b48-concurrency.ts`/`validate-b49-concurrency.ts` são o inverso — **têm documentação
(roadmap, ADR-0004) mas não têm pipeline** (não rodam em nenhum workflow do `.github/
workflows/`, confirmado por leitura de `api-ci.yml` nesta sessão, que só lista `lint:check`,
`tsc --noEmit`, `npm test`).

**Existe ADR pendente?** Sim, mas o número mudou: a Constituição propôs se tornar `ADR-0009`
quando escrita (2026-08-05, mesma sessão). A revisão de ADRs seguinte, na mesma sessão,
priorizou o backlog v1.0 já listado em `INDICE.md` desde 2026-08-01 (Modular Monolith, RLS,
Storage) e ocupou `ADR-0009` a `ADR-0018` com essas 10 decisões — nenhuma delas é a própria
Constituição. **Achado:** a Constituição segue sem ADR próprio; se for formalizada como uma, o
próximo número livre passa a ser `ADR-0019`, não `ADR-0009` como o próprio texto da Constituição
ainda afirma (`CONSTITUICAO-ARQUITETURAL.md` §"Como este documento se torna vinculante" não foi
alterada por esta ATM, por regra — a divergência fica registrada aqui, não corrigida na origem).
Também pendente: um ADR de autorização/multi-tenancy mais amplo que os pontuais já escritos
(AER-025/ASNF-011 apontavam a lacuna; `ADR-0010`/`ADR-0012` cobrem RLS e o modelo de Role, mas
não substituem um ADR único que amarre os dois como uma estratégia de autorização/tenancy
consolidada, se isso vier a ser considerado necessário).

**Existe roadmap sem rastreabilidade?** Não entre os itens numerados (B-38 a B-49, todos
rastreados na Parte VII) — mas os **4 itens sugeridos pela AGR §16 não têm ID** no roadmap
formal, o que os deixa fora do processo padrão de "todo problema novo vira item com ID antes
de ser corrigido" definido no `CLAUDE.md`. É uma lacuna de processo, não de rastreabilidade
documental (esta ATM os rastreia normalmente, marcados "sem ID").

**Achado adicional, fora da lista de perguntas do prompt, encontrado durante a construção desta
Parte:** a contagem de controllers usada em ABR/AGR/AER/ASNF ("18") diverge da contagem real de
arquivo ("19") — ver "Achado de abertura" no topo deste documento. Recomenda-se que uma futura
atualização da ABR corrija a prosa (não a tabela, que já estava certa) — **fora do escopo desta
ATM alterar**, por regra.

---

# PARTE XIV — Dashboard Executivo

Todo percentual abaixo mostra o numerador/denominador explícito — nenhum número "solto".

| Indicador | Cálculo | Resultado |
|---|---|---|
| % Requisitos (princípios) rastreados até implementação | 8 implementados / 10 princípios (Parte II) | **80%** |
| % Normas ASNF com componente afetado identificável | Amostragem das Partes III/IV/V/VI/VIII — nenhuma norma revisada ficou sem componente associável | **~100%** (não contado individualmente para as 125; é qualitativo, baseado na cobertura das Partes III–XI) |
| % Componentes documentados (com ao menos 1 doc. relacionado) | 12 categorias de componente (Parte IV) / 12 com doc. relacionado | **100%** |
| % Regras/normas automatizadas hoje (não só "automatizável") | 1 automática em produção (AER-019) / 150 itens (25 AER + 125 ASNF) | **~0,7%** |
| % Regras/normas com automação de alta viabilidade (proposta, não implementada) | 9 (AER) + ~28 (ASNF) = 37 / 150 | **~25%** |
| % Controllers com guard de autenticação | 19/19 (ABR §2, confirmado) | **100%** |
| % Controllers com guard de autorização por papel/escopo onde aplicável | 13/19 (corrigido de "13/18") | **~68%** |
| % Controllers com teste próprio | 3/19 (corrigido de "3/18") | **~16%** |
| % Services com teste próprio | 22/30 | **~73%** |
| % Cobertura de statements agregada (medição real) | 1589/3160 (ABR §10, medição ao vivo) | **50,28%** |
| % Tabelas com `companyId` sob RLS | 0/14 | **0%** |
| % `updateMany`/`deleteMany` sobre entidade com `companyId` com filtro presente | 6/9 (ABR §4.3) | **~67%** |
| % Itens de roadmap rastreados nesta ATM (com ID) | 12/12 (B-38 a B-49, Parte VII) | **100%** |
| % Itens de melhoria sem ID no roadmap | 4 (sugestões AGR §16) | 4 itens órfãos de ID, rastreados só documentalmente |
| % Redis clients consolidados | 0/5 (nenhuma consolidação feita — B-46 pendente) | **0%** |
| % Documentação da cadeia (ACR→ATM) interconectada | 6/6 documentos citam ao menos 1 outro da cadeia | **100%** |

---

# PARTE XV — Plano de Evolução da ATM

| Pergunta | Resposta |
|---|---|
| Quando atualizar? | A cada novo documento da cadeia (novo ABR/AGR/AER/ASNF), a cada item de roadmap fechado (B-40 a B-49), e a cada auditoria periódica definida na Constituição Parte VIII |
| Quem atualiza? | Mesma matriz RACI da Constituição Parte VI — hoje, mantenedor único; papel formal é do "Tech Lead" |
| Qual evento dispara atualização? | (1) Item de roadmap muda de status; (2) norma ASNF/regra AER nova é criada; (3) mecanismo de automação passa de "proposto" para "implementado" (a coluna mais volátil desta ATM); (4) nova auditoria de conformidade roda (Constituição Parte VIII) |
| Como validar consistência? | Reexecutar as contagens de arquivo (`find`, `grep`) que fundamentam as Partes IV, VIII, IX, XIV desta ATM — são reproduzíveis, não são opinião. O "Achado de abertura" desta revisão é o exemplo do que essa reexecução periódica pega |
| Como evitar documentos órfãos? | Todo documento novo da cadeia de governança deve, na primeira versão, preencher sua linha na Parte I (Mapa Mestre) desta ATM — regra de processo, não mecanismo automático (⚠️ dependente de disciplina até que exista um lint de documentação) |
| Como versionar a ATM? | Mesmo padrão dos demais documentos desta cadeia — versão + data no cabeçalho, sem data no nome do arquivo (`CONVENCAO-DE-NOMENCLATURA.md §2.3`: documento vivo não leva data no nome) |

---

# Nota final

Esta ATM não introduziu nenhuma regra, norma, decisão ou correção. Todo número reportado nas
Partes IV, VIII, IX e XIV foi obtido por contagem/leitura direta nesta sessão (`find`, `grep`,
leitura integral de `api-ci.yml`/`web-ci.yml`/ADRs), não reaproveitado sem checagem dos
documentos anteriores — e onde a checagem divergiu do que os documentos anteriores diziam (o
caso dos controllers, 18→19), a divergência foi registrada, não silenciada. Onde uma ligação não
pôde ser comprovada, está marcada **NÃO ENCONTRADO** ou **NÃO FOI POSSÍVEL VALIDAR** em vez de
presumida.
