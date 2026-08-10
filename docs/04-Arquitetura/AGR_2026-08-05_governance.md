# Architecture Governance Review (AGR) — AtendeHub

**Data:** 2026-08-05 · **Sucede:** [`ABR_2026-08-05_baseline.md`](./ABR_2026-08-05_baseline.md)
(mesma sessão) — esta revisão **reaproveita e cita** a evidência já coletada na ABR em vez de
redescobri-la, e adiciona evidência nova específica de governança (trust boundaries, grafo de
dependências, prontidão operacional). Toda citação `[ABR §N]` aponta para a seção correspondente
do documento anterior.

**Natureza da revisão:** não é auditoria de bug — é auditoria de **governança arquitetural**:
onde as responsabilidades deveriam estar vs. onde elas de fato estão, e se isso é sustentável
sem depender de disciplina individual.

**Regras seguidas:** nenhuma alteração de código, nenhum commit, nenhum patch, nenhuma sugestão
de implementação — só análise. Toda conclusão cita arquivo:linha. Onde não verificado,
"NÃO ENCONTRADO" ou "NÃO FOI POSSÍVEL VALIDAR".

---

## 1. Executive Summary

O AtendeHub tem **um único princípio arquitetural implícito de autorização e multi-tenancy: "a
camada de serviço confere `companyId` antes de agir"** — não está escrito em nenhum ADR como
princípio formal (busca em `docs/05-ADR/` não retorna nenhum ADR sobre autorização ou
multi-tenancy — só o ADR-0008 de observabilidade, citado no B-41 do roadmap). Isso significa que
**esta AGR não pode comparar "arquitetura atual" contra "arquitetura desejada" documentada
formalmente** — porque a arquitetura desejada, para autorização e tenancy, nunca foi escrita como
princípio, só existe como prática implícita e consistente no código. A comparação feita na §11
(Gap Analysis) é, portanto, entre **o que o código faz hoje** e **o que os itens já abertos do
roadmap (B-40, B-41) e os requisitos de produto descritos no `CLAUDE.md`/`ROADMAP_ESTABILIZACAO.md`
implicam que deveria fazer** — não contra um documento de arquitetura-alvo que não existe.

Achados centrais desta revisão:

1. **Autorização é 100% baseada em convenção, sem imposição estrutural.** Não há um único
   ponto (guard, decorator, middleware) que obrigue toda rota nova a declarar seu escopo. A
   consistência de hoje (§4 desta AGR) é resultado de disciplina, não de arquitetura que impeça
   o contrário.
2. **`WebhookService` é um God Service de fato**, com 9 dependências injetadas diretas e 7
   responsabilidades de domínio distintas na mesma classe (§5).
3. **Trust boundary real do sistema é mais estreito do que a defesa em profundidade sugere**:
   Nginx (a fronteira que o usuário final atravessa) não aplica nenhum cabeçalho de segurança
   nem rate limit próprio — toda a defesa de borda depende inteiramente do processo Node por
   trás dele (§3, §6).
4. **Não há ponto único de falha estrutural no desenho lógico** (Bull/Redis/Postgres são
   dependências únicas de infraestrutura, não do desenho de código) — mas **há ausência total
   de graceful shutdown e healthcheck do processo da API**, o que transforma qualquer deploy ou
   reinício em um evento com perda de requisição em voo (§8).

---

## 2. Governance Assessment — perguntas obrigatórias

**A arquitetura implementa corretamente os princípios definidos?** Não há princípios
arquiteturais formalmente definidos e versionados para autorização/multi-tenancy (busca em
`docs/05-ADR/` → só ADR-0008, sobre correlação de logs, não sobre autorização) — logo a
pergunta não tem uma resposta binária "sim/não" contra um documento; a resposta possível é: **a
prática do código é internamente consistente (§4 e ABR §4.4), mas essa prática nunca foi
elevada a princípio escrito que a proteja de regressão.**

**Existem violações arquiteturais?** Sim, uma: `WebhookService` viola separação de
responsabilidades de forma mensurável (§5). Não foi encontrada violação de camadas (nenhum
Controller acessa Prisma direto, nenhum module importa de outro sem passar pelo `Module`
provider do Nest — `grep -rn "from '\.\./\.\./modules" apps/api/src/modules --include=*.controller.ts`
→ sem resultado fora dos módulos de auth/decorators compartilhados, que são utilitários, não
domínio).

**Existem componentes críticos sem governança?** Sim — os 5 clientes Redis (ABR §6) e o padrão
de ownership-check duplicado (ABR §11) não têm dono arquitetural único nem revisão obrigatória
quando um novo endpoint é criado.

**Existem dependências implícitas?** Sim — listadas em detalhe na §3 e §4: `RolesGuard`
dependendo implicitamente de `JwtAuthGuard` já ter rodado antes (`GET /webhooks/metrics`, ABR
§2); `EventsGateway` confiando no JWT sem revalidar contra blacklist/DB (ABR §9.1); toda
mutação dependendo do `findFirst` anterior no mesmo método, sem qualquer mecanismo que force
essa ordem.

**Existem pontos únicos de falha?** Ver §8 — nenhum SPOF de **desenho** (não há singleton de
aplicação fora do padrão do Nest), mas SPOFs **operacionais** reais: 1 réplica de API (B-46 já
documentado), ausência de healthcheck fazendo o orquestrador não saber quando reiniciar.

**Existem responsabilidades mal distribuídas?** Sim — autorização por departamento/agente
deveria ser responsabilidade de um guard, hoje é responsabilidade (inexistente) da rota
individual (B-40); isolamento de tenant deveria ter uma camada de rede de segurança no banco
(RLS), hoje é 100% responsabilidade do desenvolvedor que escreve a query (B-41).

**Existe acoplamento excessivo?** Sim, pontual — `WebhookService` (§5). O resto do sistema
mostra acoplamento saudável (fan-in de `PrismaService`=26 é esperado para uma camada de dados
sem Repository; fan-in de `EventsService`=7 e `StorageService`=7 são cross-cutting concerns
legítimos, não acoplamento patológico).

**Existem componentes fazendo mais de uma responsabilidade?** `WebhookService` (parsing de
payload + resolução de tenant + upsert de contato + upsert de conversa + criação de mensagem +
download de mídia + disparo de auto-atendimento + emissão de evento — 7 responsabilidades, uma
classe). Ver §5.

---

## 3. Governança de Autorização

### 3.1 Authorization Flow Diagram (fluxo real, reconstruído do código)

