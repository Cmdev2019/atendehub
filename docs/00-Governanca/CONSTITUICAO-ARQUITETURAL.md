# Constituição Arquitetural do AtendeHub

**Versão:** 1.0 · **Data:** 2026-08-05 · **Status:** Proposta (aguarda adoção formal)
**Sucede:** ACR (2026-08-01, consolidação) → [ABR](../04-Arquitetura/ABR_2026-08-05_baseline.md)
(estado atual, evidência) → [AGR](../04-Arquitetura/AGR_2026-08-05_governance.md) (gaps de
governança) → **AER** (este documento — normativo).

## Como este documento se torna vinculante

Este documento é uma **proposta normativa**. Ele não se torna "autoridade máxima sobre decisões
arquiteturais" pela sua própria existência — por regra do próprio documento (§Parte VII), toda
mudança de processo exige registro formal. A ativação recomendada, quando o usuário decidir
adotá-la, é:

1. Registrar como `ADR-0009-constituicao-arquitetural.md` em `docs/05-ADR/` (a numeração segue a
   sequência real hoje em `docs/05-ADR/`, que vai até `ADR-0008`).
2. Referenciar este arquivo a partir de `docs/00-Governanca/README.md` (que já declara, na sua
   própria seção "Conteúdo esperado", que documentos como este pertencem a esta pasta).
3. Ligar as regras automatizáveis (Parte IV) a `apps/api/eslint.config.js` e
   `.github/workflows/api-ci.yml` — **nenhuma delas está implementada hoje**; esta revisão é
   exclusivamente normativa, por regra explícita do prompt que a originou.

Nenhum código, configuração, workflow ou outro documento foi alterado na produção deste arquivo.

---

# PARTE I — Princípios Fundamentais

Cada princípio abaixo foi escolhido porque a ABR/AGR encontrou **evidência concreta** de que o
sistema hoje ou o segue bem (e o princípio serve para não regredir) ou não o segue
estruturalmente (e o princípio serve como alvo). A coluna "Evidência-base" cita de onde o
princípio nasceu — nenhum é genérico de mercado sem lastro no código real.

### P-1. Segurança por Padrão (Secure by Default)

- **Descrição:** toda superfície nova (rota, job, socket, integração) nasce fechada; abrir é um
  ato explícito e revisável, nunca o comportamento herdado por omissão.
- **Objetivo:** eliminar a classe de erro "esqueci de proteger", que é a causa raiz do B-40.
- **Escopo:** todos os controllers, guards, filas, sockets.
- **Aplicação:** um guard ausente deve **negar**, nunca liberar, por padrão — `RolesGuard`
  hoje já faz isso corretamente quando `request.user` está ausente (nega por `?? 0` na
  hierarquia, `roles.guard.ts:29`, citado na AGR §3.2), mas `JwtAuthGuard` só é aplicado por
  decisão manual em cada controller, não globalmente — o princípio exige que a ausência de
  decisão explícita resulte em bloqueio, não em abertura.
- **Impacto:** alto — é o princípio que, se violado, produziu B-40.
- **Componentes afetados:** todos os 18 controllers, o futuro `ScopedResourceGuard` sugerido na
  AGR §15, `EventsGateway`.
- **Evidência-base:** ABR §2 (5 controllers sem `RolesGuard`), AGR §2/§3.

### P-2. Menor Privilégio (Least Privilege)

- **Descrição:** todo usuário, processo e credencial opera com o mínimo de acesso necessário
  para sua função — nunca "autenticado = tudo liberado" como padrão implícito.
- **Objetivo:** conter o raio de um comprometimento de credencial ou de um bug de autorização.
- **Escopo:** roles de usuário (AGENT/SUPERVISOR/ADMIN/SUPER_ADMIN), containers Docker,
  credenciais de banco/Redis/MinIO.
- **Aplicação:** hoje violado em dois pontos concretos e verificados: (1) `AGENT` acessa
  conversa de qualquer departamento (B-40); (2) o container da API roda como `root`
  (`apps/api/Dockerfile`, AGR §10).
- **Impacto:** alto.
- **Componentes afetados:** `RolesGuard`, futuro guard de escopo, `Dockerfile`.
- **Evidência-base:** ABR §2, AGR §10.

### P-3. Defesa em Profundidade

- **Descrição:** nenhum controle de segurança relevante pode ser a única camada — uma falha em
  uma camada não pode, sozinha, expor o sistema.
- **Objetivo:** evitar que o padrão observado hoje (camada única para autorização e tenancy,
  AGR §6) continue sendo a norma.
- **Escopo:** autorização, isolamento de tenant, upload de arquivo, autenticação.
- **Aplicação:** o único subsistema que já cumpre este princípio integralmente é o upload de
  mídia (allowlist de MIME + magic bytes + key gerada pelo servidor, `storage.service.ts`,
  citado na AGR §6 como referência positiva) — é o padrão a replicar, não a inventar do zero.
- **Impacto:** alto.
- **Componentes afetados:** RLS (Postgres), guard de escopo, WebSocket auth.
- **Evidência-base:** AGR §6 (Security Layer Matrix).

### P-4. Multi-tenancy como Requisito Estrutural, não Convenção de Código

- **Descrição:** o isolamento entre empresas não pode depender inteiramente de um
  desenvolvedor lembrar de escrever `companyId` no `where` — precisa de pelo menos uma camada
  que não dependa de memória humana.
- **Objetivo:** fechar a lacuna central identificada pela AGR — hoje `companyId` é 100%
  disciplina, 0% estrutura (AGR §4).
- **Escopo:** Prisma/Postgres, Redis, Bull, Storage, WebSocket.
- **Aplicação:** RLS no Postgres (B-41) é o mecanismo estrutural mínimo aceitável — não porque
  substitui o filtro manual, mas porque o **acompanha** como rede de segurança caso o filtro
  falhe.
- **Impacto:** crítico.
- **Componentes afetados:** todas as 14 tabelas com `companyId` (ABR §4.1).
- **Evidência-base:** ABR §4.2/§4.3, AGR §4 (Tenant Flow Diagram completo).

### P-5. Separação de Responsabilidades

- **Descrição:** uma classe atende a um motivo de mudança. Quando um evento novo da Evolution
  API, uma regra de negócio de contato e uma regra de mensagem passam a exigir tocar o mesmo
  arquivo, a responsabilidade já não está separada.
- **Objetivo:** conter o crescimento do padrão "God Service" identificado no `WebhookService`
  (9 dependências, 7 responsabilidades, AGR §5.3) antes que se repita em outro módulo.
- **Escopo:** todo `*.service.ts` novo ou modificado.
- **Aplicação:** limiar declarado na regra AER-019 (Parte III).
- **Impacto:** médio — é dívida de manutenibilidade, não vulnerabilidade direta.
- **Componentes afetados:** `WebhookService` (caso conhecido), qualquer novo consumidor de
  evento externo (futuros canais além de WhatsApp, se vierem).
- **Evidência-base:** AGR §5.3.

### P-6. Idempotência em Todo Ponto de Reentrada

- **Descrição:** qualquer operação que possa ser executada mais de uma vez para o mesmo evento
  (retry de fila, replay de webhook, duplo clique) deve produzir o mesmo resultado final,
  nunca duplicar efeito colateral.
- **Objetivo:** este é o único princípio desta lista que já tem **dois precedentes de
  implementação madura e testada** no próprio código — B-48 (`MessageService#createUnique`) e
  B-49 (`ConversationService#upsertFromWebhook`), ambos com validação de concorrência real (2 a
  100 workers) documentada no roadmap. O princípio formaliza o padrão para que a próxima
  entidade com o mesmo risco (ex.: uma constraint nova, um novo tipo de upsert) siga o mesmo
  método em vez de reinventar.
- **Escopo:** toda escrita disparada por webhook ou job de fila.
- **Aplicação:** captura de `P2002` como sinal de "colisão resolvida", nunca como erro 500 cru;
  log estruturado obrigatório na colisão (ver AER-018).
