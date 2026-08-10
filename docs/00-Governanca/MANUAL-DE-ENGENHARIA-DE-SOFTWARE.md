# Manual Oficial de Engenharia de Software — AtendeHub

**Codinome do projeto normativo:** ASNF (Architecture Standards & Normative Framework)
**Versão:** 1.0 · **Status:** Proposta (aguarda adoção formal, mesmo status da
[Constituição Arquitetural](./CONSTITUICAO-ARQUITETURAL.md), que este manual **não substitui,
detalha**).

**Sucede:** ACR (2026-08-01) → [ABR](../04-Arquitetura/ABR_2026-08-05_baseline.md) →
[AGR](../04-Arquitetura/AGR_2026-08-05_governance.md) →
[AER/Constituição](./CONSTITUICAO-ARQUITETURAL.md) → **ASNF (este documento)**.

**Regra desta revisão:** nenhum código, configuração ou outro documento foi alterado na
produção deste arquivo. É normativo, não corretivo.

## Convenção de leitura deste documento (definida uma vez, vale para as 16 partes)

Para caber ~150 normas sem repetir 13 campos idênticos centenas de vezes, este manual usa dois
formatos:

- **Cartão completo** (as normas mais críticas, novas ou que exigem nuance) — todos os 13
  campos pedidos, explícitos.
- **Linha de tabela** (a maioria) — os campos que variam por norma (`ID`, `Título`,
  `Obrigatoriedade`, `Critério de conformidade`, `Como verificar`/`Ferramenta`,
  `Automatizável`, `Referências`) ficam na tabela; os campos que são **compartilhados por todo
  o grupo** (`Objetivo`, `Justificativa técnica`, `Escopo`, `Componentes afetados`) ficam no
  parágrafo que abre cada subseção, uma vez, em vez de repetidos em cada linha.

**Convenção fixa:** salvo dito o contrário, `Critério de não conformidade` = negação exata do
`Critério de conformidade` da mesma linha — não repetido por norma.

**Este manual não duplica o que já é norma vigente em outro documento — referencia.** Onde
`CONVENCAO-DE-NOMENCLATURA.md` já cobre um tópico (nomenclatura, estrutura de pastas), a norma
aqui é "cumprir aquele documento", não uma reescrita. Onde a
[Constituição (AER)](./CONSTITUICAO-ARQUITETURAL.md) já tem uma regra `AER-XXX` sobre o mesmo
assunto (autorização, tenancy, infraestrutura), a norma ASNF aqui **referencia** a regra AER em
vez de duplicá-la com um número novo — evita duas fontes de verdade divergindo com o tempo.

**Legenda de Obrigatoriedade:** OBR = Obrigatória · REC = Recomendada · OPC = Opcional ·
PRO = Proibida.
**Legenda de Criticidade:** 🔴 Crítica · 🟠 Alta · 🟡 Média · 🟢 Baixa.
**Legenda de Automatizável:** ✅ Sim (ferramenta existente ou viável) · ⚠️ Parcial (detecta,
não decide) · ❌ Não (processual/semântico — controle manual obrigatório, motivo declarado).

---

# PARTE I — Normas Gerais

### I.1 Estrutura do projeto, módulos e pastas

**Objetivo/Justificativa/Escopo (compartilhado):** garantir que qualquer pessoa nova encontre
qualquer artefato sem precisar perguntar — a estrutura já observada no repositório (18 módulos
backend, `src/` do frontend, `docs/NN-Nome/`) é boa e consciente; a norma é formalizá-la como
obrigatória, não redesenhá-la. **Componentes afetados:** todo novo arquivo/pasta criado.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-001 | Nomenclatura de arquivos, pastas, identificadores, API, banco e testes | OBR | Cumpre `CONVENCAO-DE-NOMENCLATURA.md` na íntegra | `@typescript-eslint/naming-convention`, revisão de PR | ✅ (identificadores) / ⚠️ (estrutura de pasta) | `CONVENCAO-DE-NOMENCLATURA.md` |
| ASNF-002 | Módulo novo do backend segue o layout padrão (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, opcional `guards/`/`decorators/`) | OBR | Estrutura de pasta do módulo bate com os 18 módulos existentes | Revisão de PR (CODEOWNERS cobre `/apps/api/`) | ❌ (estrutural, não sintático) | ABR §1 (inventário de módulos) |
| ASNF-003 | Módulo em `kebab-case` singular; agrupamento técnico (`guards/`, `dto/`) em plural | OBR | `CONVENCAO-DE-NOMENCLATURA.md §1` | Revisão de PR | ❌ | `CONVENCAO-DE-NOMENCLATURA.md` |
| ASNF-004 | `docs/` novo entra em pasta `NN-Nome-Kebab-Capitalizado` existente; criar pasta nova exige decidir a numeração pensando na área temática, não no documento | REC | Documento novo cabe em pasta existente sem forçar assunto | Revisão de PR | ❌ | `CONVENCAO-DE-NOMENCLATURA.md §1` |

### I.2 Versionamento

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-005 | Tag de release em `v<MAJOR>.<MINOR>.<PATCH>`, anotada e assinada | OBR | Tag segue SemVer, `git tag -v` valida assinatura | `git tag -v` | ✅ | `CONVENCAO-DE-NOMENCLATURA.md §4.3` |
| ASNF-006 | Endpoint da API não versiona por rota (`/v2/...`) sem decisão registrada — hoje o prefixo é fixo `/api/v1` (`main.ts:69`) | OBR manter até decisão contrária | Nenhum novo prefixo de versão introduzido sem ADR | Revisão de PR | ❌ | ABR §2 |
| ASNF-007 | Migration de banco versionada só pela ferramenta (timestamp Prisma), nome descreve a mudança, não a intenção (`add_x` ✅, `fix_stuff` ❌) | OBR | Nome da migration é descritivo | Revisão de PR | ❌ | `CONVENCAO-DE-NOMENCLATURA.md §2.4` |

### I.3 Comentários e documentação