```
Internet
  │
  ▼
Nginx (infra/nginx/nginx.conf) ── proxy_pass, SEM validação de auth própria
  │
  ▼
NestJS Controller (@Controller, ex.: conversation.controller.ts:24)
  │
  ▼
JwtAuthGuard  ── SE @Public() no handler/classe → PULA (jwt-auth.guard.ts:14-21)
  │                SE NÃO → AuthGuard('jwt') → JwtStrategy#validate()
  │                          ├── extrai token do header Authorization (jwt.strategy.ts:36)
  │                          ├── tokenBlacklist.isBlacklisted(token) (linha 43) ── 🔑 único
  │                          │     ponto de checagem de revogação em todo o fluxo HTTP
  │                          ├── prisma.user.findUnique({id: payload.sub}) (linha 50-58)
  │                          └── throw se !user || !user.isActive (linha 59)
  ▼
RolesGuard  ── SÓ roda se @UseGuards(..., RolesGuard) estiver na classe/rota (não é global,
  │             ABR §3) → reflector.getAllAndOverride(@Roles) → se ausente, LIBERA
  │             (roles.guard.ts:25) → se presente, compara ROLE_HIERARCHY (linhas 7-12)
  ▼
Decorator @Roles(Role.X)  ── só existe se o autor do controller lembrou de escrevê-lo
  │                           (B-40: 5 controllers não têm)
  ▼
Role  ── comparação numérica de hierarquia, não RBAC com matriz de permissões
  │
  ▼
Permission  ── NÃO ENCONTRADO — não existe esse conceito no sistema (ABR §3)
  │
  ▼
Department  ── NÃO ENCONTRADO em nenhum guard. Existe *dentro* de alguns services como
  │             FILTRO OPCIONAL de query (ex.: `ListConversationsDto.departmentId`,
  │             conversation.service.ts:106) — quem omite o filtro vê tudo, não é uma
  │             restrição, é uma facilidade de busca (ABR B-40)
  ▼
Company  ── 🔑 é aqui que a autorização real acontece na prática: dentro do Service,
  │          via `findFirst({where:{id, companyId}})` como portão prévio a toda mutação
  │          (ABR §4.4) — companyId vem de `request.user.companyId`, que veio do
  │          JwtStrategy (JWT assinado, não de parâmetro de rota)
  ▼
Service  ── camada onde 100% da lógica de authorization granular de fato mora
  │          (assertConversationOwnership, assertOwnership, assertBelongsToCompany —
  │          ABR §11)
  ▼
Repository  ── NÃO EXISTE (decisão consciente, ABR/ACR anterior) — Service chama Prisma
  │             direto
  ▼
Prisma  ── executa exatamente o `where` que o Service construiu; não tem noção de
  │         tenant nem de role — 100% dependente do Service ter montado o filtro certo
  ▼
Banco (PostgreSQL)  ── SEM RLS (ABR §4.2) — a última linha de defesa também não existe;
                        se o Service errar o filtro, o banco devolve o dado de qualquer
                        empresa sem reclamar
```

### 3.2 Respostas obrigatórias

- **Onde a autorização começa?** No `JwtAuthGuard` (autenticação) — a **autorização** por
  papel só começa, quando existe, no `RolesGuard` (5 controllers não a têm — ABR §2). A
  autorização por **dado** (este recurso é desta empresa/conversa) só começa dentro do Service,
  nunca antes.
- **Onde termina?** No `where` construído manualmente na query Prisma — não há nenhuma camada
  depois dela.
- **Existe autorização apenas no Controller?** NÃO ENCONTRADO — nenhum controller decide
  autorização por si (a lógica está nos guards ou é delegada ao service).
- **Existe autorização apenas no Service?** SIM — é o modelo dominante para escopo de dado
  (ownership de conversa/nota/tag, ver ABR §11). Para papel (role), a checagem primária é o
  guard, mas há uma checagem redundante *dentro* de alguns services também (ex.:
  `note.service.ts:89-93`, que reconfere `role === ADMIN/SUPERVISOR` mesmo sem guard de role no
  `NoteController` — ver §3.3, é a exceção que confirma a regra: onde o guard falta, o service
  às vezes compensa manualmente, às vezes não).
- **Existe autorização apenas no Frontend?** NÃO FOI POSSÍVEL VALIDAR diretamente (frontend
  fora do escopo desta revisão de backend) — mas o próprio B-40 do roadmap já registra que a
  ausência de escopo por departamento "hoje só existe no frontend" como premissa de risco (a UI
  não oferece a ação; a API aceita).
- **Existe autorização duplicada?** SIM, pontual e não sistemática: `NoteService#update`/
  `#remove` verificam `role` explicitamente (`note.service.ts:89-93,126-130`) apesar de
  `NoteController` não ter `RolesGuard` nenhum — é a única camada que roda. Não é duplicação
  redundante (defesa em profundidade real), é a **única** verificação de role que existe para
  esse recurso, só que implementada dentro do service em vez de um guard — arquiteturalmente
  inconsistente com o resto do sistema, que usa guard para isso.
- **Existe autorização implícita?** SIM — dependência do `GET /webhooks/metrics` no
  comportamento fail-closed-por-padrão do `RolesGuard` sem `request.user` garantido (ABR §2,
  §13); e a suposição, em todo `service`, de que `companyId` recebido como parâmetro já veio
  validado do JWT (nunca é revalidado contra nada no momento da query em si).
- **Existe endpoint sem validação completa?** Os 5 do B-40 (`ConversationController`,
  `MessageController`, `NoteController`, `DashboardController`, `ReportController`) — validação
  de autenticação completa, validação de **autorização por escopo de negócio** ausente.
- **Existe quebra da responsabilidade de autorização?** SIM — é o achado central desta seção:
  a responsabilidade "verificar que o usuário pode agir sobre este recurso" está fragmentada
  entre guard (papel), decorator (opcional), e método de service (dado) — sem um único ponto
  de verdade. Um desenvolvedor que adiciona uma rota nova precisa **saber e lembrar** de
  replicar as três camadas; nada no framework ou nos testes (ABR §10.1: 0% cobertura de
  controller em 15/18) o avisa se ele esquecer uma.

### 3.3 Authorization Matrix

| Camada | Mecanismo | Obrigatório por design? | Evidência de que pode ser esquecido |
|---|---|---|---|
| Autenticação | `JwtAuthGuard` por controller/rota | Não — é `@UseGuards` manual, não global | Não há exemplo esquecido hoje, mas nada impede |
| Autorização por papel | `RolesGuard` + `@Roles()` | Não — mesma natureza | 5 controllers sem `RolesGuard` (B-40) |
| Autorização por departamento/agente | Nenhum mecanismo dedicado | N/A — não existe | `ConversationController` inteiro (B-40) |
| Autorização por dono do dado (ownership) | Convenção de service (`findFirst` prévio) | Não — é padrão repetido manualmente | Nenhum caso encontrado onde falta (ABR §4.4), mas é 100% dependente de quem escreve o próximo método lembrar do padrão |
| Rede de segurança no banco | RLS | Não implementado | B-41 — zero políticas |

---

## 4. Governança Multi-Tenant

### 4.1 Tenant Flow Diagram