- **Impacto:** alto, mas já mitigado nos dois pontos conhecidos.
- **Componentes afetados:** `MessageService`, `ConversationService`, e qualquer service futuro
  que grave dado a partir de um evento externo replicável.
- **Evidência-base:** ROADMAP_ESTABILIZACAO.md (B-48, B-49) + ADR-0002/ADR-0003 já existentes.

### P-7. Observabilidade Proporcional ao Risco

- **Descrição:** todo mecanismo de defesa silenciosa (idempotência, blacklist, RLS) deve
  deixar rastro quando é exercitado — "funcionou e ninguém soube" é tão perigoso quanto uma
  falha visível, porque impede medir se a defesa está sendo usada e com que frequência.
- **Objetivo:** formalizar o padrão que a PRR de B-48/B-49 já identificou e corrigiu (ambos os
  services não tinham `Logger` até a auditoria pós-hardening encontrar o gap).
- **Escopo:** toda captura de exceção usada como mecanismo de controle (não só erro
  inesperado).
- **Aplicação:** `formatStructuredLog`, `warn` (não `error`) para colisão resolvida com
  sucesso — padrão já em `shared/logging/structured-log.util.ts`.
- **Impacto:** médio.
- **Componentes afetados:** todos os pontos de captura de `P2002`/idempotência atual e futuros.
- **Evidência-base:** roadmap B-48/B-49 (achado de observabilidade nas duas PRRs).

### P-8. Fail Fast em Configuração, Fail Safe em Runtime

- **Descrição:** erro de configuração (secret fraco, CORS mal definido, credencial ausente)
  deve impedir o boot em produção/staging — nunca degradar silenciosamente. Erro em tempo de
  execução sobre um recurso não-crítico (ex.: Redis fora do ar para blacklist) deve degradar de
  forma **documentada e deliberada**, nunca travar a operação inteira sem necessidade.
- **Objetivo:** o sistema já pratica a primeira metade bem (`validateSecrets`/
  `validateCorsOrigins` derrubam o boot, `main.ts:110-174`) — o princípio formaliza isso como
  regra para toda configuração sensível futura, e nomeia explicitamente o comportamento
  observado de fail-open do `TokenBlacklistService` sob falha de Redis
  (`Falha ao verificar blacklist: ECONNREFUSED. Assumindo token válido (fail-open)`, mensagem
  de log capturada ao vivo durante a execução da suíte na ABR) como uma decisão que precisa
  estar **documentada como consciente**, não como omissão.
- **Escopo:** todo `ConfigService.get()` de valor sensível; toda dependência externa opcional.
- **Aplicação:** ver AER-023.
- **Impacto:** alto na parte de boot, médio na parte de degradação em runtime.
- **Componentes afetados:** `main.ts`, `TokenBlacklistService`, `StorageService` (já tem
  fail-open documentado para MinIO indisponível em dev, `storage.service.ts:144-149`).
- **Evidência-base:** `main.ts:110-174`; log real capturado durante `npx jest --coverage` na
  ABR (`token-blacklist.service.spec.ts`); `storage.service.ts:144-149`.

### P-9. Explícito É Melhor que Implícito

- **Descrição:** contexto de segurança (tenant, papel, escopo) deve ser **passado**, nunca
  **assumido**. Onde o sistema já faz isso bem (propagação de `companyId` por parâmetro
  explícito em toda a cadeia de service, ABR §4.4/AGR §4.1) é para continuar sendo o padrão —
  inclusive em vez de resolver a lacuna de contexto implícito adicionando `companyId` ao
  `AsyncLocalStorage` (que criaria uma segunda fonte de verdade implícita), a menos que uma
  decisão de arquitetura registrada em ADR justifique o contrário.
- **Objetivo:** formalizar que a extensão natural de "propagar companyId" **não** é replicar o
  padrão do `requestId` (implícito via `AsyncLocalStorage`) — é continuar explícito, e reforçar
  isso com RLS como rede de segurança (P-4), não com mais contexto implícito.
- **Escopo:** toda função de service, todo payload de job.
- **Aplicação:** parâmetro `companyId: string` continua sendo o primeiro argumento
  convencional de método de service que precise dele.
- **Impacto:** médio — é uma decisão preventiva, não uma correção de algo quebrado.
- **Componentes afetados:** todo `*.service.ts`.
- **Evidência-base:** AGR §4.1 (Tenant Flow Diagram), `request-context.ts` (só `requestId`).

### P-10. Configuração sobre Convenção Apenas Quando o Custo de Ambiguidade For Alto

- **Descrição:** a ausência de camada de `Repository` sobre o Prisma é uma decisão consciente
  já registrada (ACR 2026-08-01) — este princípio não reabre essa decisão, apenas declara o
  critério que a legitima: convenção (Service chama Prisma direto) é aceitável enquanto o custo
  de errar a convenção for baixo E auditável. No momento em que RLS (P-4) e um guard de escopo
  estrutural (P-1) existirem, a convenção "Service filtra companyId manualmente" passa a ter
  uma rede de segurança por trás — o que a torna sustentável. **Sem essas duas peças, a
  convenção sozinha não é suficiente** — é a leitura formal do porquê B-40/B-41 são
  pré-requisitos, não itens paralelos, ao resto do backlog de hardening.
- **Objetivo:** impedir que "não usamos Repository" seja lido como "não precisamos de nenhuma
  estrutura" — são afirmações diferentes.
- **Escopo:** toda decisão de arquitetura de acesso a dado.
- **Aplicação:** nenhuma nova convenção implícita pode ser introduzida sem responder "qual é o
  custo se alguém esquecer de segui-la, e existe uma rede de segurança por trás?".
- **Impacto:** médio, mas é o princípio que amarra P-1 e P-4 como pré-requisitos do resto.
- **Componentes afetados:** toda decisão de arquitetura futura.
- **Evidência-base:** ACR 2026-08-01 (decisão de não ter Repository), AGR §2 (achado central).

---

# PARTE II — Políticas Arquiteturais

Legenda: **OBR** = Obrigatória (bloqueia merge/deploy se violada, quando automatizável) ·
**REC** = Recomendada (não bloqueia, mas é sinalizada em review) · **OPC** = Opcional (decisão
do autor do PR) · **PRO** = Proibida.

### Política de Controllers

| Item | Classificação |
|---|---|
| `JwtAuthGuard` (ou `@Public()` explícito e justificado) em toda rota | OBR |
| `RolesGuard` + `@Roles()` em toda rota de mutação de dado sensível | OBR |
| Guard de escopo (departamento/agente) quando o recurso for hierárquico por natureza | OBR — **a partir da adoção de B-40**; hoje é gap conhecido, não regra ainda em vigor |
| `@ApiTags`/documentação OpenAPI por controller | REC — depende da adoção de B-45 |
| Controller acessar Prisma diretamente (bypass do Service) | **PRO** |
| Lógica de negócio dentro do Controller (além de mapear DTO→Service→resposta) | PRO |
| Handler sem DTO tipado no `@Body()`/`@Query()` | PRO — `forbidNonWhitelisted` já torna isso inviável na prática (`main.ts:87`), a política só formaliza |

### Política de Services

| Item | Classificação |
|---|---|
| Todo método que recebe `companyId` o usa no `where` de toda query que fizer, direta ou via ownership-check prévio | OBR |
| Construtor com mais de 6 dependências injetadas sem justificativa em comentário | PRO (ver AER-019) |
| Um service concentrar handlers de mais de 3 tipos de evento externo distintos sem dispatcher isolado por tipo | PRO — a partir da decomposição do `WebhookService` ser decidida; hoje é gap conhecido |
| Método `private assertOwnership`/`assertBelongsToCompany` reimplementado por módulo em vez de um helper compartilhado | REC — consolidar quando B-40 for implementado, não bloqueia hoje |
| Service instanciar seu próprio client externo (Redis, HTTP) fora de um provider compartilhado | REC — hoje 4 exceções conhecidas e aceitas (B-46), nenhuma nova permitida sem justificativa |

### Política de Repositories