**Compartilhado:** o padrão já observado no código (comentário explica **por quê**, não **o
quê** — visível em praticamente todo arquivo lido nas revisões anteriores, ex.:
`conversation.service.ts:64-68` explica a razão do `jobId` determinístico, não repete o código)
é bom e deve continuar sendo o padrão, não uma norma nova a impor.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-008 | Comentário explica motivo/decisão, nunca repete o que o código já diz | REC (não bloqueia merge, é item de review) | Comentário responde "por quê", não "o quê" | Code review | ❌ | Padrão observado em todo o backend |
| ASNF-009 | Documentação de contrato de API (`docs/09-APIs/API_CONTRACT.md`) atualizada no **mesmo commit** que altera endpoint/shape/evento de socket | OBR | Diff do PR toca o contrato quando toca rota/shape | Checklist de PR (já existe campo no template) | ⚠️ (presença de diff é gréppável, correção do conteúdo não) | `CLAUDE.md` (fonte de verdade #3), `PULL_REQUEST_TEMPLATE.md` |
| ASNF-010 | `README.md` de toda pasta com mais de 1 subpasta define: objetivo, responsabilidade, conteúdo esperado, quem usa, quando usar, quem pode alterar | REC | README presente e com essas 6 seções | Revisão de PR | ❌ | Padrão observado em `docs/00-Governanca/README.md`, `docs/04-Arquitetura/README.md` |

### I.4 ADR e Changelog

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-011 | Decisão de arquitetura sobre autorização, multi-tenancy, ou dado sensível tem ADR próprio, criado junto/antes da implementação | OBR | Ver **AER-025** (não duplicado aqui) | — | ❌ | AER-025 |
| ASNF-012 | ADR segue o template (`docs/05-ADR/ADR-0000-template.md`), numeração sequencial sem lacuna | OBR | Novo ADR usa o próximo número livre (hoje: `ADR-0009`) | Revisão de PR (CODEOWNERS cobre `/docs/05-ADR/`) | ⚠️ (número duplicado é gréppável) | `docs/05-ADR/README.md` |
| ASNF-013 | Item concluído do roadmap (`ROADMAP_ESTABILIZACAO.md`) só marcado ✅ com evidência no Changelog (comando, teste, screenshot) | OBR | Já é regra do `CLAUDE.md` — esta norma a formaliza como parte do manual de engenharia, não a substitui | Revisão de PR | ❌ | `CLAUDE.md` |
| ASNF-014 | `CHANGELOG.md` do projeto recebe entrada padronizada (impacto/arquivos/mitigação) para toda correção de severidade 🟠 ou acima | OBR | Entrada presente e no mesmo nível de detalhe do padrão já usado em B-38/B-48/B-49 | Revisão de PR | ❌ | ROADMAP_ESTABILIZACAO.md (changelog B-48/B-49 como referência de padrão) |

---

# PARTE II — Normas Backend

### II.1 Controllers

**Compartilhado — Objetivo:** controller é fiação HTTP pura (rota → guard → DTO → Service →
resposta), nunca lógica de negócio. **Justificativa:** é o padrão já observado em 100% dos 18
controllers lidos nas revisões anteriores — nenhum acessa Prisma direto (ABR §2). **Escopo:**
todo `*.controller.ts`. **Componentes afetados:** os 18 existentes + qualquer novo.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-015 | Controller nunca importa `PrismaService` nem qualquer client de infraestrutura direto | **PRO** o contrário | `grep` no diff não mostra import de Prisma/Redis/Minio em `*.controller.ts` | Regra de ESLint (`no-restricted-imports` por padrão de arquivo) | ✅ | ABR §2 |
| ASNF-016 | Controller autenticado tem `JwtAuthGuard` (ou `@Public()` justificado) | OBR | Ver **AER-001** | — | ✅ | AER-001 |
| ASNF-017 | Controller de mutação sensível tem `RolesGuard`/escopo | OBR | Ver **AER-002** | — | ⚠️ | AER-002 |
| ASNF-018 | Handler HTTP não excede ~15 linhas de corpo (excluindo decorators/tipos) — acima disso, a lógica pertence ao Service | REC | Contagem de linhas do método | Lint customizado (`max-lines-per-function` do ESLint, configurável por padrão de arquivo) | ✅ | Padrão observado (handlers atuais são finos, ex.: `conversation.controller.ts`) |

### II.2 Services

**Compartilhado — Objetivo:** concentrar regra de negócio e autorização por dado (ownership).
**Justificativa:** é onde 100% da lógica de `companyId`/ownership mora hoje (ABR §11).
**Escopo:** todo `*.service.ts`. **Componentes afetados:** todos.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-019 | Método que recebe `companyId` o usa em toda query, direta ou via ownership-check prévio | OBR | Ver **AER-019 (Parte III Bloco B da Constituição)** e AER-006/007 | — | ⚠️ | AER-005..009 |
| ASNF-020 | Construtor com mais de 6 dependências exige justificativa em comentário | PRO acima do limite sem justificativa | Ver **AER-017** | — | ✅ | AER-017 |
| ASNF-021 | Service que trata mais de 3 tipos de evento externo distintos deve isolar cada tipo em um handler/classe dedicado atrás de um dispatcher fino | REC (torna-se OBR quando o `WebhookService` for decomposto, AER Parte X) | Nº de métodos `handle*` de tipos de evento distintos na mesma classe ≤3 | Revisão de PR | ❌ | AGR §5.3 |
| ASNF-022 | Padrão de ownership-check (`assertOwnership`/`assertBelongsToCompany`/equivalente) reutiliza um helper compartilhado quando um for criado (AER item de decomposição de B-40) — até lá, é aceitável a duplicação atual, documentada | REC | — | Revisão de PR | ❌ | AGR §11, ABR §11 |

### II.3 Repositories

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-023 | Introdução de camada de Repository sobre o Prisma | OPC — decisão consciente de não ter, revisitável só via ADR novo | ADR presente se a decisão mudar | Revisão de PR | ❌ | ACR 2026-08-01, AER Política de Repositories |
| ASNF-024 | Service acessa `PrismaService` diretamente | OBR (é o padrão vigente) | — | — | — | AER Política de Repositories |

### II.4 DTOs, Entities e Validation

**Compartilhado — Objetivo:** toda entrada de API é tipada e validada antes de chegar ao
Service. **Justificativa:** `ValidationPipe` global já com `whitelist`+`forbidNonWhitelisted`+
`transform` (`main.ts:84-93`) — a norma formaliza o padrão observado (`class-validator`+
`class-transformer` em 100% dos DTOs amostrados na ABR §5) como obrigatório para todo DTO novo.
**Escopo:** todo `dto/*.dto.ts`. **Componentes afetados:** todos.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-025 | Todo campo de DTO de entrada tem decorator de `class-validator` (`@IsString`, `@IsEnum`, etc.) | OBR | Campo sem decorator de validação | `ValidationPipe` com `forbidNonWhitelisted` já rejeita campo não-declarado; decorator ausente não é pego automaticamente | ⚠️ | ABR §9, exemplo `list-conversations.dto.ts` |
| ASNF-026 | DTO de listagem pagina por `page`/`limit` (offset) ou por cursor (`before`/`after`) — nunca retorna coleção completa sem limite | OBR | Todo `findMany` de listagem tem `take` | Revisão de PR | ⚠️ | Padrão observado (`ListConversationsDto`, cursor em `ListMessagesDto`) |
| ASNF-027 | DTO de saída (`*-response.dto.ts`) nunca inclui campo sensível (`passwordHash`, token bruto) | **PRO** o contrário | `select`/DTO de saída não lista o campo | Revisão de PR + teste de contrato | ⚠️ | `USER_SELECT` em `user.service.ts:42-54` como referência positiva |
| ASNF-028 | Entidade de domínio (`*.entity.ts`) só quando há lógica de domínio além do shape do Prisma — não criar por padrão | OPC | — | — | — | `CONVENCAO-DE-NOMENCLATURA.md §2.1` |

### II.5 Providers, Modules, Middlewares, Guards, Interceptors, Pipes

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-029 | Provider global novo (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_PIPE`/`APP_FILTER`) registrado em `app.module.ts` exige ADR se afetar toda a superfície da API | OBR | ADR presente | Revisão de PR (CODEOWNERS cobre `/apps/api/`) | ❌ | `app.module.ts:100-113` (2 providers globais hoje: `ThrottlerGuard`, `MediaPresignInterceptor`) |
| ASNF-030 | Middleware novo roda antes do body parser só se precisar de dado bruto da requisição (padrão: `RequestIdMiddleware`, `main.ts:41-42`) | REC | — | Revisão de PR | ❌ | `main.ts` |
| ASNF-031 | Guard novo de autenticação implementa as mesmas 3 checagens do `JwtStrategy` (assinatura+blacklist+`isActive`) | OBR | Ver **AER-015** | — | ⚠️ | AER-015 |
| ASNF-032 | Interceptor que manipula resposta de mídia usa `StorageService#presignDeep` (ponto único de saída de URL de mídia) em vez de reimplementar presign | OBR | — | Revisão de PR | ❌ | `storage.service.ts:250-277`, `MediaPresignInterceptor` |
| ASNF-033 | Pipe de validação de parâmetro de rota (`ParseCuidPipe` e equivalentes) usado em todo `:id` de rota sensível em vez de validação ad-hoc dentro do handler | REC | — | Revisão de PR | ❌ | `CONVENCAO-DE-NOMENCLATURA.md §2.1` |

### II.6 Exceptions e Config

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-034 | Exceção de domínio usa as classes do Nest (`NotFoundException`, `ForbiddenException`, `BadRequestException`, `ConflictException`) — nunca `throw new Error()` cru em código de rota | **PRO** `throw new Error()` cru em fluxo de request | `grep -n "throw new Error"` fora de bootstrap/scripts | Lint customizado | ✅ | Padrão observado em 100% dos services lidos |
| ASNF-035 | `SentryExceptionFilter` captura toda exceção 5xx não tratada — novo filtro de exceção não pode substituí-lo sem preservar esse comportamento | OBR | — | Revisão de PR | ❌ | `main.ts:74`, `shared/monitoring/sentry.ts` |
| ASNF-036 | Toda credencial/secret nova validada no boot com fail-closed em produção/staging | OBR | Ver **AER-016** | — | ❌ | AER-016 |
| ASNF-037 | Config lida via `ConfigService.get()`, nunca `process.env` direto fora de `main.ts`/bootstrap | REC | `grep -rn "process.env" apps/api/src` fora de `main.ts` | Lint customizado | ✅ | `main.ts` usa `process.env` só no bootstrap; resto usa `ConfigService` |

---

# PARTE III — Normas Multi-Tenant

**Nota:** o núcleo desta parte (fluxo de `companyId`, RLS, `updateMany`/`deleteMany`,
ownership-check, Storage, Bull, WebSocket) já está integralmente coberto pela Constituição
(AER Bloco B, §4 da AGR) — as normas abaixo **referenciam** essas regras em vez de as
duplicar, e acrescentam só o que é genuinamente novo: `departmentId`/`agentId` (que a AER trata
como gap de produto — B-40 — não como conjunto de normas de engenharia detalhadas).

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-038 | Toda mutação de dado com `companyId` filtra por ele, direto ou via ownership-check | OBR | Ver **AER-005/006** | — | ✅ (via Prisma Extension proposta) | AER-005, AER-006 |
| ASNF-039 | `findUnique`/`findFirst` com ID vindo do cliente confirma posse antes de usar o resultado | OBR | Ver **AER-007** | — | ⚠️ | AER-007 |
| ASNF-040 | Bull Queue de domínio propaga `companyId` ou resolve tenant de forma rastreável | OBR | Ver **AER-008** | — | ⚠️ | AER-008 |
| ASNF-041 | Storage reconfere `companyId` da key na leitura/exclusão | OBR (quando implementado) | Ver **AER-009** | — | ⚠️ | AER-009 |
| ASNF-042 | `departmentId` usado como **filtro opcional** de busca não pode ser confundido, em código ou comentário, com **restrição de acesso** — se a intenção é restringir, deve usar o guard de escopo (quando existir, pós-B-40), não um filtro de query | OBR | Comentário/nome de variável não usa "restrito"/"apenas" para um filtro que é, de fato, opcional | Revisão de PR | ❌ | `ListConversationsDto.departmentId` (ABR B-40) como exemplo do estado atual — hoje é só filtro, corretamente descrito como tal |
| ASNF-043 | `agentId` em query de listagem (`ConversationController`, `ReportController`) é sempre um filtro explícito do requisitante — nunca inferido implicitamente do JWT como "só o meu" a menos que documentado (ex.: `getStats` já usa sempre o `userId` do JWT, nunca parâmetro livre, `conversation.service.ts:137-142`) | OBR | Toda rota que aceita `agentId`/`userId` livre documenta por que não é restrita ao próprio usuário | Revisão de PR | ❌ | `conversation.service.ts:137-142` como padrão positivo já existente |
| ASNF-044 | Evento de domínio (`EventsService.emit*`) carrega `companyId` explícito; se o evento for relevante por departamento, carrega `departmentId` também (hoje nenhum evento carrega — achado da AGR §8, não é regra violada, é lacuna de dado não implementada) | REC — implementar quando o frontend precisar filtrar por departamento no cliente | `grep -n "departmentId" events.service.ts` retorna resultado quando a feature existir | Revisão de PR | ❌ | AGR §8 |
| ASNF-045 | Nenhum código novo propaga `companyId` via `AsyncLocalStorage`/contexto implícito — continua por parâmetro explícito (P-9 da Constituição) | **PRO** o contrário sem ADR | `request-context.ts` continua só com `requestId` | Revisão de PR | ❌ | Constituição P-9 |

---

# PARTE IV — Normas Prisma

**Compartilhado — Objetivo:** Prisma é a única via de acesso a dado (sem Repository, decisão
registrada) — a disciplina de query precisa compensar a ausência dessa camada intermediária.
**Justificativa:** ABR §5 mostrou o padrão real (~90 leituras, 9 mutações em lote, todas
auditadas individualmente) — estas normas formalizam o que já foi encontrado correto e fecham o
que foi encontrado incorreto. **Escopo:** todo uso de `PrismaService`. **Componentes
afetados:** todos os `*.service.ts`/`*.processor.ts` que usam Prisma.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-046 | `updateMany`/`deleteMany` sobre entidade com `companyId` (direto ou herdado) inclui o filtro | OBR | Ver **AER-006** | — | ✅ | AER-006 |
| ASNF-047 | `createMany` evitado por padrão — uso novo exige review de segurança dedicado (histórico do projeto: nenhum `createMany` em produção hoje, ABR §4.3) | REC evitar | — | Revisão de PR | ❌ | ABR §4.3 |
| ASNF-048 | `$queryRaw`/`$executeRaw` proibido por padrão — único uso hoje é `SELECT 1` de healthcheck; novo uso exige ADR | **PRO** salvo ADR | `grep -n "queryRaw\|executeRaw"` no diff sem ADR associado | Lint customizado + revisão | ✅ (detecção) / ❌ (decisão) | ABR §4.3 |
| ASNF-049 | Toda tabela com `companyId` tem RLS habilitado em produção | OBR (após B-41) | Ver **AER-005** | — | ✅ | AER-005 |
| ASNF-050 | `@@unique`/`@@index` refletem toda invariante de negócio que hoje é garantida só por leitura prévia (o padrão do B-48/B-49: TOCTOU fechado por constraint de banco, não por `findFirst` sozinho) | OBR para invariante nova do mesmo tipo | Nova entidade com regra "no máximo 1 X ativo por Y" tem `@@unique` (parcial se condicional) | Revisão de PR + migration | ❌ | ADR-0002 (idempotência), ADR-0003 (persistência atômica), B-48/B-49 |
| ASNF-051 | Captura de `P2002` como sinal de colisão resolvida, nunca 500 cru | OBR | Ver **AER-018** | — | ⚠️ | AER-018 |
| ASNF-052 | Migration de enum de máquina de estado com invariante condicional atualiza índice parcial + teste tripwire no mesmo commit | OBR | Ver **AER-019 (Constituição)** | — | ✅ (teste tripwire já existe para `ConversationStatus`) | AER-019 |
| ASNF-053 | Soft delete (`isDeleted`/`isActive`/`anonymizedAt`) usado quando o dado tem valor de auditoria/histórico; delete físico só quando não há — decisão registrada por entidade, não por hábito | OBR decidir e documentar por entidade nova | Comentário/ADR indica a escolha | Revisão de PR | ❌ | Padrão observado: `Message.isDeleted`, `User.isActive`, `Contact.anonymizedAt` (B-29/LGPD) — todos soft; nenhum hard delete de dado de negócio encontrado |
| ASNF-054 | `select` explícito em toda query que retorne dado para fora do Service (nunca devolver o `Model` completo do Prisma para um DTO de resposta) | OBR | `select`/`USER_SELECT`-like constante presente | Revisão de PR | ⚠️ | ASNF-027, padrão em `USER_SELECT`/`CONVERSATION_LIST_SELECT` |
| ASNF-055 | `Prisma Client Extension` para enforcement de tenant (`$extends`) é o mecanismo alvo de AER-006 — quando implementada, nenhuma query pode ser escrita para contorná-la (ex.: acessar o client "cru" por fora do `PrismaService`) | **PRO** contorno, quando a extension existir | — | Revisão de arquitetura | ❌ | AER-006, Constituição Parte IV |
| ASNF-056 | `$transaction` (array ou interativa) usada quando duas ou mais escritas precisam ser atômicas juntas — nunca duas chamadas `await` sequenciais separadas quando a atomicidade importa | OBR | Escritas relacionadas (ex.: `Company`+`User` no registro, `auto-attendance.service.ts:154` reorder) usam `$transaction` | Revisão de PR | ❌ | `auth.service.ts:106`, `auto-attendance.service.ts:154` como padrão positivo |

---

# PARTE V — Normas Redis

**Compartilhado — Objetivo:** cada cliente Redis tem um dono claro e um motivo de existir
separado dos outros. **Justificativa:** hoje há 5 conexões (4 explícitas + Bull) sem
provider compartilhado (ABR §6, B-46) — as normas abaixo impedem que um 6º apareça pelo mesmo
caminho, mesmo enquanto a consolidação dos 5 existentes não acontece. **Escopo:** todo uso de
Redis. **Componentes afetados:** `TokenBlacklistService`, `AutoAttendanceSessionService`,
`HealthService`, `RedisIoAdapter`, BullMQ, e qualquer novo consumidor.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-057 | Nenhum novo `new Redis(...)` fora de um provider/factory compartilhado sem justificativa registrada | REC evitar hoje, PRO após B-46 consolidar | Ver controle "Consolidação de clients Redis" da Constituição, Parte V | Grep de `new Redis(` no diff | ✅ (detecção) / ❌ (decisão) | Constituição Parte V, ABR §6 |
| ASNF-058 | Toda chave Redis de dado que expira naturalmente (sessão, cache, blacklist) tem TTL explícito | **PRO** chave sem TTL para esse tipo de dado | `grep` de `.set(` sem `EX`/`PX`/equivalente no mesmo client | Revisão de PR | ⚠️ | Padrão esperado — `TokenBlacklistService` já usa TTL até expiração do token |
| ASNF-059 | Namespace de chave por domínio (`bull:`, e um prefixo próprio por serviço, ex.: `blacklist:`, `session:`) — nunca chave "nua" sem prefixo que identifique o dono | OBR | Prefixo presente | Revisão de PR | ⚠️ | `keyPrefix: 'bull:'` (`app.module.ts:55`) como padrão já em uso |
| ASNF-060 | Lock distribuído (se algum dia necessário) usa uma biblioteca madura (ex.: Redlock) — nunca um `SET NX` improvisado sem TTL e sem lógica de expiração de lock travado | OBR quando aplicável | — | Revisão de PR | ❌ | NÃO ENCONTRADO nenhum lock distribuído no código hoje — norma preventiva |
| ASNF-061 | Reconexão automática do client (comportamento padrão do `ioredis`) não é desabilitada sem justificativa — falha de Redis não pode travar a API inteira (P-8 da Constituição) | OBR | `maxRetriesPerRequest` e afins mantidos ou ajustados com racional documentado | Revisão de PR | ❌ | `redis-io.adapter.ts:31` (`maxRetriesPerRequest: null`, justificado) |
| ASNF-062 | Comportamento de fail-open/fail-closed sob indisponibilidade do Redis é uma decisão **documentada por serviço**, nunca acidental | OBR | Comentário/ADR presente | Revisão de PR | ❌ | `TokenBlacklistService` já documenta fail-open (log capturado ao vivo na ABR) |

---

# PARTE VI — Normas Bull

**Compartilhado — Objetivo:** toda fila tem retry, DLQ (ou decisão explícita de não ter) e
contexto de tenant definidos antes de ir a produção. **Justificativa:** hoje 1 de 4 filas tem
DLQ, 2 de 4 carregam `companyId` explícito (ABR §7) — as normas fecham essa decisão para toda
fila nova. **Escopo:** todo `@Processor`/`@InjectQueue`. **Componentes afetados:** as 4 filas
existentes + qualquer nova.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-063 | Fila nova propaga `companyId` no job ou resolve o tenant de forma rastreável | OBR | Ver **AER-008** | — | ⚠️ | AER-008 |
| ASNF-064 | Fila nova decide e documenta explicitamente se tem DLQ | OBR decidir | Decisão presente no processor/ADR | Revisão de PR | ❌ | ADR-0006 (Dead Letter Queue) |
| ASNF-065 | `attempts`/`backoff` da fila avaliados por caso — herdar só o default global (`app.module.ts:57-65`) sem avaliar é aceitável só quando o racional para isso está documentado | REC revisar | — | Revisão de PR | ❌ | ADR-0005 (retry) |
| ASNF-066 | Prioridade de job (`priority` do Bull) usada só quando há concorrência real de recursos entre tipos de job — documentar a escala escolhida | OPC | — | Revisão de PR | ❌ | NÃO ENCONTRADO uso de prioridade hoje — norma preventiva |
| ASNF-067 | Concorrência do worker (`@Process({concurrency: N})`) dimensionada e documentada — default do Bull (1) não é assumido sem avaliação para filas de alto volume | REC | — | Revisão de PR | ❌ | NÃO ENCONTRADO configuração de concorrência explícita hoje — **NÃO FOI POSSÍVEL VALIDAR** se o default é adequado ao volume real de produção |
| ASNF-068 | Job morto (esgotou tentativas, sem DLQ) não é descartado silenciosamente — ao menos logado em nível que apareça em alerta/métrica | OBR | Log presente no handler de falha final | Revisão de PR | ⚠️ | AGR §7 (achado: `sla-check`/`auto-attendance-inactivity` sem DLQ) |
| ASNF-069 | Job idempotente por desenho quando o evento de origem pode ser reprocessado (webhook, retry) — ver Parte IV (P2002) e Princípio P-6 da Constituição | OBR | Ver **AER-018**, ADR-0002 | — | ⚠️ | ADR-0002, AER-018 |

---

# PARTE VII — Normas de Segurança

**Nota:** o núcleo de autorização/JWT/WebSocket já está em AER Blocos A e D — normas abaixo
referenciam e complementam com o que a AER não detalhou em nível de implementação (CSP,
criptografia em repouso, rotação de segredo).

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-070 | Controller protegido por `JwtAuthGuard`/`RolesGuard` | OBR | Ver **AER-001/002** | — | ✅/⚠️ | AER-001, AER-002 |
| ASNF-071 | Refresh token armazenado só como hash, nunca em texto puro | OBR | `RefreshToken.token` é hash (já implementado, `auth.service.ts:204`) | Revisão de PR + teste | ⚠️ | ABR §9 |
| ASNF-072 | Toda apikey de integração externa comparada em tempo constante (`timingSafeEqual`) | OBR | Ver padrão já implementado em `webhook.controller.ts:166-170` | Revisão de PR | ⚠️ | ABR §9 |
| ASNF-073 | Rate limit dedicado (menor que o global) em toda rota de autenticação/criação de conta | OBR | `@Throttle` presente com limite menor que o default | Revisão de PR | ✅ | `auth.controller.ts:30,47,56` |
| ASNF-074 | `helmet()` habilitado com CSP — se desabilitada (`contentSecurityPolicy: false`), exige ADR | **PRO** desabilitar sem ADR | `main.ts:56` mantém `helmet()` com CSP ativa | Revisão de PR | ✅ | AGR §6 (achado sobre CSP do Helmet vs. Nginx) |
| ASNF-075 | Nginx aplica os 4 headers mínimos de segurança | OBR (após B-43) | Ver **AER-013** | — | ✅ | AER-013 |
| ASNF-076 | CORS validado no boot, falha em produção/staging se ausente ou `*` | OBR (já implementado) | `main.ts:152-174` | — | ✅ (já roda) | `main.ts` |
| ASNF-077 | Nenhum CSRF token necessário enquanto o modelo permanecer 100% Bearer token em header (não-cookie) — se um fluxo baseado em cookie for introduzido, CSRF token torna-se OBR imediatamente | OBR condicional | Nenhum novo fluxo de autenticação usa cookie de sessão sem also implementar CSRF | Revisão de PR | ❌ | AGR/ABR §9, decisão B-19 |
| ASNF-078 | Upload de arquivo valida MIME por allowlist + magic bytes (para imagem) + gera key própria no servidor | OBR (já implementado) | `storage.service.ts:21-59,161-211` | — | ⚠️ | ABR §9, AGR §6 (referência positiva) |
| ASNF-079 | Secret/credencial nunca commitada em texto puro no repositório | **PRO** absoluta | `git log -p` / scanner de secrets não encontra padrão de credencial | `gitleaks`/`trufflehog` (não instalado hoje) em pre-commit ou CI | ✅ (ferramenta pronta, não instalada) | Constituição Política de Logs (dado sensível) |
| ASNF-080 | Dado sensível (senha, token, PII completa) nunca aparece em log, mesmo em nível `debug` | **PRO** absoluta | Ver **AER Política de Logs** (Constituição Parte II) | — | ⚠️ | Constituição |
| ASNF-081 | Senha de usuário hasheada com custo bcrypt ≥12 | OBR (já implementado, `user.service.ts:149,257,284`, custo 12) | — | — | ✅ | ABR §9 |
| ASNF-082 | Criptografia em trânsito obrigatória (TLS) em todo tráfego externo; criptografia em repouso de dado sensível **não implementada hoje** (banco/MinIO sem encryption-at-rest configurada no nível de aplicação) — **NÃO FOI POSSÍVEL VALIDAR** se o volume do Postgres/MinIO tem encryption-at-rest no nível de disco/infra, fora do escopo desta revisão de código | REC avaliar | — | Revisão de infraestrutura (fora do repositório) | ❌ | NÃO FOI POSSÍVEL VALIDAR |
| ASNF-083 | Rotação de `JWT_SECRET`/`EVOLUTION_API_KEY` documentada como processo operacional — **NÃO ENCONTRADO** procedimento de rotação no repositório hoje | REC criar runbook | Runbook existe em `docs/` | Revisão de PR | ❌ | NÃO ENCONTRADO |
| ASNF-084 | WebSocket reimplementa as 3 checagens de autenticação do HTTP | OBR | Ver **AER-015** | — | ⚠️ | AER-015 |

---

# PARTE VIII — Normas de Infraestrutura

**Nota:** núcleo já em AER Bloco C (AER-010 a 014) — normas abaixo referenciam e complementam
com volumes/backup, ausentes do escopo original da AER.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-085 | Container de produção não roda como root | OBR (após B-44) | Ver **AER-010** | — | ✅ | AER-010 |
| ASNF-086 | Serviço com tráfego declara `healthcheck` no compose | OBR (após B-44) | Ver **AER-011** | — | ✅ | AER-011 |
| ASNF-087 | Processo Node implementa graceful shutdown | OBR (após B-44) | Ver **AER-012** | — | ⚠️ | AER-012 |
| ASNF-088 | Nginx com headers de segurança e rate limit próprios | OBR (após B-43) | Ver **AER-013/014** | — | ✅/⚠️ | AER-013, AER-014 |
| ASNF-089 | Volume de dado persistente (Postgres, Redis com `appendonly`, MinIO) declarado como volume Docker nomeado, nunca bind mount ad-hoc em produção | OBR (já implementado — `docker-compose.prod.yml` usa volumes gerenciados para os serviços de dado, confirmado por leitura na AGR) | — | Revisão de `docker-compose*.yml` | ⚠️ | AGR §10 |
| ASNF-090 | Rotina de backup do Postgres (e do bucket MinIO) documentada e testada — **NÃO ENCONTRADO** script de backup nem runbook de restore no repositório hoje | OBR criar | Script/runbook presente e com teste de restore documentado | Revisão de PR | ❌ | NÃO ENCONTRADO — gap real, não avaliado em nenhuma revisão anterior |
| ASNF-091 | Migração de schema em produção (`prisma migrate deploy`) tem passo explícito no processo de deploy, não depende de execução manual lembrada | OBR (gap, ver AER-012/B-44) | Passo presente no pipeline/runbook de deploy | Revisão de `docker-compose*.yml`/CI | ⚠️ | AGR §10 |
| ASNF-092 | Imagem Docker usa multi-stage (build/runtime separados) | OBR (já implementado) | `apps/api/Dockerfile:1-39` | — | ✅ | ABR §9 |

---

# PARTE IX — Normas de Observabilidade

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-093 | Log estruturado com correlação por `requestId` | OBR (já implementado) | `winston.logger.ts` + `request-context.ts` | — | ✅ | ADR-0008 |
| ASNF-094 | Captura de erro 5xx não tratado via Sentry (ou equivalente) | OBR (já implementado) | `sentry.ts`, `SentryExceptionFilter` | — | ✅ | ADR-0008, `main.ts:74` |
| ASNF-095 | Tracing distribuído (OpenTelemetry ou equivalente) | OPC — decisão explícita já registrada de não ter (`tracesSampleRate: 0`) | Decisão revisitada quando o volume de produção justificar | Revisão de arquitetura periódica | ❌ | AGR §10, `sentry.ts:6,15` |
| ASNF-096 | Métrica de negócio exposta em formato padronizado (Prometheus) para toda fila/processo crítico novo | REC — hoje só `webhook`/`webhook-dlq` têm | Endpoint `/metrics` presente e protegido (`@Roles(ADMIN)`) | Revisão de PR | ⚠️ | `webhook.controller.ts:144-161` |
| ASNF-097 | Health check distingue liveness (processo vivo) de readiness (pronto para tráfego) — hoje `GET /health` e `GET /health/ready` já fazem essa distinção | OBR (já implementado) | `health.controller.ts:18-35` | — | ✅ | `health.controller.ts` |
| ASNF-098 | Alerta automático (não só captura passiva em dashboard) para: erro 5xx acima de limiar, fila com profundidade anormal, colisão de idempotência acima de frequência esperada — **NÃO ENCONTRADO** nenhum alerta configurado hoje além do que o Sentry oferece por padrão | REC configurar | Regra de alerta presente na ferramenta de observabilidade | Fora do repositório | ❌ | NÃO ENCONTRADO |
| ASNF-099 | Dashboard operacional (não confundir com o dashboard de produto do AtendeHub) agregando saúde de fila/Redis/Postgres — **NÃO ENCONTRADO** | OPC | — | Fora do repositório | ❌ | NÃO ENCONTRADO |

---

# PARTE X — Normas de Testes

**Compartilhado — Objetivo:** cada camada tem o teste que só ela pode dar — service testa
regra de negócio, controller testa a cadeia de guard, e2e testa o fluxo ponta a ponta.
**Justificativa:** medição real da ABR (50,28% agregado, 15/18 controllers em 0%) mostra
exatamente onde esse princípio está sendo seguido (services) e onde não está (controllers,
multi-tenant). **Escopo:** todo `*.spec.ts`/`*.e2e-spec.ts`. **Componentes afetados:** todos.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-100 | Todo Service novo com regra de autorização/tenancy tem teste do caminho negativo | OBR | Ver **AER-020 (bloco de testes)**, política de testes da Constituição | — | ✅ | Constituição Política de Testes |
| ASNF-101 | Todo Controller novo tem `*.controller.spec.ts` cobrindo a cadeia de guards | OBR | Ver **AER-020** | — | ✅ | AER-020 |
| ASNF-102 | Cenário multi-tenant (2 empresas, isolamento) testado por entidade sensível | OBR | Ver **AER-021** | — | ⚠️ | AER-021 |
| ASNF-103 | CI mede e reporta cobertura (`--coverage`), com piso mínimo | OBR | Ver **AER-022** | — | ✅ | AER-022 |
| ASNF-104 | Teste unitário mocka dependência externa (`services/api`, `services/websocket` no frontend; Prisma/Redis/HTTP externo no backend) — nunca bate em rede real | OBR (já é o padrão, `CLAUDE.md`: "Testes do front mockam `services/api` e `services/websocket` por módulo") | — | Revisão de PR | ⚠️ | `CLAUDE.md` |
| ASNF-105 | Teste de concorrência real (`Promise.all` contra banco real, não só mockado) obrigatório para toda invariante de unicidade nova sob concorrência (mesmo padrão de B-48/B-49) | OBR para esse tipo de mudança | Script `validate-*-concurrency.ts` presente, 2-100 workers, resultado determinístico | Execução manual documentada | ❌ | ADR-0004, scripts `validate-b48-concurrency.ts`/`validate-b49-concurrency.ts` |
| ASNF-106 | `it`/`describe` descreve comportamento observável, não implementação | OBR | Ver `CONVENCAO-DE-NOMENCLATURA.md §7` | Revisão de PR | ❌ | `CONVENCAO-DE-NOMENCLATURA.md` |
| ASNF-107 | Critério de merge: `npm run lint:check` + `tsc --noEmit` + `npm test` limpos (já exigido pelo `api-ci.yml` e pelo checklist do `PULL_REQUEST_TEMPLATE.md`) | OBR (já implementado) | CI verde | `api-ci.yml` | ✅ | `.github/workflows/api-ci.yml` |
| ASNF-108 | Teste e2e cobre pelo menos os fluxos críticos: login→conversa→envio→recebimento (hoje só SLA e Storage têm e2e — **gap real**, ver ABR §10.5) | REC ampliar | `test/*.e2e-spec.ts` cobre o fluxo | Revisão de cobertura de e2e | ❌ | ABR §10.5 |
| ASNF-109 | Regressão dirigida (suíte focada nos módulos afetados por uma mudança de alto risco) rodada e documentada no changelog para correção 🔴/🟠 (padrão já usado em B-38/B-48/B-49) | OBR para esse tipo de correção | Evidência no Changelog | Revisão de PR | ❌ | ROADMAP_ESTABILIZACAO.md (B-48/B-49 changelog) |

---

# PARTE XI — Normas de Performance

**Compartilhado — Objetivo:** consulta ao banco e ao Redis dimensionada para o volume real,
sem N+1 nem coleção sem limite. **Justificativa:** o próprio código já demonstra o padrão
correto em pelo menos um ponto de alto risco de N+1 (`ConversationService#getStats`, comentário
explícito sobre lateral join evitando N+1, `conversation.service.ts:182-192`) — normas
formalizam isso como obrigatório, não uma exceção pontual. **Escopo:** toda query/paginação/
cache. **Componentes afetados:** todos os services de listagem/agregação.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-110 | Nenhuma consulta que itere resultado de uma query anterior disparando uma nova query por item (N+1) — usar `include`/nested `select`/agregação em uma query | OBR | Ver padrão já correto em `conversation.service.ts:182-192` (`take:1` por conversa via nested select, comentário explícito "evita N+1 de verdade") | Revisão de PR; `Prisma` query log em desenvolvimento | ⚠️ | `conversation.service.ts:182-192` |
| ASNF-111 | Toda listagem pagina — offset (`page`/`limit`) para navegação com salto, cursor (`before`/`after`) para scroll infinito de alto volume (mensagens) | OBR | Ver ASNF-026 | — | ⚠️ | `ListConversationsDto` (offset), `ListMessagesDto` (cursor) |
| ASNF-112 | `@@index` presente para todo campo/combinação usado em `where`/`orderBy` de consulta frequente | OBR | Índice presente no schema para o padrão de acesso novo | Revisão de migration | ❌ | Schema atual já indexa por `[companyId, status]`, `[companyId, contactId]`, etc. (`conversation.service.ts` comentado) |
| ASNF-113 | Pool de conexão do Prisma dimensionado e documentado (`connection_limit` na `DATABASE_URL` ou `datasource` do schema) — **NÃO FOI POSSÍVEL VALIDAR** se há dimensionamento explícito hoje (não verificado nas revisões anteriores) | REC verificar e documentar | Parâmetro presente e com racional | Revisão de configuração | ❌ | NÃO FOI POSSÍVEL VALIDAR |
| ASNF-114 | WebSocket: emissão de evento para uma sala (`company:${companyId}`), nunca broadcast global, quando o dado for específico de tenant | OBR (já implementado) | `events.gateway.ts:97` | — | ⚠️ | AGR §4 |
| ASNF-115 | Fila: job pesado (download de mídia, processamento de arquivo grande) não bloqueia o mesmo worker que processa jobs leves de alta frequência sem avaliação de concorrência/fila dedicada | REC avaliar | — | Revisão de arquitetura | ❌ | Preventivo — `media-download.service.ts` roda dentro do mesmo `WebhookProcessor` hoje (AGR §5.3, achado do God Service) |
| ASNF-116 | Cache (quando introduzido) tem TTL e estratégia de invalidação explícita — nunca cache "para sempre" de dado que muda | OBR quando aplicável | — | Revisão de PR | ❌ | NÃO ENCONTRADO uso de cache de aplicação hoje (Redis é usado para sessão/blacklist/fila, não cache de leitura) — norma preventiva |

---

# PARTE XII — Normas de Qualidade

**Compartilhado — Objetivo:** manter o sistema no nível de complexidade que já demonstrou ser
sustentável (a maioria dos services, 1-4 dependências, funções curtas e nomeadas por verbo) e
evitar que o único outlier conhecido (`WebhookService`) ganhe companhia. **Justificativa:**
limiares abaixo foram calibrados contra a distribuição real medida na AGR §5, não escolhidos a
priori. **Escopo:** todo arquivo TypeScript de `apps/api/src`. **Componentes afetados:**
todos.

| ID | Título | Obrig. | Critério de conformidade | Verificação/Ferramenta | Automatizável | Refs. |
|---|---|---|---|---|---|---|
| ASNF-117 | Complexidade ciclomática de método ≤10 (limiar comum de mercado; nenhuma medição própria foi feita nas revisões anteriores — **NÃO FOI POSSÍVEL VALIDAR** o valor real hoje, o limiar é proposto, não confirmado como já cumprido) | REC até haver medição | Ferramenta de análise estática reporta ≤10 | ESLint `complexity` rule (não configurada hoje) | ✅ | NÃO FOI POSSÍVEL VALIDAR estado atual |
| ASNF-118 | Classe (Service/Controller) com mais de ~300 linhas exige justificativa ou candidatura a decomposição | REC | Contagem de linhas | Lint customizado (`max-lines`) | ✅ | `WebhookService` como caso conhecido (AGR §5.3) |
| ASNF-119 | Método com mais de ~40 linhas exige justificativa ou refatoração | REC | Contagem de linhas | ESLint `max-lines-per-function` | ✅ | — |
| ASNF-120 | Construtor com mais de 6 dependências exige justificativa | Ver **AER-017** | — | — | ✅ | AER-017 |
| ASNF-121 | Duplicação de lógica idêntica (não só padrão semelhante, código igual) entre 2+ arquivos exige extração — precedente já aplicado pela ACR (`isUniqueConstraintViolation`, `formatStructuredLog` extraídos e reusados) | OBR quando detectado | Ferramenta de detecção de duplicação (`jscpd`, não instalada hoje) reporta abaixo do limiar acordado | `jscpd` em CI (não instalado) | ✅ (ferramenta pronta, não instalada) | ACR 2026-08-01 |
| ASNF-122 | Acoplamento (fan-out) de uma classe não excede o que a AGR já mediu como normal (~1-5 dependências) sem justificativa — ver ASNF-120/AER-017 | Ver AER-017 | — | — | ✅ | AGR §5.2 |
| ASNF-123 | Coesão: uma classe trata de um domínio (não mistura, por exemplo, lógica de mensagem com lógica de conexão WhatsApp na mesma classe) | REC — formaliza o objetivo por trás da decomposição futura do `WebhookService` | Revisão de PR | ❌ | AGR §5.3 |
| ASNF-124 | "God Service"/"God Controller" — ver Parte XIII (Antipadrões) para definição formal e processo de detecção | — | — | — | — | Parte XIII |
| ASNF-125 | Nenhuma dependência circular entre módulos — `forwardRef` só como último recurso, documentado quando usado | **PRO** dependência circular não documentada | `grep -rn "forwardRef"` — hoje zero ocorrências | Análise de grafo de import (não configurada) | ⚠️ | AGR §11 (`grep` já rodado, zero resultado) |

---

# PARTE XIII — Antipadrões Oficiais

Cada antipadrão abaixo é um dos 16 citados no escopo desta revisão. Onde a AtendeHub já tem
**evidência concreta** de um caso (encontrada nas 3 revisões anteriores), ela é citada; onde
não há caso conhecido, está marcado como preventivo.

**AP-01 · God Service**
- *Descrição:* uma classe concentra múltiplas responsabilidades de domínio não relacionadas,
  reconhecível por alto fan-out (muitas dependências) e múltiplos métodos que tratam tipos de
  evento/entidade distintos.
- *Risco:* qualquer mudança em uma responsabilidade arrisca as outras; cobertura de teste dilui;
  onboarding de quem só precisa mexer numa parte exige entender o todo.
- *Como detectar:* fan-out de construtor >6 (ASNF-120) + múltiplos handlers de tipo de evento na
  mesma classe (ASNF-021).
- *Como corrigir:* decompor por tipo de evento/responsabilidade atrás de um dispatcher fino.
- *Como impedir:* ASNF-020/120 como gate de review; **caso real conhecido:** `WebhookService`, 9
  dependências, 7 responsabilidades (AGR §5.3) — ainda não corrigido, registrado como item de
  roadmap sugerido pela AGR.

**AP-02 · God Controller**
- *Descrição:* controller com número desproporcional de rotas/responsabilidades de domínios
  distintos.
- *Risco:* mesmo da AP-01, na camada HTTP.
- *Como detectar:* nº de handlers por controller.
- *Como corrigir:* dividir por sub-recurso.
- *Como impedir:* revisão de PR. **NÃO ENCONTRADO** caso real — maior controller hoje
  (`UserController`, 9 rotas) está dentro do razoável para o domínio (AGR §5.4).

**AP-03 · Query Global (sem filtro de tenant)**
- *Descrição:* `findMany`/`findFirst`/`count`/`aggregate` sobre entidade com `companyId` sem
  esse filtro.
- *Risco:* vazamento de dado entre empresas.
- *Como detectar:* revisão de PR + (quando existir) Prisma Extension de AER-006.
- *Como corrigir:* adicionar `companyId` ao `where`.
- *Como impedir:* ASNF-038/046, AER-005/006. **Casos reais:** nenhuma leitura sem filtro
  encontrada nos services centrais auditados (ABR §5) — o gap real está nas *mutações* em lote
  (AP-04), não nas leituras.

**AP-04 · `updateMany`/`deleteMany` sem tenant**
- *Descrição:* mutação em lote sobre entidade com `companyId` sem esse filtro.
- *Risco:* alteração/exclusão cruzando empresa.
- *Como detectar:* grep dirigido (método já usado na ABR §4.3) + Prisma Extension.
- *Como corrigir:* adicionar filtro ou migrar para constraint que torne a colisão impossível.
- *Como impedir:* AER-006, ASNF-046. **Casos reais:** `message.service.ts:261`,
  `webhook.service.ts:365`, `whatsapp.service.ts:289` (ABR §4.3, AGR §13) — todos catalogados,
  correção pendente (B-41 + achado novo).

**AP-05 · Delete Global**
- *Descrição:* exclusão em massa sem filtro de escopo nem análise de impacto documentada.
- *Risco:* perda de dado irrecuperável em escala.
- *Como detectar:* toda ocorrência de `deleteMany` é revisão obrigatória (não há exceção
  automática).
- *Como corrigir:* escopar + documentar reversibilidade/backup antes do merge.
- *Como impedir:* regra explícita do prompt original ("Nenhum deleteMany poderá executar sem
  análise de impacto") formalizada aqui. **Caso real:** `refresh-token-cleanup.service.ts:17` —
  já documentado como intencionalmente global (só remove token já inutilizável), é o único
  `deleteMany` do sistema hoje e está dentro do critério (ABR §4.3, item 5).

**AP-06 · Lógica em Controller**
- *Descrição:* regra de negócio, acesso a dado, ou decisão de autorização dentro do handler
  HTTP em vez do Service.
- *Risco:* lógica não reusável, não testável isoladamente, mistura de camada.
- *Como detectar:* ASNF-015/018.
- *Como corrigir:* mover para Service.
- *Como impedir:* lint de import restrito (ASNF-015). **NÃO ENCONTRADO** caso real — os 18
  controllers auditados delegam 100% ao Service (ABR §2).

**AP-07 · Dependência Circular**
- *Descrição:* módulo A depende de B que depende de A, direta ou transitivamente.
- *Risco:* acoplamento rígido, dificuldade de teste isolado, risco de erro de inicialização.
- *Como detectar:* análise de grafo de import; presença de `forwardRef` é sinal de contorno já
  necessário.
- *Como corrigir:* extrair interface/módulo compartilhado, inverter a dependência.
- *Como impedir:* ASNF-125. **NÃO ENCONTRADO** caso real (zero `forwardRef` no código,
  AGR §11) — mas análise de grafo completa **não foi executada**, então a ausência de
  `forwardRef` prova só que nenhuma circularidade *exigiu* contorno, não que não exista uma
  latente.

**AP-08 · Contexto Implícito**
- *Descrição:* dado de segurança (tenant, usuário, papel) inferido de um estado global/
  implícito em vez de passado explicitamente.
- *Risco:* perda silenciosa de contexto em código assíncrono, dificuldade de auditar de onde o
  dado veio.
- *Como detectar:* revisão de todo uso de `AsyncLocalStorage`/variável de módulo mutável.
- *Como corrigir:* passar por parâmetro explícito (P-9 da Constituição).
- *Como impedir:* ASNF-045. **Caso parcial real, mas aceito:** `getRequestId()` via
  `AsyncLocalStorage` é contexto implícito **por desenho, e por natureza de baixo risco** (é só
  correlação de log, não decisão de segurança) — não é uma violação, é o único uso aceitável
  dessa técnica no sistema hoje (ABR §4.1).

**AP-09 · Singleton Manual**
- *Descrição:* instância única de uma classe mantida por padrão de código (`static instance`,
  módulo com estado) em vez do container de DI do framework.
- *Risco:* dificulta teste (não é possível isolar/mockar facilmente), esconde ciclo de vida.
- *Como detectar:* busca por padrão `static getInstance`/`let instance`.
- *Como corrigir:* usar `@Injectable()` padrão do Nest (escopo singleton já é o default do
  framework).
- *Como impedir:* revisão de PR. **NÃO ENCONTRADO** caso real — 100% dos services usam DI do
  Nest.

**AP-10 · Secrets Hardcoded**
- *Descrição:* credencial/segredo escrito literalmente no código-fonte.
- *Risco:* vazamento permanente via histórico do Git, mesmo se removido depois.
- *Como detectar:* scanner de secrets (`gitleaks`, ASNF-079).
- *Como corrigir:* mover para variável de ambiente, rotacionar a credencial exposta.
- *Como impedir:* `validateSecrets`/pre-commit hook. **NÃO ENCONTRADO** caso real — `main.ts`
  inclusive mantém uma lista de placeholders inseguros conhecidos para rejeitar
  (`INSECURE_PLACEHOLDERS`, `main.ts:18-24`), o que é evidência de que o projeto já pensa
  ativamente sobre essa classe de erro.

**AP-11 · Duplicação de Regras**
- *Descrição:* a mesma regra de negócio implementada de forma independente em dois lugares,
  arriscando divergir com o tempo.
- *Risco:* correção aplicada em um lugar, esquecida no outro.
- *Como detectar:* revisão manual + `jscpd` (ASNF-121).
- *Como corrigir:* extrair para função/helper compartilhado.
- *Como impedir:* ASNF-121. **Caso real, já corrigido pela ACR:** predicado de `P2002` repetido
  em `MessageService`/`ConversationService`, extraído para `isUniqueConstraintViolation`
  (ACR 2026-08-01). **Caso real, ainda não corrigido:** padrão de ownership-check
  (`assertOwnership`/`assertBelongsToCompany`/etc.) reimplementado por módulo (ABR/AGR §11).

**AP-12 · Autorização Apenas no Frontend**
- *Descrição:* uma ação é impedida só pela UI não oferecer o botão — a API aceita a chamada
  direta.
- *Risco:* qualquer cliente HTTP que não seja o painel (curl, script, DevTools) contorna a
  restrição inteiramente.
- *Como detectar:* para toda regra de negócio que a UI aplica, confirmar que a API a aplica
  também, independentemente.
- *Como corrigir:* mover a regra para guard/service no backend.
- *Como impedir:* AER-004. **Caso real, já catalogado:** B-40 — a ausência de escopo por
  departamento hoje só existe como comportamento de UI, a API aceita (ABR §2, AGR §3.2).

**AP-13 · Validação Apenas na UI**
- *Descrição:* formato/tipo de dado validado só no formulário do frontend, não no backend.
- *Risco:* mesmo da AP-12, aplicado a formato de dado em vez de permissão.
- *Como detectar:* todo DTO tem decorator de `class-validator` correspondente a toda validação
  que a UI já faz.
- *Como corrigir:* adicionar validação no DTO.
- *Como impedir:* `ValidationPipe` global com `forbidNonWhitelisted` já torna isso estrutural
  para o *shape*, não necessariamente para toda *regra de formato* — ASNF-025 cobre o resto.
  **NÃO FOI POSSÍVEL VALIDAR** exaustivamente se toda regra de formato do frontend tem
  espelho no backend (não auditado fora dos DTOs amostrados).

**AP-14 · Eventos sem Contexto**
- *Descrição:* evento de domínio emitido sem os dados mínimos (`companyId` no mínimo) para que
  quem o consome saiba a que tenant ele pertence.
- *Risco:* consumidor do evento (WebSocket, futuro consumidor externo) não consegue isolar por
  tenant.
- *Como detectar:* todo `emit*` do `EventsService` carrega `companyId`.
- *Como corrigir:* adicionar o campo ao payload do evento.
- *Como impedir:* ASNF-044. **NÃO ENCONTRADO** caso de evento sem `companyId` — todos os
  auditados carregam (AGR §8). Gap relacionado, não uma violação: nenhum evento carrega
  `departmentId` (ASNF-044, REC não OBR).

**AP-15 · Storage sem Tenant**
- *Descrição:* objeto de mídia armazenado/acessado sem isolamento por empresa.
- *Risco:* um objeto de uma empresa acessível/excluível por engano por outra.
- *Como detectar:* key do objeto sem prefixo `companyId`; ou operação de leitura/exclusão sem
  reconferir o prefixo contra o chamador.
- *Como corrigir:* AER-009.
- *Como impedir:* ASNF-041. **Caso real, parcial:** upload já inclui `companyId` na key
  (correto); leitura/exclusão não reconferem (gap real, AGR §4.3).

**AP-16 · Socket sem Autorização**
- *Descrição:* conexão WebSocket aceita sem validar identidade/tenant, ou validando de forma
  mais fraca que o equivalente HTTP.
- *Risco:* sessão de socket sobrevivendo a uma revogação que já derrubaria o HTTP.
- *Como detectar:* comparar as checagens do handshake de socket contra as do guard HTTP
  equivalente.
- *Como corrigir:* AER-015.
- *Como impedir:* ASNF-031/084. **Caso real, catalogado:** `EventsGateway` não verifica
  blacklist nem `isActive` (AGR §9.1) — handshake em si é autenticado corretamente (JWT
  verificado, `events.gateway.ts:74-83`), a lacuna é a paridade de revogação, não a ausência
  total de autenticação.

---

# PARTE XIV — Gestão de Exceções

Esta parte **não duplica** o processo já definido na Constituição (AER Parte VII) — usa o mesmo
processo, aplicado às normas ASNF-XXX.

| Pergunta | Resposta |
|---|---|
| Quem aprova? | Mesma matriz da Constituição, Parte VI — hoje, mantenedor único (`@Cmdev2019`); processo formal existe para quando houver segundo revisor |
| Quem registra? | `docs/00-Governanca/EXCECOES-ARQUITETURAIS.md` (a criar — mesmo arquivo proposto pela Constituição, compartilhado entre AER-XXX e ASNF-XXX; não criar dois registros paralelos) |
| Qual ADR criar? | Obrigatório quando a exceção afeta autorização, multi-tenancy, ou dado sensível (mesmo critério do AER-025); dispensável para exceção operacional de baixo risco |
| Prazo máximo | 90 dias corridos, igual à Constituição — **um único relógio**, não um prazo por documento |
| Plano de remoção | Toda exceção registrada declara, no momento do registro, o que precisa acontecer para deixar de ser necessária (não "quando alguém tiver tempo") |

---

# PARTE XV — Conformidade: Checklists Oficiais

### Checklist de Pull Request

- [ ] Referencia item de roadmap ou justifica a ausência (ASNF-013, já no template)
- [ ] `npm run lint:check` + `tsc --noEmit` + `npm test` limpos (ASNF-107)
- [ ] Controller novo/alterado: guard de autenticação presente (ASNF-016/AER-001)
- [ ] Controller novo/alterado: guard de autorização por papel/escopo presente onde aplicável
      (ASNF-017/AER-002)
- [ ] Toda `updateMany`/`deleteMany` nova sobre entidade com `companyId` tem o filtro
      (ASNF-046/AER-006)
- [ ] DTO novo tem decorator de validação em todo campo (ASNF-025)
- [ ] Nenhum `console.log` novo fora de teste (já no template)
- [ ] Nenhum `any` novo sem justificativa em comentário (já no template)
- [ ] `docs/09-APIs/API_CONTRACT.md` atualizado se a rota/shape/evento mudou (ASNF-009)
- [ ] Teste cobrindo o caminho negativo de autorização, se a mudança tocar guard/ownership-check
      (ASNF-100/101)
- [ ] Nenhuma dependência nova no construtor de um Service leva o total acima de 6 sem
      justificativa (ASNF-120/AER-017)

### Checklist de Arquitetura (mudança estrutural)

- [ ] ADR criado quando a mudança afeta autorização, multi-tenancy, ou dado sensível
      (ASNF-011/AER-025)
- [ ] Fan-out do novo/alterado componente medido e dentro do limiar, ou justificado
      (ASNF-120/122)
- [ ] Nenhuma dependência circular introduzida (ASNF-125)
- [ ] Decisão de Repository/camada nova não contradiz ADR existente sem novo ADR (ASNF-023)
- [ ] Se introduz Bull Queue nova: `companyId`, DLQ, retry decididos e documentados
      (ASNF-063/064/065)
- [ ] Se introduz client Redis novo: justificado contra reuso de um existente (ASNF-057)

### Checklist de Segurança

- [ ] Nenhum secret hardcoded (ASNF-079/AP-10)
- [ ] Nenhum dado sensível em log (ASNF-080)
- [ ] Toda nova superfície de autenticação replica as 3 checagens do `JwtStrategy` (ASNF-084/
      AER-015)
- [ ] Rate limit dedicado em rota de autenticação/criação de conta nova (ASNF-073)
- [ ] Upload de arquivo (se aplicável) segue allowlist + magic bytes + key gerada no servidor
      (ASNF-078)
- [ ] `helmet()`/CSP não desabilitados sem ADR (ASNF-074)

### Checklist de Deploy

- [ ] `HEALTHCHECK` do container responde antes do tráfego ser roteado (ASNF-086/AER-011 —
      **gap hoje**, ver B-44)
- [ ] Migration de produção (`prisma migrate deploy`) executada como passo explícito, não manual
      (ASNF-091)
- [ ] Container roda como usuário não-root (ASNF-085/AER-010 — **gap hoje**)
- [ ] `CORS_ORIGINS`/secrets validados no boot do ambiente-alvo (ASNF-036/076, já implementado)
- [ ] Graceful shutdown testado (envio de `SIGTERM` durante carga, confirma drenagem) antes de
      um reinício com tráfego real (ASNF-087/AER-012 — **gap hoje**)

### Checklist de Hardening (pré-B-40 a B-44 e além)

- [ ] Todo controller sem `RolesGuard` tem essa ausência justificada ou corrigida (AER-001/002)
- [ ] RLS habilitado nas 14 tabelas com `companyId` (AER-005)
- [ ] Os 3 `updateMany` sem filtro de tenant corrigidos (AER-006, ASNF-046)
- [ ] Nginx com os 4 headers + rate limit + redirect (AER-013/014)
- [ ] Docker roda não-root + healthcheck + graceful shutdown (AER-010/011/012)
- [ ] `EventsGateway` reimplementa blacklist + `isActive` (AER-015)

### Checklist de Auditoria (recorrente, ver Constituição Parte VIII)

- [ ] Conformidade: % de normas ASNF em ✅ vs. ⚠️ vs. violação nova
- [ ] Governança: `CODEOWNERS`/ADRs cobrem as áreas que deveriam (AER-024/025)
- [ ] Segurança: Security Layer Matrix (AGR §6) reexecutada
- [ ] Multi-tenancy: RLS + `updateMany` (AER-005/006) reexecutados
- [ ] Testes: cobertura medida, tendência (subindo/descendo/parada)
- [ ] Observabilidade: escopo declarado (Sentry sem tracing) segue sendo a decisão correta

---

# PARTE XVI — Catálogo Oficial de Normas

Tabela-índice completa. `Automatizável` usa a legenda ✅/⚠️/❌ definida no topo do documento.
`Responsável` usa os papéis da RACI da Constituição (Parte VI) — hoje, na prática, uma única
pessoa ocupa todos.

| ID | Título (resumo) | Categoria | Criticidade | Obrig. | Automatizável | Responsável |
|---|---|---|---|---|---|---|
| ASNF-001 | Nomenclatura geral | Geral | 🟡 | OBR | ⚠️ | Tech Lead |
| ASNF-002–004 | Estrutura de módulo/pasta/docs | Geral | 🟢 | OBR/REC | ❌ | Tech Lead |
| ASNF-005–007 | Versionamento (tag, API, migration) | Geral | 🟢 | OBR | ✅/❌ | DevOps |
| ASNF-008–010 | Comentários e documentação | Geral | 🟢 | REC/OBR | ❌ | Backend/Frontend Dev |
| ASNF-011–014 | ADR e Changelog | Geral | 🟡 | OBR | ❌ | Tech Lead |
| ASNF-015–018 | Controllers | Backend | 🟠 | OBR/PRO/REC | ✅/⚠️ | Backend Dev |
| ASNF-019–022 | Services | Backend | 🟠 | OBR/REC | ⚠️/✅ | Backend Dev |
| ASNF-023–024 | Repositories | Backend | 🟢 | OPC/OBR | ❌ | Arquiteto |
| ASNF-025–028 | DTOs/Validation | Backend | 🟡 | OBR/PRO/OPC | ⚠️ | Backend Dev |
| ASNF-029–033 | Providers/Guards/Interceptors/Pipes | Backend | 🟡 | OBR/REC | ❌/⚠️ | Backend Dev |
| ASNF-034–037 | Exceptions/Config | Backend | 🟡 | PRO/OBR/REC | ✅/❌ | Backend Dev |
| ASNF-038–045 | Multi-tenant | Multi-tenant | 🔴 | OBR/REC/PRO | ✅/⚠️/❌ | Backend Dev + Security |
| ASNF-046–056 | Prisma | Dados | 🔴 | OBR/PRO/REC | ✅/⚠️/❌ | Backend Dev |
| ASNF-057–062 | Redis | Infra | 🟡 | REC/OBR/PRO | ✅/⚠️/❌ | Backend Dev + DevOps |
| ASNF-063–069 | Bull | Infra | 🟠 | OBR/REC/OPC | ⚠️/❌ | Backend Dev |
| ASNF-070–084 | Segurança | Segurança | 🔴 | OBR/PRO/REC | ✅/⚠️/❌ | Security |
| ASNF-085–092 | Infraestrutura | Infra | 🟠 | OBR/REC | ✅/⚠️/❌ | DevOps |
| ASNF-093–099 | Observabilidade | Operação | 🟡 | OBR/REC/OPC | ✅/❌ | DevOps |
| ASNF-100–109 | Testes | Qualidade | 🟠 | OBR/REC | ✅/⚠️/❌ | QA + Backend Dev |
| ASNF-110–116 | Performance | Qualidade | 🟡 | OBR/REC/OPC | ⚠️/❌ | Backend Dev |
| ASNF-117–125 | Qualidade/Complexidade | Qualidade | 🟡 | REC/OBR/PRO | ✅/⚠️/❌ | Tech Lead |
| AP-01–16 | Antipadrões (catálogo qualitativo, Parte XIII) | Todas | varia | PRO | varia | Todos |

**Total: 125 normas numeradas (ASNF-001 a ASNF-125) + 16 antipadrões catalogados (AP-01 a
AP-16) + 25 regras já numeradas na Constituição (AER-001 a AER-025, referenciadas, não
duplicadas) = 166 itens de conformidade rastreáveis no conjunto AER+ASNF.**

---

# Glossário Técnico

| Termo | Definição |
|---|---|
| **ABR** | Architecture Baseline Review — documento de inventário arquitetural baseado em evidência (`docs/04-Arquitetura/ABR_2026-08-05_baseline.md`) |
| **AGR** | Architecture Governance Review — auditoria de governança sobre a baseline (`docs/04-Arquitetura/AGR_2026-08-05_governance.md`) |
| **AER** | Architecture Enforcement Review / Constituição Arquitetural — normas de mais alto nível e mecanismos de enforcement (`docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md`) |
| **ASNF** | Architecture Standards & Normative Framework — este documento; catálogo detalhado de normas de engenharia |
| **ACR** | Architecture Consolidation Review — revisão de 2026-08-01 que consolidou padrões pós B-38/B-39/B-48/B-49 |
| **ADR** | Architecture Decision Record — registro formal de decisão de arquitetura, `docs/05-ADR/` |
| **RLS** | Row-Level Security — mecanismo do PostgreSQL para restringir linhas visíveis por sessão/política |
| **TOCTOU** | Time-of-check to time-of-use — classe de condição de corrida entre verificar uma condição e agir sobre ela |
| **DLQ** | Dead Letter Queue — fila de destino para jobs que esgotaram tentativas |
| **God Service/Controller** | Antipadrão de classe que concentra responsabilidades de múltiplos domínios (ver AP-01/AP-02) |
| **Fan-in / Fan-out** | Fan-in: quantos módulos dependem de um componente. Fan-out: de quantos módulos um componente depende |
| **RACI** | Responsible/Accountable/Consulted/Informed — matriz de responsabilidade |
| **Ownership-check** | Padrão do código AtendeHub: `findFirst`/`findOne` filtrando por `companyId` (e relação de posse) antes de qualquer mutação |
| **CODEOWNERS** | Arquivo GitHub que define revisor obrigatório por caminho do repositório (`.github/CODEOWNERS`) |
| **P2002** | Código de erro do Prisma para violação de constraint única — usado no projeto como sinal de colisão de idempotência, não como falha |
| **Fail-closed / Fail-open** | Fail-closed: nega acesso/opera quando não consegue verificar uma condição de segurança. Fail-open: permite, degradando. O projeto usa os dois, deliberadamente, em pontos diferentes (ver P-8 da Constituição) |

---

# Índice de Referências Cruzadas

| Este documento cita... | Onde encontrar |
|---|---|
| Regras `AER-001` a `AER-025` | [`CONSTITUICAO-ARQUITETURAL.md`](./CONSTITUICAO-ARQUITETURAL.md) Parte III |
| Princípios `P-1` a `P-10` | [`CONSTITUICAO-ARQUITETURAL.md`](./CONSTITUICAO-ARQUITETURAL.md) Parte I |
| Achados de evidência (arquivo:linha) citados como "ABR §N" | [`ABR_2026-08-05_baseline.md`](../04-Arquitetura/ABR_2026-08-05_baseline.md) |
| Achados de governança citados como "AGR §N" | [`AGR_2026-08-05_governance.md`](../04-Arquitetura/AGR_2026-08-05_governance.md) |
| `ADR-0001` a `ADR-0008` | `docs/05-ADR/` |
| Itens de roadmap `B-XX` | `ROADMAP_ESTABILIZACAO.md` (raiz do repositório) |
| Convenção de nomenclatura | [`CONVENCAO-DE-NOMENCLATURA.md`](./CONVENCAO-DE-NOMENCLATURA.md) |
| Padrões arquiteturais consolidados (ACR) | `docs/04-Arquitetura/padroes-consolidados-2026-08.md`, `docs/04-Arquitetura/PADROES-ARQUITETURAIS-ATENDEHUB.md` |

---

# Nota final sobre o estado deste manual

Como a Constituição que o precede, este manual **não é auto-executável**. Das 125 normas
ASNF-XXX, a coluna "Automatizável" na Parte XVI mostra que uma fração relevante (marcada ⚠️ ou
❌) depende de revisão humana mesmo depois de qualquer mecanismo automático ser construído — não
porque a automação seja impossível em princípio, mas porque a decisão em si é semântica (ex.:
"esse `findUnique` sem `companyId` é seguro porque o campo é global por desenho, ou é um bug?").
Por regra desta revisão, nenhum dos mecanismos de ferramenta citados (`hadolint`, `jscpd`,
`gitleaks`, Prisma Extension, regras de ESLint customizadas, `coverageThreshold`) foi
instalado ou configurado — este documento descreve o que **deveria** existir, não relata algo
já em produção.