```
JWT (payload.companyId, cravado no login — auth.service.ts:126)
  │
  ▼
Middleware  ── RequestIdMiddleware (main.ts:41-42) só carrega requestId, NÃO companyId
  │             (shared/logging/request-context.ts:4-6 — interface de 1 campo só)
  ▼
Request Context (AsyncLocalStorage)  ── companyId NÃO passa por aqui. Fica só no
  │                                      objeto `request.user`, populado pelo
  │                                      JwtStrategy (jwt.strategy.ts:50-61)
  ▼
Controller  ── extrai `user.companyId` via @CurrentUser()/parâmetro de rota e REPASSA
  │             como argumento explícito pro Service em toda chamada — nenhuma mágica,
  │             é 100% passagem de parâmetro manual, método por método
  ▼
Service  ── recebe `companyId: string` como 1º parâmetro convencional
  │          (ex.: `findAll(companyId: string, query)` — ABR §4.4)
  ▼
Repository  ── NÃO EXISTE
  │
  ▼
Prisma  ── `companyId` entra no `where` SE o autor do método lembrou (ABR §5 — verificado
  │         extensivamente, sem exceção encontrada nos services centrais)
  ▼
Redis  ── companyId NÃO propaga para nenhum dos 5 clientes (ABR §6) — as chaves são por
  │        token/conversationId/etc., não por tenant
  ▼
Bull Queue  ── companyId propaga EXPLICITAMENTE como campo do job payload em 2 das 4
  │             filas (`sla-check`, `auto-attendance-inactivity` — ABR §7). Na fila
  │             `webhook`, o job NÃO carrega companyId — é resolvido dentro do worker
  ▼
Workers (Processors)  ── `sla-check.processor.ts:44` e `auto-attendance-inactivity
  │                        .processor.ts:25` recebem companyId do job.data diretamente.
  │                        `webhook.processor.ts:245-249` resolve via
  │                        `whatsAppConnection.findUnique({sessionName}).companyId`
  ▼
WebSocket  ── companyId re-extraído do JWT no handshake (events.gateway.ts:74-83),
  │            NÃO herdado de nenhum contexto anterior — é uma segunda verificação
  │            independente, isolada em sala `company:${companyId}` (linha 97)
  ▼
Storage (MinIO)  ── companyId entra na KEY do objeto (`${companyId}/${folder}/${uuid}
  │                  ${ext}` — storage.service.ts:184), aplicado só no `upload()`.
  │                  `getPresignedUrl`/`delete`/`presignUrl` recebem a KEY JÁ PRONTA e
  │                  NÃO conferem se o companyId embutido nela bate com o chamador —
  │                  🔑 achado novo desta AGR, ver §4.3
  ▼
Banco (PostgreSQL)  ── sem RLS, filtro é só o que chegou no `where` (ABR §4.2)
```

### 4.2 Respostas obrigatórias

- **Onde nasce o `companyId`?** No login/registro (`auth.service.ts:112,126`), gravado no
  payload do JWT assinado — é a única fonte de verdade original.
- **Quem valida?** Ninguém revalida o `companyId` do JWT contra o banco a cada requisição — o
  `JwtStrategy` valida que o **usuário** existe e está ativo (`jwt.strategy.ts:50-61`), mas não
  reconfere que `payload.companyId` ainda bate com `user.companyId` atual (na prática são
  sempre iguais porque não há operação de "mover usuário de empresa" no código —
  `grep -n "companyId" modules/user/user.service.ts` não mostra nenhum update de `companyId`
  de um `User` existente — mas se existisse, um JWT antigo com `companyId` desatualizado
  seguiria válido até expirar).
- **Quem propaga?** Cada método de service, por parâmetro explícito — nunca implicitamente.
- **Quem modifica?** Nenhum código de aplicação altera `companyId` de um registro já existente
  (NÃO ENCONTRADO nenhum `update` que mude `companyId` de `User`/`Conversation`/`Contact`/etc.)
  — consistente com o modelo de que uma vez criado, um recurso não migra de tenant.
- **Quem ignora?** Os 3 pontos do ABR §4.3 (`message.service.ts:261`, `webhook.service.ts:365`,
  `whatsapp.service.ts:289`) + o achado novo desta seção: `StorageService#getPresignedUrl`/
  `#delete`/`#presignUrl` (§4.3 abaixo).
- **Quem depende de filtro manual?** Todo o resto do sistema — é a norma, não a exceção (ABR
  §4.4, §5, §11).
- **Existe risco de perda do contexto?** Sim, estrutural: como `companyId` nunca está no
  `AsyncLocalStorage`, qualquer código novo escrito por engano em um contexto assíncrono
  "esquecido" (ex.: um `.then()` solto, um callback de terceira lib) não tem como recuperar o
  tenant sem que alguém o tenha passado explicitamente até ali — não há uma rede de segurança
  como a que `getRequestId()` oferece para logs.
- **Existe componente sem isolamento?** Os 4 clientes Redis explícitos (ABR §6) — nenhum
  particiona chave por tenant, hoje sem consequência prática porque as chaves usadas
  (token/conversationId) já são únicas o bastante, mas é ausência de defesa em profundidade.
- **Existe propagação implícita?** SIM — a única propagação implícita real do sistema é a
  **key do MinIO**: o `companyId` vira parte da string da key no upload, e depois disso, é só
  uma string qualquer para o resto do `StorageService` — a "propagação" é estrutural (embutida
  no dado), não verificada em nenhum ponto de leitura/escrita subsequente.

### 4.3 Achado novo (governança) — StorageService não reconfere companyId da própria key que gerou

`storage.service.ts:184` grava `companyId` como primeiro segmento da key
(`${companyId}/${folder}/${uuid}${ext}`). Porém `getPresignedUrl` (linha 217-223), `delete`
(linha 282-284), e `presignUrl`/`presignDeep` (linha 232-277) recebem a key/URL **já pronta** e
nunca comparam o segmento `companyId` embutido nela contra nenhum tenant do chamador — a função
confia inteiramente em quem a chama já ter validado que aquela key pertence à empresa certa.
Hoje, todos os chamadores identificados (`MediaPresignInterceptor` global, `EventsService`,
`ContactService#anonymize` via `deleteByUrl`) só processam URLs que vieram de registros já
lidos com filtro de `companyId` — não há uma exploração demonstrável com o código atual. Mas é
estruturalmente o mesmo padrão de risco do B-41: **nenhuma camada além da disciplina do
chamador impede um `StorageService.delete(key)` de apagar um objeto de outra empresa se algum
código futuro (ou um bug) passar uma key errada.** 🟡 Médio — sem exploração conhecida hoje,
mas sem rede de proteção estrutural.

### 4.4 Tenant Isolation Matrix