| Item | Classificação |
|---|---|
| Introduzir camada de Repository | OPC — decisão consciente de não ter (ACR), revisitável só via ADR novo |
| Service acessar `PrismaService` diretamente | OBR (é o padrão atual, mantido) |

### Política Prisma

| Item | Classificação |
|---|---|
| `updateMany`/`deleteMany` sobre entidade com `companyId` (direto ou herdado) sem esse filtro | PRO, salvo exceção registrada (Parte VII) |
| `createMany` | REC evitar — nenhum caso hoje; se necessário, exige review de segurança (é uma operação que historicamente não recebe o mesmo escrutínio que `create()` unitário) |
| `$queryRaw`/`$executeRaw` | PRO por padrão — único uso hoje é `SELECT 1` de healthcheck; qualquer novo uso exige ADR |
| `findUnique`/`findFirst` usando um ID recebido do cliente sem confirmar que pertence ao tenant/relação esperada antes de usar o resultado | PRO |
| RLS habilitado nas tabelas com `companyId` | OBR — **a partir da adoção de B-41**; hoje é gap conhecido |

### Política Redis

| Item | Classificação |
|---|---|
| Novo client Redis instanciado fora de um provider compartilhado | PRO a partir da consolidação de B-46; hoje REC evitar (4 exceções já aceitas) |
| Chave sem TTL para dado que naturalmente expira (sessão, cache, blacklist) | PRO |
| Namespace de chave por tenant quando o dado for por empresa | REC |

### Política Bull

| Item | Classificação |
|---|---|
| Job que grava dado de domínio sem `companyId` no payload OU sem resolução explícita e documentada do tenant dentro do processor | PRO |
| Fila nova sem decisão explícita registrada sobre DLQ (ter ou não ter, e por quê) | OBR decidir e documentar |
| Retry sem `attempts`/`backoff` explícitos (herdar só o default global sem avaliar se é adequado ao caso) | REC revisar por fila |

### Política JWT

| Item | Classificação |
|---|---| |
| Secret validado no boot com fail-closed em produção/staging | OBR (já implementado, mantido) |
| Qualquer novo canal de autenticação (WebSocket, futura API pública) reimplementar as mesmas checagens do `JwtStrategy` (assinatura + blacklist + `isActive`) | OBR |
| Token de qualquer tipo devolvido em log, mesmo truncado | PRO |

### Política WebSocket

| Item | Classificação |
|---|---|
| Handshake autenticado por JWT verificado (não confiar em dado não assinado do cliente) | OBR (já implementado) |
| Handshake consultar blacklist de token e `isActive` do usuário | OBR — **gap hoje** (AGR §9.1), vira regra em vigor quando corrigido |
| Sala/room derivada de dado verificado no handshake, nunca de parâmetro livre do evento | OBR (já implementado, `events.gateway.ts:97`) |

### Política Storage

| Item | Classificação |
|---|---|
| Key do objeto conter `companyId` como namespace | OBR (já implementado) |
| Leitura/exclusão reconferir que o `companyId` da key bate com o tenant do chamador | OBR — **gap hoje** (AGR §4.3) |
| Bucket público | **PRO** absoluta (B-38 já fechou isso; regressão é crítica) |
| Nome de arquivo original do cliente entrar na key do objeto | **PRO** (já implementado corretamente — mantido) |

### Política Docker

| Item | Classificação |
|---|---|
| Container de produção rodar como root | **PRO** — gap hoje (B-44) |
| Imagem sem `HEALTHCHECK` | PRO — gap hoje |
| Imagem sem processo init (`tini`/`dumb-init`) como PID 1 | REC corrigir |
| Multi-stage build (build/runtime separados) | OBR (já implementado) |
| Secret embutido na imagem (`COPY .env`, `ARG` de valor sensível sem `--secret`) | **PRO** absoluta — não encontrado hoje, mantido como proibição permanente |

### Política Nginx

| Item | Classificação |
|---|---|
| Headers de segurança mínimos (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) | OBR — gap hoje (B-43) |
| Rate limit próprio (`limit_req_zone`) | OBR — gap hoje |
| Redirect HTTP→HTTPS em todo host, incluindo API | OBR — gap hoje (só `app.` tem hoje) |
| `proxy_read_timeout` elevado para rota de WebSocket | OBR — gap hoje |

### Política de Logs

| Item | Classificação |
|---|---|
| Log estruturado, correlacionado por `requestId` | OBR (já implementado) |
| Dado sensível (senha, token, PII completa) em log, mesmo em nível debug | **PRO** absoluta |
| Nível `debug` habilitado em produção | **PRO** (`main.ts:27-31` já trava isso) |

### Política de Observabilidade

| Item | Classificação |
|---|---|
| Captura de erro 5xx não tratado (Sentry ou equivalente) | OBR (já implementado) |
| Tracing distribuído de performance | OPC — decisão explícita já registrada de não ter (`tracesSampleRate: 0`), revisitável |
| Métrica de negócio exposta em formato padronizado (Prometheus) | REC — hoje só a fila de webhook tem |

### Política de Testes

| Item | Classificação |
|---|---|
| Todo Service novo com lógica de autorização/tenancy ter teste unitário cobrindo o caminho negativo (acesso negado) | OBR |
| Todo Controller novo ter ao menos um teste que valide a cadeia de guards de fato aplicada | OBR — **gap hoje** (15/18 em 0%, AGR) |
| Cenário multi-tenant (2 empresas, isolamento) coberto em pelo menos 1 teste por entidade sensível | OBR — **gap hoje**, zero cobertura |
| Cobertura medida e reportada em CI (`--coverage`) | OBR — **gap hoje**, CI roda `npm test` sem `--coverage` |

### Política de ADR

| Item | Classificação |
|---|---|
| Decisão de arquitetura que afete autorização, multi-tenancy, ou dado sensível ter ADR próprio | OBR |
| ADR criado **depois** da implementação em vez de junto/antes | PRO, exceto retroativo explicitamente marcado como tal |
| ADR sem data de revisão ou critério de quando reabrir | REC evitar |

---

# PARTE III — Regras Obrigatórias (Catálogo AER)

Cada regra é numerada, classificada por criticidade (🔴 Crítica · 🟠 Alta · 🟡 Média · 🟢 Baixa),
e indica se hoje **já está em conformidade** (✅), está em **violação conhecida e já registrada
no roadmap** (⚠️ com o ID do item), ou é **preventiva** (🆕, não há violação hoje, previne
regressão futura).

## Bloco A — Autorização

**AER-001 · 🔴 Crítica · Status: ⚠️ B-40**
*Regra:* Nenhum controller que exponha dado de negócio pode existir sem `JwtAuthGuard`
aplicado (por classe ou por rota) — exceto rotas explicitamente `@Public()` com justificativa
em comentário.
*Justificativa:* é o P-1 (Secure by Default) aplicado à camada mais externa que o código
controla.
*Critério de aprovação:* `grep` no PR mostra `@UseGuards(JwtAuthGuard` na classe/rota nova, ou
`@Public()` com comentário explicando por quê.
*Critério de reprovação:* rota nova sem nenhum dos dois.
*Auditoria:* revisão manual do diff do controller a cada PR que o toque (via CODEOWNERS, que já
existe e cobre `apps/api/src/modules/auth/`, `apps/api/src/modules/webhook/` — falta estender a
todo `*.controller.ts`, ver AER-024).
*Automação:* viável — script de CI que lista todo `@Controller` sem `@UseGuards(JwtAuthGuard...)`
nem `@Public()` na classe ou em nenhuma rota, falha o build se encontrar. Não existe hoje.

**AER-002 · 🔴 Crítica · Status: ⚠️ B-40**
*Regra:* Toda rota de mutação (`@Post`/`@Patch`/`@Put`/`@Delete`) sobre um recurso
hierarquicamente sensível (conversa, mensagem, relatório, dashboard) deve ter `@Roles()` ou um
guard de escopo — a ausência de ambos não pode ser o padrão implícito.
*Justificativa:* é a regra que, se tivesse existido, teria impedido B-40 diretamente.
*Critério de aprovação:* `RolesGuard`+`@Roles()` presente, ou guard de escopo (quando existir)
presente.
*Critério de reprovação:* `ConversationController`, `MessageController`, `NoteController`,
`DashboardController`, `ReportController` hoje — confirmado (ABR §2).
*Auditoria:* mesma do AER-001.
*Automação:* viável parcialmente — detectar ausência de `@Roles`/guard de escopo é automatizável;
decidir se a ausência é **correta** (ex.: `NotificationController`, que é escopado por design a
`userId` do JWT, não por role) exige revisão humana. Mecanismo automático sinaliza, não decide
sozinho.