| Camada | Isolamento aplicado? | Mecanismo | Rede de segurança se o código errar? |
|---|---|---|---|
| JWT | ✅ | `companyId` assinado no payload | Assinatura HMAC — não falsificável sem o secret |
| HTTP Controller→Service | ✅ (manual) | Parâmetro explícito | ❌ Nenhuma — depende do autor do método |
| Prisma/Postgres | ⚠️ Parcial | `where.companyId` manual | ❌ RLS ausente (B-41) — zero rede de segurança |
| Redis (4 clients) | ❌ | Nenhum namespace | ❌ Nenhuma, mas hoje sem vetor de exploração óbvio |
| Bull (webhook) | ✅ (resolvido no worker) | `sessionName → companyId` | ❌ Depende da apikey + unicidade de sessionName (ABR achado novo) |
| Bull (sla-check, auto-attendance) | ✅ | `companyId` explícito no job | ❌ Nenhuma verificação cruzada no processor além de usar o valor recebido |
| WebSocket | ✅ | Sala `company:${companyId}`, derivada do JWT verificado no handshake | ✅ Boa — reverifica o JWT, não herda cegamente de nenhum estado anterior |
| Storage (MinIO) | ⚠️ Parcial | `companyId` na key, só no `upload()` | ❌ Leitura/exclusão não reconferem (achado §4.3) |

---

## 5. Governança das Dependências

### 5.1 Fan-in (quantos arquivos importam cada serviço — medido por grep sobre `apps/api/src`,
excluindo `.spec.ts`)

| Serviço | Fan-in | Papel |
|---|---|---|
| `PrismaService` | 26 | Esperado — é a própria camada de dados, sem Repository intermediário (decisão consciente já registrada) |
| `ConfigService` (Nest) | 16 | Esperado — infraestrutura transversal do framework |
| `EventsService` | 7 | Cross-cutting legítimo (emissão de eventos de domínio) |
| `StorageService` | 7 | Cross-cutting legítimo (mídia) |
| `AuditLogService` | 6 | Cross-cutting legítimo (auditoria, B1-4) |
| `NotificationService` | 4 | — |
| `ConversationService` | 4 | Consumido por `WebhookService`, `AutoAttendanceEngineService`, `TagService`, `NoteService`/`MessageService` (indireto via ownership check próprio, não import direto) |
| `MessageService` | 4 | — |
| `TokenBlacklistService` | 3 | — |

Nenhum service fora de `PrismaService`/`ConfigService` tem fan-in alto o bastante para ser
"central" no sentido patológico (>10) — o sistema não tem um God Service **consumido** por
todo o resto. O problema é o oposto: um service que **consome** demais (ver 5.2).

### 5.2 Fan-out (dependências injetadas no construtor — top 8, medido por grep)

| Arquivo | Nº de dependências no construtor |
|---|---|
| `modules/webhook/webhook.service.ts` | **9** |
| `modules/auto-attendance/auto-attendance-engine.service.ts` | 7 |
| `modules/message/send-message.service.ts` | 5 |
| `modules/conversation/conversation.service.ts` | 5 |
| `modules/webhook/webhook.processor.ts` | 4 |
| `modules/webhook/webhook.controller.ts` | 4 |
| `modules/sla/sla-check.processor.ts` | 4 |
| `modules/auth/auth.service.ts` | 4 |

### 5.3 God Service — `WebhookService`

`webhook.service.ts:59-68` injeta: `PrismaService`, `ContactService`, `ConversationService`,
`MessageService`, `WhatsappService`, `EvolutionService`, `EventsService`,
`MediaDownloadService`, `AutoAttendanceEngineService` — **9 dependências diretas**, incluindo
`PrismaService` **em paralelo** aos 3 services de domínio que já o encapsulariam
(`ContactService`, `ConversationService`, `MessageService`), ou seja, a classe tanto delega
quanto acessa dado diretamente. Métodos privados identificados
(`grep -n "private async handle" webhook.service.ts`): `handleMessagesUpsert`,
`processMessage`, `handleMessagesUpdate`, `handleMessagesDelete`, `handleConnectionUpdate`,
`handleQrCodeUpdate`, `handleContactsUpsert` — **7 responsabilidades de domínio distintas**
(mensagem nova, status de mensagem, exclusão de mensagem, conexão, QR code, contato) roteadas
por um único `switch`/dispatcher dentro da mesma classe.

**Impacto de governança:** qualquer mudança em qualquer um dos 6 tipos de evento da Evolution
API toca o mesmo arquivo, mesma classe — o raio de blast de um bug introduzido em
`handleContactsUpsert` inclui, na prática, recompilar/reimplantar a mesma unidade que processa
`handleMessagesDelete`. Cobertura de teste do arquivo é 83,24% de statements (ABR §10, tabela
de coverage) — razoável, mas concentrada num único arquivo grande em vez de distribuída por
responsabilidade.

**Classificação:** 🟠 Alto (governança, não segurança) — candidato natural a decomposição em
handlers por tipo de evento (`MessageUpsertHandler`, `ConnectionUpdateHandler`, etc.) atrás de
um dispatcher fino, mas essa é uma recomendação de **direção**, não uma sugestão de
implementação (fora do escopo desta revisão, por regra).

### 5.4 Outras respostas

- **God Controller:** NÃO ENCONTRADO — o maior controller por número de rotas é `UserController`
  com 9 handlers (ABR §2), dentro do razoável para o domínio (CRUD de usuário + senha + avatar).
- **Dependência circular:** NÃO ENCONTRADO (`grep -rn "forwardRef" apps/api/src` → zero
  resultados, ABR §11) — mas a ausência de `forwardRef` só prova que não há circularidade que
  **exigiu** contorno; não foi rodada análise estática de grafo de import completa
  (**NÃO FOI POSSÍVEL VALIDAR** de forma exaustiva).
- **Acoplamento excessivo:** só o caso do `WebhookService` (§5.3). O resto do sistema tem
  acoplamento proporcional ao domínio.
- **Violação de inversão de dependência:** Nenhuma clássica (Nest injeta interfaces/classes via
  DI em 100% dos casos revisados) — mas o **ausência de Repository** significa que todo Service
  depende diretamente da classe concreta `PrismaService`/da API do Prisma Client, não de uma
  abstração. É uma decisão consciente já registrada (ABR §11), não uma violação não-intencional
  — citada aqui só para completar a pergunta do escopo.

---

## 6. Governança da Segurança — Security Layer Matrix

| Ameaça | Camada 1 | Camada 2 | Camada 3 | Defesa em profundidade real? |
|---|---|---|---|---|
| Acesso sem autenticação | `JwtAuthGuard` por rota | — | — | ❌ Camada única |
| Escalação de papel | `RolesGuard` + `@Roles` | Checagem manual pontual em `NoteService` (§3.2) | — | ⚠️ Só onde por acaso existe checagem redundante |
| Vazamento cross-tenant | Filtro `companyId` no Service | — (RLS ausente, B-41) | — | ❌ Camada única, sem rede de banco |
| Força bruta de login | Throttle dedicado (5/60s, `auth.controller.ts:30`) | Hash bcrypt (custo 12, `user.service.ts:149,257,284`) | — | ⚠️ 2 camadas, mas nenhuma trava de conta (lockout) após N falhas |
| Token revogado em uso | Blacklist Redis (HTTP) | ❌ Ausente no WebSocket (ABR §9.1) | — | ⚠️ Camada única, e inconsistente entre os dois transportes |
| Upload malicioso | Allowlist de MIME (`storage.service.ts:37-59`) | Magic-byte cross-check (só imagem, linhas 21-29,316-325) | Key gerada pelo servidor (sem nome original, linha 184) | ✅ 3 camadas — a mais bem defendida do sistema |
| XSS refletido/armazenado | `ValidationPipe` com `whitelist`/`forbidNonWhitelisted` (`main.ts:84-93`) | Helmet CSP **default** habilitado no processo Node (`main.ts:56`, `helmet()` sem opções → CSP ligado por padrão na v8.2.0 instalada) | ❌ Nginx não define CSP própria para o HTML estático do frontend (`infra/nginx/nginx.conf`, sem `add_header Content-Security-Policy`) | ⚠️ A API tem CSP; **a página que o navegador do usuário de fato carrega (servida pelo Nginx) não tem nenhum cabeçalho de segurança** — é uma nuance que o item B-43 do roadmap já cobre para o Nginx, mas cuja causa raiz específica (CSP do Helmet não alcança o HTML estático) não estava explicitada |
| DDoS/abuso de rota | `ThrottlerGuard` global (100/60s) + overrides por rota sensível | — | ❌ Nginx sem `limit_req_zone` (`infra/nginx/nginx.conf`, confirmado por leitura integral — B-43) | ⚠️ Só a camada de aplicação; um Nginx sobrecarregado antes de chegar ao Node não é mitigado |
| MITM / downgrade TLS | Nginx `ssl_protocols TLSv1.2 TLSv1.3` (linha 43,68) | ❌ Sem `ssl_ciphers` explícito, sem HSTS (`add_header Strict-Transport-Security` ausente) | — | ⚠️ Protocolo mínimo ok, hardening de cipher/HSTS ausente (B-43) |
| Timing attack na validação de apikey do webhook | `timingSafeEqual` sobre hash SHA-256 (`webhook.controller.ts:166-170`) | — | — | ✅ Mitigado corretamente para essa ameaça específica |

**Respostas obrigatórias:**
- **Defesa em profundidade:** existe de forma real só para upload de mídia. Para autorização e
  tenancy é camada única. Para XSS é uma defesa **existente mas mal posicionada** (a camada que
  existe protege APIs JSON, não a superfície que mais importa para XSS — HTML/JS servido ao
  navegador).
- **Camada única de proteção:** autorização por role, isolamento de tenant, revogação de sessão
  WebSocket — todas de camada única, listadas acima.
- **Proteção redundante:** upload de mídia (3 camadas) é o único caso de redundância real
  encontrado.
- **Risco de bypass:** o mais concreto é o WebSocket ignorando blacklist/`isActive` (ABR §9.1)
  — um bypass funcional, não hipotético, da política de revogação que o resto do sistema aplica.

---

## 7. Governança de Dados — Data Ownership Matrix

| Entidade | Cria | Altera | Exclui | Consulta (típico) | Ownership claro? |
|---|---|---|---|---|---|
| `Company` | Auto-registro público (`register-company`) | `ADMIN` (próprios dados, `company.controller.ts:23-24`) | Nenhum caminho de código encontrado | Qualquer usuário autenticado (só a própria, via `user.companyId` do JWT) | ✅ |
| `User` | `ADMIN` (`user.controller.ts:51-52`) | `ADMIN` (outros) / próprio usuário (campos limitados) | `ADMIN`, soft-delete (`isActive=false`, `user.service.ts:310-314`) | `SUPERVISOR`+ lista; qualquer um lê o próprio (`/users/me`, `auth.controller.ts:91`) | ✅ |
| `Conversation` | Sistema (via webhook, `upsertFromWebhook`) — nenhum `POST` HTTP direto de criação | Qualquer `AGENT` da empresa (B-40: sem escopo de departamento) | Nenhum caminho de exclusão física encontrado (só mudança de `status`) | Qualquer `AGENT` da empresa (B-40) | ⚠️ Claro por empresa, não por dono operacional (agente/departamento) |
| `Message` | Agente (`POST`) ou sistema (webhook) | `updateStatus`/soft-delete | Soft-delete só pelo autor ou por herança de quem pode mutar a conversa | Qualquer `AGENT` da empresa via conversa | ⚠️ Mesma observação da Conversation |
| `Contact` | Qualquer `AGENT` | Qualquer `AGENT` | `ADMIN` | Qualquer `AGENT` | ✅ por empresa |
| `InternalNote` | Qualquer `AGENT` (via conversa) | Autor ou `SUPERVISOR`+ | Autor ou `SUPERVISOR`+ | Qualquer `AGENT` da empresa (via conversa) | ✅ |
| `AuditLog` | Sistema, chamada explícita nos services (decisão B1-4) | Nunca (append-only — nenhum `update`/`delete` encontrado em `audit-log.service.ts`) | Nunca | `ADMIN`+ | ✅ append-only, bom padrão |
| `RefreshToken` | Sistema (login) | Sistema (`revokedAt`) | Cron diário (expirados/revogados) | Nunca exposto por endpoint | ✅ |

**Respostas obrigatórias:**
- **Agregação incorreta:** NÃO ENCONTRADO — `dashboard.service.ts`/`report.service.ts` sempre
  agregam com `companyId` no `where` (ABR §5).
- **Acesso transversal (cross-entity sem filtro):** o achado do cursor de paginação de mensagem
  (ABR §4.3, `message.service.ts:42`) é o único caso concreto.
- **Operação global:** as 2 de `RefreshToken` (`logout`/cleanup, ABR §4.3, itens 4-5) — ambas
  justificadas por desenho (token é global por natureza, cleanup é housekeeping).
- **Operação destrutiva:** nenhum `deleteMany`/`executeRaw` destrutivo em massa fora do cleanup
  de token (ABR §4.3). Exclusões de domínio (`Contact`, `Tag`, `Department`, `Queue`) são sempre
  por `id` único, precedidas de ownership check.

---

## 8. Governança dos Eventos — Event Flow Diagram

```
Evolution API (externo, untrusted)
  │  POST /webhooks/evolution — apikey no payload/header (webhook.controller.ts:68-107)
  ▼
Bull queue "webhook"  ── job SEM companyId (ainda não resolvido) — CARREGA requestId
  │                       (webhook.controller.ts:114-123, correlação com o log HTTP original)
  ▼
WebhookProcessor (@Processor)  ── resolve tenant via sessionName→companyId
  │                                (webhook.processor.ts:245-249)
  ▼
WebhookService  ── a partir daqui, companyId é conhecido e passado explicitamente a
  │                 TODAS as chamadas subsequentes (ContactService, ConversationService,
  │                 MessageService, AutoAttendanceEngineService) — contexto preservado
  │                 por parâmetro, não implicitamente
  ▼
EventsService.emit*()  ── recebe companyId explícito em cada chamada (ex.:
  │                        conversation.service.ts:383-389) e o embute no evento
  ▼
EventsGateway  ── usa companyId do evento para roteá-lo à sala `company:${companyId}`
  │                (não confia no companyId do payload do evento por si só ser
  │                suficiente para autorizar quem recebe — a sala já limita fisicamente
  │                quem está inscrito, e a inscrição foi validada no handshake)
  ▼
Cliente WebSocket (frontend, semi-trusted)
```