**AER-003 · 🟡 Média · Status: 🆕**
*Regra:* Nenhum endpoint que exponha métrica, contagem administrativa ou dado agregado da
empresa pode depender do comportamento *implícito* de fallback de um guard (ex.: `RolesGuard`
negar por padrão quando `request.user` está ausente) como sua única proteção — a cadeia
completa (`JwtAuthGuard` + `RolesGuard`) deve estar explícita na mesma rota.
*Justificativa:* `GET /webhooks/metrics` funciona hoje por um efeito colateral correto, não por
desenho (AGR §3.2) — a regra fecha essa classe de fragilidade antes que uma mudança futura no
`RolesGuard` a exponha.
*Critério de aprovação:* rota declara os dois guards explicitamente.
*Critério de reprovação:* rota com só um guard "torcendo" para o outro estar implícito.
*Auditoria:* revisão manual, guiada pela lista de rotas administrativas/métricas do sistema.
*Automação:* viável — mesmo script do AER-001, adaptado para exigir os dois guards
simultaneamente nessa classe de rota.

**AER-004 · 🟡 Média · Status: 🆕**
*Regra:* Nenhum guard novo pode ser a única camada de decisão de autorização cujo estado de
entrada venha exclusivamente do frontend (ex.: um header/flag que o cliente define livremente,
sem derivação de um JWT verificado no servidor).
*Justificativa:* item explícito do escopo desta constituição — nenhuma regra de segurança pode
depender só de disciplina do lado que não controlamos.
*Critério de aprovação:* toda decisão de autorização deriva de dado verificado no backend (JWT,
banco), nunca de um valor que o cliente simplesmente afirma.
*Critério de reprovação:* qualquer guard que confie em `request.headers['x-role']` ou
equivalente sem derivação server-side. **NÃO ENCONTRADO** nenhum caso assim hoje — regra é
puramente preventiva.
*Auditoria:* code review.
*Automação:* difícil de automatizar de forma genérica — recomenda-se lint customizado que
sinalize qualquer guard que leia `request.headers`/`request.query` diretamente para decisão de
autorização (permite `request.user`, que vem do guard anterior).

## Bloco B — Multi-tenancy

**AER-005 · 🔴 Crítica · Status: ⚠️ B-41**
*Regra:* Toda tabela com coluna `companyId` deve ter Row-Level Security habilitado em produção,
com policy `company_id = current_company_id()`.
*Justificativa:* P-4 — é a rede de segurança estrutural que hoje não existe (ABR §4.2).
*Critério de aprovação:* `pg_policies` mostra policy ativa para a tabela; teste de
migration confirma `ENABLE ROW LEVEL SECURITY`.
*Critério de reprovação:* estado atual — 0 de 14 tabelas.
*Auditoria:* query periódica em `pg_tables`/`pg_policies` comparando contra a lista de tabelas
com `companyId` no schema.
*Automação:* alta viabilidade — script de CI/cron que roda
`SELECT tablename FROM pg_tables WHERE rowsecurity = false` e compara contra a lista de modelos
`companyId` do Prisma schema, falha se houver divergência.

**AER-006 · 🟠 Alta · Status: ⚠️ B-41 (2 casos) + achado ABR (1 caso adicional)**
*Regra:* Nenhum `updateMany`/`deleteMany` sobre uma entidade que possua `companyId` (direto ou
herdado via relação) pode omitir esse filtro, exceto exceção registrada (Parte VII).
*Justificativa:* os 3 casos reais catalogados (ABR §4.3: `message.service.ts:261`,
`webhook.service.ts:365`, `whatsapp.service.ts:289`) são exatamente o que esta regra impede.
*Critério de aprovação:* toda chamada de `updateMany`/`deleteMany` no diff do PR tem
`companyId` (ou campo de unicidade global genuína, como `RefreshToken.token`, documentado como
exceção aceita permanente) no `where`.
*Critério de reprovação:* ausência sem justificativa.
*Auditoria:* grep dirigido nos PRs que tocam `*.service.ts`.
*Automação:* alta viabilidade — **Prisma Client Extension** (`$extends` em
`query.$allOperations`) que intercepta `updateMany`/`deleteMany` em modelos com `companyId` no
schema e lança erro em tempo de execução (ou só loga um alerta, dependendo do apetite a risco)
se `companyId` não estiver no `where`. É o mecanismo mais forte disponível porque roda mesmo
que o code review erre.

**AER-007 · 🟡 Média · Status: 🆕**
*Regra:* Todo `findUnique`/`findFirst` que recebe um identificador de recurso vindo
diretamente do cliente (path param, query param, body) deve, antes de usar o resultado, ou (a)
incluir `companyId`/relação de posse no próprio `where`, ou (b) confirmar a posse por uma
chamada de ownership-check antes de qualquer uso do dado retornado.
*Justificativa:* fecha a classe de risco do achado do cursor de mensagem
(`message.service.ts:42`, ABR §4.3) antes que se repita.
*Critério de aprovação:* o resultado da consulta só é usado depois de uma confirmação de posse.
*Critério de reprovação:* uso direto do resultado (mesmo que só um campo, como `sentAt`) sem
confirmação.
*Auditoria:* code review dirigido a todo novo `findUnique`/`findFirst` que receba parâmetro do
cliente.
*Automação:* baixa viabilidade automática — é um padrão semântico, não sintático puro; lint
customizado pode, no máximo, sinalizar todo `findUnique`/`findFirst` cujo `where` não inclua
`companyId` para revisão manual obrigatória (não pode decidir sozinho se o caso é ou não seguro,
já que alguns são por desenho — ex.: `user.email` global).

**AER-008 · 🟠 Alta · Status: 🆕**
*Regra:* Toda Bull Queue nova que processe job com dado de domínio sensível deve, ou (a)
carregar `companyId` explicitamente no payload do job, ou (b) resolver o tenant de forma
verificável dentro do processor antes de qualquer escrita, com o método de resolução
documentado em comentário no processor.
*Justificativa:* formaliza o padrão já correto de `sla-check`/`auto-attendance-inactivity`
(companyId explícito) e `webhook` (resolução verificável via `sessionName`) como obrigatório
para toda fila futura — AGR §7/§4.1.
*Critério de aprovação:* payload do job ou comentário do processor demonstra a origem do
tenant.
*Critério de reprovação:* processor que assume tenant sem derivação rastreável.
*Auditoria:* code review de todo `@Processor` novo.
*Automação:* baixa — é semântico. Lint pode, no máximo, alertar sobre `@Processor` novo sem
`companyId` em nenhum tipo de `JobData` associado, para revisão manual.

**AER-009 · 🟡 Média · Status: ⚠️ achado AGR §4.3**
*Regra:* `StorageService` (ou equivalente futuro) deve reconferir, em toda operação de leitura
ou exclusão, que o segmento `companyId` embutido na key do objeto corresponde ao tenant do
chamador, quando o chamador tiver esse contexto disponível.
*Justificativa:* fecha o único ponto do fluxo de tenant onde a propagação vira "implícita"
(AGR §4.2, achado §4.3).
*Critério de aprovação:* `getPresignedUrl`/`delete`/`presignUrl` recebem `companyId` esperado e
comparam contra o prefixo da key antes de agir.
*Critério de reprovação:* estado atual — nenhuma comparação.
*Auditoria:* revisão manual do `StorageService` a cada mudança.
*Automação:* média viabilidade — teste unitário obrigatório que tenta ler/excluir uma key de
"outra empresa" e espera rejeição; não impede em runtime sem a mudança de código em si (fora do
escopo desta revisão normativa).