**Respostas obrigatórias:**
- **Eventos preservam contexto da empresa?** Sim, sempre — todo `emit*` do `EventsService`
  revisado recebe `companyId` explícito como campo do payload (ABR conversation.service.ts:383
  como exemplo representativo).
- **Eventos preservam usuário?** Parcial — eventos de atribuição preservam `agentId`
  (`emitConversationAssigned`, `conversation.service.ts:383-389`); eventos de mensagem nova/
  status preservam `conversationId`+`companyId`, mas não necessariamente "quem" gerou o evento
  quando a origem é o sistema (webhook) — correto, já que nem sempre há um usuário humano por
  trás.
- **Eventos preservam departamento?** NÃO ENCONTRADO — nenhum evento carrega `departmentId`
  (`grep -n "departmentId" modules/events/events.service.ts` → sem resultado), consistente com
  a ausência geral de escopo por departamento (B-40). Um frontend que quisesse filtrar eventos
  por departamento no cliente não teria o dado para isso.
- **Existe perda de contexto?** Não identificada no caminho webhook→evento→WebSocket (contexto
  é passado explicitamente ponta a ponta). A perda de contexto teórica só existiria se um
  código futuro tentasse usar `AsyncLocalStorage`/`getRequestId()`-like para `companyId` — que
  não existe, então não há esse tipo de perda porque não há esse tipo de propagação implícita
  para perder (ABR §4.1).
- **Existe risco de processamento cruzado (job de uma empresa afetando outra)?** Baixo — cada
  job carrega ou resolve seu próprio `companyId`/`conversationId` isoladamente; não há
  agregação de múltiplos tenants num único job.

---

## 9. Trust Boundaries — Trust Boundary Diagram

```
[UNTRUSTED]  Internet (usuário final, Evolution API, qualquer requisição anônima)
      │
      ▼
[SEMI-TRUSTED]  Nginx (infra/nginx/nginx.conf)
      │  Papel real: TLS termination + proxy reverso + serve HTML estático.
      │  NÃO valida payload, NÃO aplica rate limit próprio, NÃO adiciona headers de
      │  segurança (confirmado por leitura integral do arquivo — B-43). É "semi-trusted"
      │  só porque está na rede interna do Docker Compose, não porque valida algo.
      ▼
[SEMI-TRUSTED → TRUSTED após o Guard]  API NestJS (apps/api)
      │  Ponto real de validação: ValidationPipe (main.ts:84-93, whitelist+forbidNonWhitelisted)
      │  + JwtAuthGuard/RolesGuard (por rota) + validação de apikey do webhook
      │  (timingSafeEqual). É AQUI que dado externo passa a ser tratado como confiável —
      │  não antes.
      ▼
[TRUSTED]  Services (lógica de domínio) — assume que tudo que chega já passou pelo
      │     ValidationPipe/Guards; não há revalidação de tipo/formato dentro do service
      ▼
[TRUSTED, mas sem verificação cruzada]  Redis / Bull — nenhuma validação de payload de job
      │     (o job é gerado pelo próprio código da API, não por entrada externa direta —
      │     confiança transitiva razoável, mas sem verificação própria)
      ▼
[TRUSTED]  PostgreSQL — recebe exatamente o que o Prisma Client monta; sem RLS, é o
      │     ponto de MENOR desconfiança de todo o sistema (aceita qualquer `where` que
      │     chegue, mesmo sem companyId)
      ▼
[SEMI-TRUSTED]  MinIO — bucket privado (B-38), acesso só via URL presignada de curta
      │     duração; a porta 9000 é exposta externamente em produção
      │     (docker-compose.prod.yml:29-30, comentário "manter apenas a API, não o
      │     console") — superfície de rede real, mitigada por presign, não por rede

[UNTRUSTED → validado na entrada]  Evolution API → webhook
      A Evolution é tecnicamente um sistema "confiável" do ponto de vista de produto
      (é infraestrutura própria do AtendeHub, roda no mesmo Docker Compose), mas o
      endpoint que a recebe (`POST /webhooks/evolution`) é tratado como UNTRUSTED por
      desenho — exige apikey, tem throttle próprio (200/60s), e todo campo do payload
      passa por normalização antes de virar dado de domínio (webhook.controller.ts,
      webhook.service.ts). Correto.

[UNTRUSTED]  Clientes WhatsApp (o usuário final do WhatsApp, não o agente) — texto e
      mídia que eles enviam chegam via Evolution → webhook → vira Message.content.
      NÃO FOI POSSÍVEL VALIDAR nesta revisão se `content` é sanitizado antes de ser
      devolvido ao frontend (o `ValidationPipe` valida o formato do BODY recebido da
      Evolution no momento da ingestão, não o conteúdo semântico da mensagem do
      WhatsApp em si — sanitização de output/XSS na renderização é responsabilidade do
      frontend, fora do escopo desta revisão de backend).
```

**Respostas obrigatórias:**
- **Onde ocorre validação?** No `ValidationPipe` global (borda da API) e nos guards de
  autenticação/autorização — nunca antes disso (Nginx não valida nada).
- **Onde dados externos entram?** 3 pontos: (1) qualquer rota HTTP autenticada (dado vindo do
  cliente do painel), (2) `POST /webhooks/evolution` (dado vindo do WhatsApp via Evolution),
  (3) upload de arquivo (`multipart/form-data`, validado por MIME+magic-bytes em
  `storage.service.ts`).
- **Onde ocorre sanitização?** Só no upload de mídia (allowlist de MIME + magic bytes +
  sanitização de metadado contra CRLF injection, `storage.service.ts:330-332`). **NÃO
  ENCONTRADO** nenhuma sanitização de string livre (nome de contato, conteúdo de mensagem,
  nota interna) contra HTML/script antes de persistir — a mitigação de XSS depende
  inteiramente do frontend escapar na renderização (**NÃO FOI POSSÍVEL VALIDAR**, frontend fora
  do escopo).
- **Onde dados deixam de ser confiáveis?** Nunca "voltam" a ser não-confiáveis depois do
  `ValidationPipe`/Guard — uma vez dentro do Service, tudo é tratado como dado interno.

---

## 10. Governança Operacional

| Item | Estado | Evidência |
|---|---|---|
| Healthcheck do processo API | ❌ Ausente no `Dockerfile` (`apps/api/Dockerfile`, sem instrução `HEALTHCHECK`) e no `docker-compose.prod.yml` (serviço `api`, linhas 51-70, sem bloco `healthcheck:` — ao contrário de `postgres`/`redis`, que usam `condition: service_healthy` como dependência de outros serviços) | Leitura integral dos dois arquivos |
| Graceful shutdown | ❌ `main.ts` não chama `app.enableShutdownHooks()`; nenhum handler de `SIGTERM`/`SIGINT` encontrado em `main.ts`/`app.module.ts` (`grep -rn "enableShutdownHooks\|SIGTERM\|SIGINT"` → zero resultados) | Confirma B-44 |
| Processo como PID 1 | ⚠️ `CMD ["node", "dist/main"]` (`Dockerfile:39`) — sem `tini`/`dumb-init`, Node roda como PID 1 direto, sem encaminhamento de sinal padronizado do SO | `Dockerfile:1-39` |
| Usuário do container | ❌ Nenhuma instrução `USER` no estágio `runtime` do Dockerfile — roda como root | `Dockerfile:20-39` |
| Migração de banco em produção | NÃO ENCONTRADO nenhum passo de `prisma migrate deploy` no `Dockerfile`/`docker-compose.prod.yml`/entrypoint — migração de produção é manual (consistente com B-44 do roadmap) | — |
| Logs estruturados | ✅ Winston, `Console` transport, nível `log` em produção / `debug` em dev (`winston.logger.ts:17-19`) | — |
| Correlação de logs (requestId) | ✅ `RequestIdMiddleware` + `AsyncLocalStorage` (ABR §4.1) | — |
| Agregação/persistência de logs fora do container | NÃO FOI POSSÍVEL VALIDAR — só há transport `Console`; se há coleta (ex.: driver de log do Docker, agente externo), é infraestrutura fora do repositório | `winston.logger.ts` |
| Erros não tratados (5xx) | ✅ Sentry (`shared/monitoring/sentry.ts`), captura ativada, mas **`tracesSampleRate: 0`** — captura de erro sim, tracing de performance não | `sentry.ts:15` |
| Tracing distribuído | ❌ Ausente — `tracesSampleRate: 0` é explícito, não omisso; decisão consciente de escopo (comentário no próprio arquivo: "o pedido era só captura") | `sentry.ts:6` |
| Métricas | ⚠️ Parcial — só a fila `webhook`/`webhook-dlq` expõe métricas Prometheus (`GET /webhooks/metrics`, ABR §2); nenhuma métrica de negócio (conversas ativas, SLA, etc.) exposta nesse formato | `webhook.controller.ts:144-161` |
| Réplicas / escala horizontal | ⚠️ Preparado parcialmente — `RedisIoAdapter` existe para permitir múltiplas réplicas do Socket.IO (`main.ts:79-81`), mas 2 services têm estado em memória de processo que quebra com >1 réplica (já documentado como B-46: `WebhookService.avatarFetchedAt`, `EventsGateway.connectedClients`) | ABR (citando B-46 do roadmap) |

**Respostas obrigatórias:**
- **Arquitetura está preparada para produção?** Parcialmente — os fundamentos de segurança de
  aplicação (secrets, CORS, rate limit, ValidationPipe) têm validação que **derruba o boot** se
  mal configurados (ABR §9, `main.ts:110-174`), o que é maduro. Os fundamentos operacionais
  (healthcheck, shutdown gracioso, migração automatizada) não existem — é o mesmo diagnóstico
  do B-44, confirmado aqui com leitura direta dos artefatos de deploy.
- **Existe ponto único de falha?** Operacional, sim: 1 réplica de API é o modo real de operação
  hoje (nada no compose de produção sobe mais de uma), e sem healthcheck o orquestrador não
  consegue nem detectar automaticamente que precisa agir se ela travar.
- **Existe recuperação automática?** Só a que o Docker `restart: always` oferece
  (`docker-compose.prod.yml`, presente em todos os serviços) — reinício cego do container, não
  uma decisão informada por healthcheck.
- **Existe monitoramento suficiente?** Para erro, sim (Sentry). Para performance/latência/
  saturação de fila, não — sem tracing e sem métrica de negócio.

---

## 11. Heat Map Arquitetural

| Componente | Impacto | Acoplamento | Exposição | Complexidade | Risco geral |
|---|---|---|---|---|---|
| `WebhookService` | Alto (ponto de entrada de todo dado do WhatsApp) | Alto (9 deps) | Média (atrás de apikey) | Alta (7 responsabilidades) | 🔴 Crítico |
| RLS ausente / isolamento multi-tenant | Alto (todo dado da empresa) | N/A (ausência estrutural) | Alta (qualquer query nova) | Baixa (a lacuna em si é simples) | 🔴 Crítico |
| Ausência de escopo por departamento (B-40) | Alto (produto: jurídico/financeiro/RH) | N/A | Alta (qualquer AGENT autenticado) | Baixa | 🔴 Crítico |
| Nginx sem headers/rate limit próprio | Médio-Alto | Baixo | Alta (é a borda) | Baixa | 🟠 Alto |
| Ausência de healthcheck/graceful shutdown | Médio (perda de requisição em deploy) | Baixo | N/A (operacional) | Baixa | 🟠 Alto |
| WebSocket sem checagem de blacklist/isActive | Médio | Baixo | Média (exige token válido não-expirado) | Baixa | 🟠 Alto |
| 5 clientes Redis sem provider compartilhado | Baixo-Médio (hoje) | Médio | Baixa | Baixa | 🟡 Médio |
| Cobertura de controller em 0% (15/18) | Médio (não é bug em si, é ausência de rede de regressão) | N/A | N/A | N/A | 🟡 Médio |
| `StorageService` sem reconferência de companyId na leitura/exclusão | Baixo (sem exploração conhecida) | Baixo | Baixa | Baixa | 🟡 Médio |
| Ausência de Swagger/OpenAPI (B-45) | Baixo (produtividade/contrato, não segurança) | N/A | N/A | N/A | 🟢 Baixo |
| Padrão de ownership-check duplicado por módulo (não extraído) | Baixo (hoje consistente) | Médio | N/A | Baixa | 🟢 Baixo |

---

## 12. Architecture Scorecard (0–10)

| Dimensão | Nota | Justificativa |
|---|---|---|
| Arquitetura geral | 6 | Padrões consistentes e conscientes (ownership-check, sem Repository por decisão), mas 1 God Service real e nenhum princípio de autorização/tenancy formalizado em ADR |
| Segurança de aplicação | 7 | Validação de secrets no boot, rate limit, hash de senha forte, defesa de upload em 3 camadas — mas WebSocket com bypass de blacklist e CSP que não alcança o HTML servido |
| Autorização | 4 | Mecanismo existe (guard+decorator) mas é opcional por rota, sem imposição estrutural; 5 controllers inteiros sem escopo de negócio (B-40); nenhum teste de controller cobre isso |
| Multi-tenancy | 4 | Disciplina de código impecável onde foi verificada, mas **zero rede de segurança** (sem RLS, sem AsyncLocalStorage de companyId) — nota baixa por ausência estrutural, não por bug encontrado |
| Infraestrutura (Docker/Compose) | 4 | Sobe e funciona, mas roda como root, sem healthcheck, sem shutdown gracioso, sem migração automatizada — tudo already conhecido como B-44 |
| Redis | 5 | Funcional e correto no uso, mas 5 conexões separadas sem consolidação, sem namespace de tenant |
| Bull | 7 | DLQ e retry configuráveis na fila crítica (`webhook`), companyId propagado explicitamente onde importa; falta DLQ nas outras 3 filas |
| Prisma | 6 | Uso consistente e disciplinado, sem Repository (decisão, não déficit), mas 3 pontos sem filtro de tenant e nenhuma constraint de banco como última linha de defesa |
| Docker | 4 | Multi-stage bem feito (build/runtime separados, glibc por necessidade documentada), mas root + sem HEALTHCHECK + sem tini |
| Nginx | 3 | TLS mínimo correto, mas zero headers de segurança, zero rate limit, timeout de WebSocket no default, sem redirect HTTP→HTTPS no host da API |
| Observabilidade | 6 | Logs estruturados + correlação de requestId + Sentry de erro são reais e bem implementados; tracing e métricas de negócio ausentes por decisão explícita de escopo |
| Testabilidade | 5 | 50,28% de cobertura real, mas concentrada em services — 15/18 controllers em 0%, exatamente onde a autorização é decidida |
| Governança (processo) | 5 | Roadmap vivo bem mantido, com changelog e IDs — mas sem ADR de autorização/tenancy, sem gate de cobertura em CI, sem guard estrutural que force o padrão observado |