## Bloco C — Infraestrutura e Rede

**AER-010 · 🟠 Alta · Status: ⚠️ B-44**
*Regra:* Nenhum container de produção pode executar como `root` — todo `Dockerfile` de runtime
deve declarar `USER` não-root com ownership correto dos arquivos que precisa acessar.
*Justificativa:* P-2 (menor privilégio) aplicado à infraestrutura.
*Critério de aprovação:* `docker exec <container> whoami` retorna um usuário não-root.
*Critério de reprovação:* estado atual do `apps/api/Dockerfile`.
*Auditoria:* verificação manual pós-build ou scan de imagem.
*Automação:* alta viabilidade — `hadolint` (linter de Dockerfile) tem regra nativa para
ausência de `USER` (DL3002); pode rodar em CI.

**AER-011 · 🟠 Alta · Status: ⚠️ B-44**
*Regra:* Todo serviço orquestrado via Docker Compose que sirva tráfego deve declarar
`healthcheck:` próprio; serviços que dependem dele devem usar `depends_on.condition:
service_healthy`, não só `depends_on` implícito.
*Justificativa:* sem isso, o orquestrador não distingue "container rodando" de "container
pronto para receber tráfego" — confirmado como gap real no `docker-compose.prod.yml` (AGR §10:
`postgres`/`redis` têm, `api` não).
*Critério de aprovação:* bloco `healthcheck:` presente e batendo em `/api/v1/health`.
*Critério de reprovação:* estado atual do serviço `api`.
*Auditoria:* revisão do `docker-compose*.yml` a cada PR que o toque (já coberto por
CODEOWNERS).
*Automação:* alta viabilidade — validação de schema do compose (`docker compose config`) mais
um script simples que falha se um serviço com `ports:`/tráfego não tiver `healthcheck`.

**AER-012 · 🟠 Alta · Status: ⚠️ B-44**
*Regra:* O processo Node da API deve implementar desligamento gracioso —
`app.enableShutdownHooks()` chamado, e um handler que aguarda jobs em voo antes de sair sob
`SIGTERM`.
*Justificativa:* sem isso, todo deploy ou reinício mata trabalho em andamento sem aviso — risco
direto de perda de mensagem/job (AGR §10).
*Critério de aprovação:* `enableShutdownHooks()` presente em `main.ts`; teste manual/e2e que
envia `SIGTERM` durante um job em voo e confirma que ele termina antes do processo sair.
*Critério de reprovação:* estado atual.
*Auditoria:* revisão de `main.ts` (CODEOWNERS já cobre `/apps/api/`).
*Automação:* parcial — presença da chamada é gréppable; o comportamento real sob `SIGTERM`
exige teste de integração dedicado.

**AER-013 · 🟠 Alta · Status: ⚠️ B-43**
*Regra:* Toda resposta servida pelo Nginx (HTML estático e proxy da API) deve incluir os
headers mínimos: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options`, `Referrer-Policy`. O host da API deve redirecionar HTTP→HTTPS assim como o
host do app já faz.
*Justificativa:* Nginx é a única camada que toca 100% do tráfego antes de qualquer guard da
aplicação rodar (AGR §3, §9) — hoje não participa de nenhuma defesa.
*Critério de aprovação:* `curl -I` mostra os 4 headers em ambos os hosts (`app.` e `api.`).
*Critério de reprovação:* estado atual — nenhum header presente (confirmado por leitura
integral de `infra/nginx/nginx.conf`, AGR §6).
*Auditoria:* `curl -I` periódico contra produção; revisão do `nginx.conf` a cada PR (CODEOWNERS
já cobre `/infra/`).
*Automação:* alta viabilidade — teste de smoke em CI/CD pós-deploy que roda `curl -I` contra o
ambiente e falha o pipeline se um header estiver ausente.

**AER-014 · 🟡 Média · Status: ⚠️ B-43**
*Regra:* O Nginx deve aplicar rate limiting próprio (`limit_req_zone`) independente do
`ThrottlerGuard` da aplicação, e o `location /socket.io/` deve elevar `proxy_read_timeout` acima
do default de 60s.
*Justificativa:* rate limit só na aplicação significa que a CPU do Node já foi gasta antes da
rejeição; timeout default derruba WebSocket de sessão longa sem necessidade.
*Critério de aprovação:* diretivas presentes no `nginx.conf`.
*Critério de reprovação:* estado atual.
*Auditoria:* revisão de `nginx.conf`.
*Automação:* parcial — presença de diretiva é gréppable; eficácia real exige teste de carga.

## Bloco D — Autenticação e Sessão

**AER-015 · 🟠 Alta · Status: ⚠️ achado AGR §9.1**
*Regra:* Toda superfície de autenticação (HTTP hoje; WebSocket; qualquer canal futuro) deve
implementar as mesmas três checagens do `JwtStrategy`: validade de assinatura/expiração,
consulta à blacklist de revogação, e confirmação de `isActive` do usuário no banco.
*Justificativa:* fecha a inconsistência real encontrada — `EventsGateway` hoje só faz a
primeira das três (AGR §9.1).
*Critério de aprovação:* handshake do WebSocket chama `TokenBlacklistService.isBlacklisted()` e
revalida `isActive`.
*Critério de reprovação:* estado atual.
*Auditoria:* revisão de `events.gateway.ts` (CODEOWNERS não cobre hoje `modules/events/` —
gap de processo, ver AER-024).
*Automação:* média — teste de integração que revoga um token e confirma que uma nova conexão
WebSocket com ele é rejeitada; não impede regressão sem esse teste existir e rodar em CI.

**AER-016 · 🟢 Baixa · Status: 🆕**
*Regra:* Toda secret/credencial de integração nova (uma futura API além de Evolution/MinIO/
Sentry) deve ser validada no boot com a mesma política de fail-closed em produção/staging já
aplicada a `JWT_SECRET`/`CORS_ORIGINS`.
*Justificativa:* formaliza P-8 como regra permanente, não só para os dois casos que já existem.
*Critério de aprovação:* função de validação no boot, com `process.exit(1)` em prod/staging se
ausente/inválida.
*Critério de reprovação:* nova integração cujo boot "funciona" sem a credencial e falha
silenciosamente em runtime.
*Auditoria:* code review de qualquer novo `ConfigService.get()` de valor sensível em `main.ts`
ou construtor de service.
*Automação:* baixa — é uma prática de código, não uma condição gréppável de forma confiável.

## Bloco E — Manutenibilidade e Acoplamento

**AER-017 · 🟡 Média · Status: ⚠️ achado AGR §5.3 (WebhookService)**
*Regra:* Nenhuma classe de `Service` pode ter mais de 6 dependências injetadas no construtor
sem justificativa em comentário imediatamente acima da declaração da classe.
*Justificativa:* 6 foi calibrado contra a distribuição real medida (AGR §5.2) — a maioria dos
services fica em 1-4; `WebhookService` (9) e `auto-attendance-engine.service.ts` (7) são os
únicos acima do que o resto do sistema considera normal.
*Critério de aprovação:* ≤6 dependências, ou justificativa presente.
*Critério de reprovação:* >6 sem justificativa.
*Auditoria:* revisão de constructor a cada PR que adicione dependência a um service existente.
*Automação:* alta viabilidade — regra de ESLint customizada (`max-params` do
`@typescript-eslint` já existe como base, mas mede parâmetros de função em geral; uma regra
dedicada a `constructor` de classes `@Injectable()` é viável de escrever como plugin local).

**AER-018 · 🟢 Baixa · Status: ✅ já seguida em B-48/B-49**
*Regra:* Toda captura de exceção `P2002` usada como mecanismo de idempotência deve logar via
`formatStructuredLog` em nível `warn` (nunca `error`, nunca silenciosa).
*Justificativa:* formaliza o padrão que a PRR de B-48/B-49 corrigiu depois de encontrar o gap —
a regra existe para que o próximo caso já nasça correto.
*Critério de aprovação:* presente.
*Critério de reprovação:* captura de `P2002` sem log.
*Auditoria:* code review.
*Automação:* média — lint customizado pode detectar `catch` de erro Prisma sem chamada a
`formatStructuredLog` no mesmo bloco, com falsos positivos aceitáveis (sinalização, não bloqueio
automático).

**AER-019 · 🟡 Média · Status: 🆕**
*Regra:* Migration que altera um enum de máquina de estado com invariante de unicidade
condicional (ex.: `ConversationStatus` + índice parcial `WHERE status IN (...)`) deve, no mesmo
commit, atualizar o índice parcial correspondente e o teste "tripwire" que compara o enum
inteiro.
*Justificativa:* formaliza a proteção que o B-49 já adicionou (comentário de aviso no enum +
teste tripwire, ABR B-49) como regra geral para qualquer invariante condicional futura, não só
a existente.
*Critério de aprovação:* PR que adiciona um status ao enum também toca a migration do índice e
o teste tripwire.
*Critério de reprovação:* PR que só adiciona o valor ao enum.
*Auditoria:* o próprio teste tripwire já existente falha automaticamente — é o único item desta
lista que **já tem enforcement automático real, hoje, em produção**.
*Automação:* ✅ já implementada (`Object.values(ConversationStatus)` comparado por igualdade
exata, citado no roadmap B-49).

## Bloco F — Testes

**AER-020 · 🟠 Alta · Status: ⚠️ achado AGR (15/18 controllers em 0%)**
*Regra:* Todo controller que aplique `RolesGuard`/guard de escopo deve ter ao menos um teste
que confirme que um usuário sem o papel/escopo exigido recebe 403/404 — não basta o teste do
Service equivalente.
*Justificativa:* é exatamente a lacuna que impede B-40 de ter rede de regressão (AGR §10.1,
Política de Testes).
*Critério de aprovação:* `*.controller.spec.ts` existe e cobre o caminho negativo.
*Critério de reprovação:* controller sem spec próprio, ou spec que só cobre o caminho feliz.
*Auditoria:* relatório de cobertura por arquivo (`jest --coverage`) revisado a cada release.
*Automação:* alta viabilidade — gate de CI por **cobertura mínima por arquivo de controller**
(não só agregada), usando `coverageThreshold` por glob do Jest.

**AER-021 · 🟡 Média · Status: ⚠️ achado AGR (zero teste multi-tenant)**
*Regra:* Toda entidade com `companyId` deve ter ao menos um teste (unitário ou e2e) que crie
dado em duas empresas diferentes e confirme que uma não enxerga a outra.
*Justificativa:* fecha a lacuna confirmada na ABR §10.5 — hoje zero cenário assim existe em
qualquer camada.
*Critério de aprovação:* teste presente por entidade sensível (Conversation, Message, Contact,
User, no mínimo).
*Critério de reprovação:* ausência.
*Auditoria:* checklist manual por entidade, revisado por release.
*Automação:* parcial — presença do teste é gréppável por convenção de nome
(`*.cross-tenant.spec.ts`, a definir), a qualidade do teste em si exige revisão humana.

**AER-022 · 🟢 Baixa · Status: ⚠️ CI hoje roda sem `--coverage`**
*Regra:* O pipeline de CI da API deve medir e reportar cobertura a cada execução, com um piso
mínimo que não pode regredir (ver KPIs, Parte IX).
*Justificativa:* sem medir, não há como saber se a cobertura está subindo, descendo, ou parada.
*Critério de aprovação:* `api-ci.yml` roda `jest --coverage` e falha se abaixo do piso.
*Critério de reprovação:* estado atual (`npm test` sem `--coverage`, AGR/ABR §10).
*Auditoria:* o próprio CI.
*Automação:* alta viabilidade — mudança de uma linha no workflow (`npm test` →
`npm run test:cov -- --coverageThreshold='{...}'`), mas por regra desta revisão **não foi
executada aqui**, é uma recomendação normativa.

## Bloco G — Governança de Processo

**AER-023 · 🟢 Baixa · Status: ✅ já seguida via template de PR**
*Regra:* Todo PR deve referenciar um item de ID do roadmap (`ROADMAP_ESTABILIZACAO.md`/
`ROADMAP_BACKEND.md`) ou explicar por que não há um.
*Justificativa:* já é exigido pelo `.github/PULL_REQUEST_TEMPLATE.md` existente — esta regra só
formaliza que o campo não pode ficar em branco silenciosamente.
*Critério de aprovação:* campo preenchido no template.
*Critério de reprovação:* campo vazio.
*Auditoria:* revisão do PR.
*Automação:* alta viabilidade — Action de CI que falha se a descrição do PR não contiver um
padrão `B-\d+` ou a frase de justificativa explícita.

**AER-024 · 🟡 Média · Status: 🆕**
*Regra:* `CODEOWNERS` deve cobrir todo diretório que concentre decisão de autorização ou
tenancy — hoje cobre `apps/api/src/modules/auth/`, `shared/storage/`, `webhook/`, mas **não**
cobre explicitamente `modules/events/` (WebSocket) nem os controllers de domínio individuais
(`conversation/`, `message/`, etc. — hoje cobertos só pelo padrão amplo `/apps/api/` no topo do
arquivo, que funciona, mas não sinaliza criticidade elevada como as entradas específicas
fazem).
*Justificativa:* o próprio `EventsGateway` (AER-015) é um ponto de autorização que hoje não tem
o mesmo destaque de revisão que `modules/auth/` tem.
*Critério de aprovação:* entrada específica em `CODEOWNERS` para `modules/events/`.
*Critério de reprovação:* estado atual — coberto só pelo padrão genérico.
*Auditoria:* revisão do `CODEOWNERS` a cada nova área sensível criada.
*Automação:* não aplicável (é o próprio arquivo de configuração de automação).

**AER-025 · 🟢 Baixa · Status: 🆕**
*Regra:* Toda decisão de arquitetura sobre autorização, multi-tenancy, ou tratamento de dado
sensível deve ter um ADR próprio em `docs/05-ADR/`, criado junto ou antes da implementação —
nunca só depois, exceto quando explicitamente marcado como retroativo.
*Justificativa:* hoje existem ADRs de idempotência/retry/DLQ/observabilidade (ADR-0002 a
ADR-0008) mas nenhum sobre autorização ou multi-tenancy especificamente — a lacuna que a AGR
§2 já apontou.
*Critério de aprovação:* ADR referenciado no PR que implementa a decisão.
*Critério de reprovação:* mudança estrutural de autorização/tenancy sem ADR associado.
*Auditoria:* revisão de PR (CODEOWNERS já cobre `docs/05-ADR/`).
*Automação:* baixa — é processual, não sintática.

---

# PARTE IV — Mecanismos de Enforcement

| Mecanismo | Regras que valida | Quando roda | Quem aprova exceção |
|---|---|---|---|
| **Prisma Client Extension** (`$extends`, novo — não existe hoje) | AER-006 | Runtime, toda query | Tech lead/arquiteto (única pessoa hoje, ver Parte VI) |
| **Script de CI — varredura de Controllers** (novo) | AER-001, AER-002, AER-003 | A cada PR que toque `*.controller.ts` | Idem |
| **Script de CI/cron — RLS drift** (novo) | AER-005 | Diário em produção/staging + a cada migration | Idem |
| **`hadolint`** (ferramenta pronta, não instalada hoje) | AER-010 | A cada PR que toque `Dockerfile` | Idem |
| **Validação de `docker compose config` + script custom** (novo) | AER-011 | A cada PR que toque `docker-compose*.yml` | Idem |
| **Smoke test pós-deploy (`curl -I`)** (novo) | AER-013 | Pós-deploy, produção/staging | Idem |
| **ESLint plugin local — limite de dependências de construtor** (novo) | AER-017 | A cada PR (`lint:check`, já existe no CI, regra nova a adicionar) | Idem |
| **Jest `coverageThreshold` por glob** (configuração nova em jest, ferramenta já instalada) | AER-020, AER-022 | A cada PR (`test:cov` no CI) | Idem |
| **Action de validação de template de PR** (novo) | AER-023 | Na abertura/edição de todo PR | Idem |
| **CODEOWNERS** (já existe, precisa de extensão) | AER-024 | Na abertura de todo PR que toque área coberta | Idem |
| **Code review humano** (já existe, é o mecanismo residual para tudo que não é automatizável) | AER-004, AER-007, AER-008, AER-009, AER-012 (comportamento), AER-014 (eficácia), AER-016, AER-019 (revisão do padrão em si), AER-021, AER-025 | A cada PR | Idem |
| **Teste tripwire de enum** (já existe, único mecanismo 100% automático já em produção) | AER-019 | A cada execução de suíte (`npm test`) | N/A — já é código, não precisa de aprovação de exceção |

**Nenhum destes mecanismos, exceto o teste tripwire de `ConversationStatus` e o próprio
`PULL_REQUEST_TEMPLATE.md`/`CODEOWNERS`, existe implementado hoje.** Esta Parte IV é a lista de
o que precisaria ser construído para que as regras da Parte III deixem de depender só de
disciplina — por regra desta revisão, nenhum deles foi implementado aqui.

---

# PARTE V — Controles Arquiteturais (recorrentes, não por-PR)

| Controle | Periodicidade | Responsável | Métrica | Ferramenta | Critério mínimo | Ação corretiva |
|---|---|---|---|---|---|---|
| Cobertura de teste por camada (controller/service/guard) | A cada release | Tech lead (hoje: mantenedor único) | % statements por glob | `jest --coverage` | Controller ≥60%, Service ≥70% (ver KPIs) | Bloquear release, abrir item de roadmap |
| Deriva de RLS (tabelas com `companyId` sem policy) | Diária em produção + a cada migration | DevOps/mantenedor | Contagem de tabelas sem `rowsecurity` | Query `pg_tables` | 0 tabelas com `companyId` sem RLS | Alerta imediato, tratar como incidente de segurança |
| Fan-out de construtor (candidatos a God Service) | A cada release | Tech lead | Nº de dependências por classe `@Injectable` | grep/script (AGR §5.2, método já usado nesta revisão) | Nenhuma classe nova >6 sem justificativa | Abrir item de decomposição no roadmap |
| Headers de segurança em produção | Semanal + pós-deploy | DevOps | Presença dos 4 headers mínimos | `curl -I` | 4/4 presentes em `app.` e `api.` | Corrigir `nginx.conf`, redeploy |
| Consolidação de clients Redis | A cada novo `new Redis()` no diff | Tech lead | Contagem de clients Redis distintos | grep (método usado na ABR §6) | Não aumentar além dos 4+1 já aceitos sem ADR | Bloquear PR até ADR ou reuso de provider existente |
| Cobertura de `CODEOWNERS` sobre áreas sensíveis | A cada módulo novo criado | Mantenedor | % de diretórios de `modules/` com entrada própria | Revisão manual do arquivo | 100% dos módulos que tocam auth/tenancy/dado sensível | Adicionar entrada |
| Idade de exceções arquiteturais abertas (Parte VII) | Mensal | Mantenedor | Dias desde o registro, contra prazo de expiração declarado | Planilha/arquivo de exceções (a criar) | Nenhuma exceção sem data de expiração | Reavaliar ou fechar |

---

# PARTE VI — Matriz de Responsabilidades (RACI)

**Nota de honestidade factual:** `git log`/CODEOWNERS confirmam que o AtendeHub é hoje mantido
por uma única pessoa (`@Cmdev2019` em `.github/CODEOWNERS`, todas as áreas). A matriz abaixo é
**por função**, não por headcount — no estado atual, a mesma pessoa ocupa todas as colunas.
Ela existe para (a) já definir a estrutura correta quando o time crescer, e (b) deixar
explícito, hoje, que a ausência de separação de papéis é ela mesma um dado de risco relevante
(nenhuma decisão arquitetural passa por um segundo revisor humano hoje — só por
CI/lint/self-review) — não algo a esconder atrás de uma matriz genérica.

| Atividade | Arquiteto | Tech Lead | Backend Dev | Frontend | DevOps | QA | Security |
|---|---|---|---|---|---|---|---|
| Definir princípio/política (Partes I-II) | **R/A** | C | C | C | C | I | C |
| Implementar regra (Parte III) | I | A | **R** | C (quando aplicável) | C (Docker/Nginx) | I | C |
| Aprovar exceção (Parte VII) | **A** | R | I | I | I | I | C |
| Auditar conformidade (Parte VIII) | C | **R/A** | I | I | I | C | **R** |
| Manter mecanismo de enforcement (Parte IV) | C | **A** | R (regras de service/prisma) | I | **R** (Docker/Nginx/CI) | I | C |
| Medir KPI (Parte IX) | I | **R/A** | I | I | R (infra) | R (testes) | C |
| Revisar Constituição (evolução) | **R/A** | R | C | C | C | C | C |

R = Responsável (executa) · A = Aprova (dono final) · C = Consultado · I = Informado.

---

# PARTE VII — Processo de Exceções Arquiteturais

1. **Quando uma regra pode ser quebrada?** Quando o custo de conformidade imediata excede o
   risco da não-conformidade **por um prazo definido e curto** — nunca como decisão permanente
   disfarçada de temporária.
2. **Quem aprova?** No estado atual (mantenedor único), a aprovação é auto-registrada, mas
   **deve** ser escrita, datada e justificada — o processo formal existe para o dia em que
   houver um segundo revisor, e já serve hoje como disciplina de registro (o "por que decidi
   isso" que falta em decisões tomadas só na cabeça).
3. **Como registrar?** Um arquivo `docs/00-Governanca/EXCECOES-ARQUITETURAIS.md` (a criar —
   não existe hoje) com uma entrada por exceção: regra violada (código AER-XXX), motivo, escopo
   exato (qual arquivo/rota/componente), data de início, **data de expiração obrigatória**, e
   link do ADR se a exceção for estrutural (não pontual).
4. **Como revisar?** No controle "Idade de exceções abertas" (Parte V) — mensal.
5. **Quando expira?** Toda exceção tem prazo máximo de **90 dias corridos**; passar disso sem
   renovação explícita e justificada de novo é, em si, uma violação da regra original mais uma
   violação do processo de exceção.
6. **Qual ADR deve ser criado?** Obrigatório quando a exceção afeta autorização, multi-tenancy,
   ou dado sensível (mesmo escopo do AER-025) — dispensável para exceções puramente
   operacionais/infra de baixo risco (ex.: adiar `hadolint` no CI por uma sprint).

**Exceções já implicitamente em vigor hoje, que precisam ser formalizadas retroativamente
segundo este processo assim que ele for adotado** (listadas aqui só como inventário, não como
exceções já registradas formalmente, porque o arquivo de registro ainda não existe):

- B-40, B-41, B-43, B-44 (AER-001/002, AER-005/006, AER-013/014, AER-010/011/012) — todos já têm
  item de roadmap, que cumpre parcialmente o papel de "registro", mas nenhum tem data de
  expiração declarada hoje.
- 4 clients Redis sem provider compartilhado (AER controle de Parte V) — já com racional
  registrado na ACR/B-46, sem data de expiração.
- Ausência de tracing distribuído (`tracesSampleRate: 0`) — decisão consciente já documentada
  em comentário no próprio código (`sentry.ts:6`), tratável como exceção de prazo indefinido
  justificada (é uma decisão de escopo de produto, não uma dívida técnica involuntária) —
  distinção que o processo de exceção deve preservar: nem toda exceção é dívida.

---

# PARTE VIII — Critérios de Auditoria

**Como medir conformidade:** por regra da Parte III, usando o "Critério de aprovação" declarado
em cada uma — a auditoria não inventa critério novo, aplica o que já está escrito.

**Como classificar risco de uma não-conformidade encontrada:** usar a mesma escala de
criticidade já atribuída à regra violada (🔴🟠🟡🟢, Parte III) como piso — uma auditoria pode
elevar (nunca reduzir) a criticidade de um achado específico se o contexto agravar o risco
(ex.: uma violação de AER-006 encontrada num endpoint público é mais grave que a mesma violação
num endpoint só-admin).

**Como registrar não conformidade:** mesmo padrão já em uso no `ROADMAP_ESTABILIZACAO.md` —
todo achado vira item com ID antes de ser corrigido (regra que já existe no `CLAUDE.md` do
projeto, esta constituição não a substitui, a referencia).

**Checklist mínimo de toda auditoria de conformidade** (as 8 dimensões exigidas pelo prompt
desta AER):

| Dimensão | Pergunta de auditoria | Fonte |
|---|---|---|
| Conformidade | Quantas regras da Parte III estão em ✅ vs. ⚠️ vs. violação nova? | Este documento + varredura de código |
| Governança | `CODEOWNERS`/ADRs cobrem as áreas que deveriam? | AER-024, AER-025 |
| Segurança | Security Layer Matrix (AGR §6) mudou desde a última auditoria? | Reexecutar método da AGR |
| Multi-tenancy | RLS e os 3 pontos de `updateMany` (AER-005/006) seguem no mesmo estado? | Reexecutar método da ABR §4.3 |
| Performance | NÃO FOI POSSÍVEL VALIDAR nesta AER — nenhuma das três revisões anteriores mediu latência/throughput; é uma lacuna de método a declarar, não a fingir coberta |
| Infraestrutura | Docker/Nginx (AER-010/011/013/014) seguem no mesmo estado? | Reexecutar leitura de `Dockerfile`/`docker-compose*.yml`/`nginx.conf` |
| Testes | Cobertura medida (KPIs, Parte IX) subiu, caiu, ou ficou parada? | `jest --coverage` |
| Observabilidade | Sentry/logs/tracing seguem com o mesmo escopo declarado (P-8)? | Revisão de `sentry.ts`/`winston.logger.ts` |

---

# PARTE IX — Indicadores de Conformidade (KPIs)

Toda meta abaixo usa a **medição real feita na ABR/AGR desta sessão** como linha de base — não
são metas arbitrárias, são deltas explícitos a partir de um número que foi de fato executado.

| KPI | Baseline medido (2026-08-05) | Meta de curto prazo (1 ciclo de hardening) | Meta de médio prazo |
|---|---|---|---|
| % Controllers com guard de autenticação explícito | 100% (todos os 18 já têm, ABR §2) | Manter 100% | Manter 100% |
| % Controllers com guard de autorização por papel/escopo onde aplicável | 13/18 = 72% (5 sem, B-40) | 18/18 = 100% após B-40 | Manter 100% |
| % Endpoints públicos sem justificativa documentada | 0% (os 4 públicos já são justificados por design, ABR §2) | Manter 0% | Manter 0% |
| Cobertura de statements — agregada | 50,28% (medido ao vivo, ABR §10) | ≥65% | ≥80% |
| Cobertura de statements — controllers | 0% em 15/18 | ≥50% nos 5 controllers do B-40 (prioridade) | ≥60% em todos |
| % Queries `updateMany`/`deleteMany` sobre entidade com `companyId` com filtro presente | 6/9 = 67% (ABR §4.3) | 9/9 = 100% após B-41 | Manter 100%, gate automático (Prisma extension) |
| % Tabelas com `companyId` sob RLS | 0/14 = 0% | 14/14 = 100% após B-41 | Manter 100% |
| % Containers de produção não-root | 0% (só `api`, os de infra usam imagem oficial de terceiro — NÃO FOI POSSÍVEL VALIDAR o usuário padrão de `postgres`/`redis`/`minio`/`evolution` nesta revisão, escopo era só `apps/api`) | 100% do `apps/api` após B-44 | 100% de toda imagem própria |
| Headers de segurança presentes em produção | 0/4 | 4/4 após B-43 | Manter 4/4, smoke test automático |
| % ADRs cobrindo decisões de autorização/tenancy | 0/8 ADRs existentes tratam do tema diretamente | 1 ADR novo (autorização+tenancy) | Atualizado a cada decisão nova |
| % Regras da Parte III com automação implementada | ~1/25 (só o teste tripwire de enum, AER-019) | ≥30% automatizadas (Prisma extension + script de controllers + hadolint) | ≥60% |

---

# PARTE X — Roadmap de Enforcement

## Curto prazo (junto com B-40 a B-44)

- Implementar AER-001/002/003 (varredura de controllers) **antes ou junto** de B-40 — sem isso,
  a correção de B-40 não tem gate que impeça a mesma classe de lacuna reaparecer no próximo
  controller.
- Implementar AER-005/006 (RLS + Prisma extension) junto de B-41 — a extension é o mecanismo
  que torna B-41 uma correção estrutural, não pontual.
- Implementar AER-010/011 (`hadolint` + healthcheck de compose) junto de B-44.
- Implementar AER-013 (smoke test de headers) junto de B-43.
- Corrigir AER-015 (paridade WebSocket) — pequeno, isolado, não depende de nenhum B-4x
  terminar antes.

## Médio prazo (após a leva B-40 a B-44 fechar)

- AER-020/021/022 — elevar cobertura de controller e adicionar gate de `coverageThreshold` no
  CI; é o item que a AGR já sinalizou como pré-requisito de regressão para B-40 não voltar.
  Escopo de esforço: preencher `*.controller.spec.ts` para os 15 controllers hoje em 0%.
- AER-009 (Storage reconferir companyId) — mesma classe de risco de B-41, escopo pequeno,
  independente.
- AER-017/decomposição do `WebhookService` — maior, não bloqueante, mas cresce em risco a cada
  evento novo suportado.
- Criar `docs/00-Governanca/EXCECOES-ARQUITETURAIS.md` e formalizar retroativamente as exceções
  já em vigor (Parte VII).

## Longo prazo

- Avaliar se a decisão de não ter tracing distribuído (`tracesSampleRate: 0`) segue válida
  quando o volume de produção justificar o custo.
- Reavaliar a consolidação dos 5 clients Redis (B-46) num provider compartilhado, quando um
  refactor não-funcional isolado deixar de carregar risco desproporcional (razão pela qual a
  ACR de 2026-08-01 não o fez antecipadamente).
- Revisão de toda esta Constituição — sugerida a cada marco de hardening concluído (não em
  calendário fixo), para que ela reflita o estado real do sistema e não vire, ela mesma, um
  documento que descreve uma arquitetura desejada que ninguém mais audita contra a real.

---

# Entregáveis desta revisão — mapa de onde cada um está neste documento

1. Constituição Arquitetural → este documento inteiro
2. Catálogo de Princípios → Parte I (P-1 a P-10)
3. Catálogo de Políticas → Parte II
4. Catálogo de Regras Obrigatórias → Parte III (AER-001 a AER-025)
5. Catálogo de Controles → Parte V
6. Matriz de Enforcement → Parte IV
7. Matriz RACI → Parte VI
8. Processo de Exceções → Parte VII
9. Critérios de Auditoria → Parte VIII
10. KPIs Arquiteturais → Parte IX
11. Plano de Evolução → Parte X
12. Lista de Controles Automatizáveis → coluna "Automação"/"Ferramenta" de cada regra (Parte
    III) e mecanismo (Parte IV) — automatizáveis hoje com viabilidade alta: AER-001, 002, 003,
    005, 006, 010, 011, 013, 017, 020, 022, 023
13. Lista de Controles Manuais → regras com "Automação: baixa/parcial" na Parte III: AER-004,
    007, 008, 009, 012 (comportamento), 014 (eficácia), 016, 018, 019 (revisão do padrão),
    021, 024, 025
14. Lista de Exceções Permitidas → Parte VII, bloco final ("Exceções já implicitamente em vigor
    hoje")
15. Recomendações Estratégicas → a recomendação central desta revisão é a ordem do Roadmap de
    Enforcement (Parte X, Curto Prazo): **nenhum mecanismo de enforcement listado aqui existe
    implementado hoje** — a Constituição só se torna vinculante de fato quando pelo menos os
    mecanismos de curto prazo (AER-001/002/003 e a Prisma Extension de AER-006) estiverem
    rodando em CI; até lá, ela é uma referência normativa que orienta code review humano, não
    um portão automático.