**Nota consolidada (média simples): 5,2/10** — reflete um sistema com disciplina de
implementação alta e ausência de estrutura que proteja essa disciplina de regressão futura.

---

## 13. Gap Analysis

| Gap | Severidade | Item do roadmap relacionado |
|---|---|---|
| Nenhum guard de escopo por departamento/agente | 🔴 Crítico | **B-40** |
| RLS ausente no Postgres | 🔴 Crítico | **B-41** |
| 3 mutações sem filtro de `companyId` (`message.service.ts:261`, `webhook.service.ts:365`, `whatsapp.service.ts:289`) | 🟠 Alto | **B-41** (2 já citados; `whatsapp.service.ts:289` é achado novo desta revisão/ABR) |
| Nginx sem headers de segurança/rate limit/HSTS/redirect | 🟠 Alto | **B-43** |
| Docker roda como root, sem healthcheck/shutdown gracioso | 🟠 Alto | **B-44** |
| WebSocket não verifica blacklist/`isActive` | 🟠 Alto | Sem item — **achado novo** (ver ABR §9.1, §6 desta AGR) |
| `WebhookService` como God Service (9 deps, 7 responsabilidades) | 🟠 Alto | Sem item — **achado novo de governança** |
| Cobertura de controller em 0% (15/18) | 🟡 Médio | Sem item — **achado novo**, mas diretamente relevante como pré-requisito de teste de regressão para B-40 |
| `StorageService` não reconfere `companyId` na leitura/exclusão | 🟡 Médio | Sem item — **achado novo** |
| 5 clientes Redis sem provider compartilhado | 🟡 Médio | **B-46** |
| Sem Swagger/OpenAPI | 🟢 Baixo | **B-45** |
| Sem lint no frontend | 🟢 Baixo | **B-47** (fora do escopo desta revisão de backend, citado por completude) |
| Nenhum ADR formal de autorização/multi-tenancy | 🟡 Médio | Sem item — **gap de governança de processo**, não de código |
| Nenhum teste multi-tenant (2 empresas, isolamento) em qualquer camada | 🟡 Médio | Sem item — **achado novo** (ABR §10.5) |

---

## 14. Lista de evidências (nova nesta revisão, além da já listada na ABR §15)

`infra/nginx/nginx.conf` (íntegro, 90 linhas), `apps/api/Dockerfile` (íntegro, 39 linhas),
`docker-compose.prod.yml` (íntegro), `shared/storage/storage.service.ts` (íntegro, 341 linhas),
`shared/monitoring/sentry.ts` (trecho, `tracesSampleRate`), `shared/logging/winston.logger.ts`
(trecho, transports), contagem de fan-in por `grep -rl` sobre `PrismaService`, `EventsService`,
`AuditLogService`, `NotificationService`, `ConversationService`, `StorageService`,
`MessageService`, `TokenBlacklistService`, `ConfigService`; contagem de fan-out por construtor
em todos os `*.service.ts`/`*.controller.ts`/`*.processor.ts`/`events.gateway.ts`; confirmação
de versão do `helmet` instalado (8.2.0) e ausência de opções em `main.ts:56`.

---

## 15. Recomendações Estratégicas (direção, sem implementação)

1. **Formalizar em ADR os dois princípios que hoje só existem como convenção**: "toda mutação
   verifica ownership por `companyId` antes de agir" e "toda rota autenticada declara seu
   escopo mínimo de role". Um ADR não corrige nada por si, mas dá ao padrão hoje implícito um
   lugar para ser citado, revisado e cobrado em code review.
2. **Tratar B-40 e a decomposição do `WebhookService` como oportunidades da mesma frente**: a
   correção de B-40 (guard de escopo) e a consolidação do padrão de ownership-check duplicado
   (ABR §11) são, estruturalmente, o mesmo problema visto de dois ângulos — vale decidir a
   direção de uma só vez.
3. **Priorizar cobertura de controller antes ou junto de B-40**, não depois — sem ela, a
   correção de B-40 não tem como provar por teste automatizado que a regra "AGENT do
   departamento X recebe 404 pra conversa do departamento Y" se sustenta ao longo do tempo.
4. **Tratar Nginx (B-43) como parte da superfície de autorização, não só de infraestrutura** —
   é a única camada que toca 100% do tráfego antes de qualquer guard rodar; hoje ela não
   participa de nenhuma defesa.
5. **Decidir explicitamente o nível de investimento em observabilidade operacional** (tracing,
   métrica de negócio) — hoje é uma lacuna consciente (`tracesSampleRate: 0` documentado como
   decisão), não descoberta; vale confirmar se segue sendo a decisão certa antes da leva de
   Hardening tocar produção real.

---

## 16. Roadmap de Governança sugerido para as próximas fases de Hardening

Esta AGR não reordena B-40 a B-44 (a ordem já registrada no `ROADMAP_ESTABILIZACAO.md` segue
válida) — acrescenta 4 itens de governança que não tinham ID ainda, para o usuário decidir se
entram no backlog formal:

- **Novo item sugerido A** — paridade de autenticação HTTP↔WebSocket (blacklist + `isActive`
  no handshake do `EventsGateway`). Pequeno, isolado, mesma classe de risco que já motivou
  B-38/B-39.
- **Novo item sugerido B** — decomposição do `WebhookService` por tipo de evento. Maior,
  arquitetural, não bloqueante — mas cresce em risco a cada evento novo da Evolution que for
  suportado.
- **Novo item sugerido C** — cobertura de controller (guard/autorização) como pré-requisito de
  regressão para B-40, não item solto.
- **Novo item sugerido D** — `StorageService` reconferir o segmento `companyId` da key contra o
  chamador em `getPresignedUrl`/`delete`, fechando a mesma classe de risco do B-41 no MinIO.

Cabe ao usuário decidir se registra esses 4 como itens numerados no roadmap — por regra desta
revisão, nenhum código ou documento de roadmap foi alterado.
