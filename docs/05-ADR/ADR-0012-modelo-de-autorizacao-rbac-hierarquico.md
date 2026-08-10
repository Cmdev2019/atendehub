# ADR-0012 — Modelo de autorização: RBAC hierárquico por Role, sem Permission granular; escopo por departamento/agente ainda não decidido (B-40)

- **Status:** Implementada (para o modelo de Role) · Proposta (para o escopo por departamento/agente, B-40)
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia (formalização retroativa parcial + proposta parcial)
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `apps/api/src/modules/auth/guards/roles.guard.ts`,
  `apps/api/src/modules/auth/decorators/roles.decorator.ts`, os 19 controllers

> Ciclo de vida conforme `README.md` desta pasta. Esta ADR documenta **duas decisões
> relacionadas mas em estados diferentes** — deliberadamente não separadas em duas ADRs porque
> são a mesma pergunta ("como a API decide quem pode fazer o quê?") em dois níveis de
> granularidade, e a Alternativa considerada para a segunda parte pressupõe a primeira.

## Contexto

O AtendeHub tem 4 papéis (`Role`: `SUPER_ADMIN`, `ADMIN`, `SUPERVISOR`, `AGENT`,
`schema.prisma`). `RolesGuard` (`roles.guard.ts:7-12`) compara o papel do usuário contra uma
hierarquia numérica fixa — quem tem papel de nível N pode tudo que um papel de nível ≤N pode.
Não existe conceito de "Permission" separado de "Role" (nenhuma tabela `Permission` no schema).
13 dos 19 controllers aplicam `RolesGuard`+`@Roles()`; 5 (`ConversationController`,
`MessageController`, `NoteController`, `DashboardController`, `ReportController`) aplicam só
`JwtAuthGuard` — qualquer `AGENT` autenticado acessa qualquer conversa da empresa, de qualquer
departamento, de qualquer agente (achado B-40, ABR §2, AGR §3).

## Problema

Duas perguntas distintas: (1) o modelo de papel simples (4 níveis, hierárquico, sem permission
granular) é suficiente para o produto? (2) dentro desse modelo, deveria existir uma dimensão
adicional de escopo — departamento e "dono" da conversa — que hoje não existe?

## Alternativas Consideradas — Pergunta 1 (modelo de Role)

### Alternativa A — RBAC hierárquico simples (4 papéis, sem Permission granular) — **já implementado**
- **Prós:** simples de raciocinar (`userLevel >= ROLE_HIERARCHY[role]`), fácil de auditar,
  cobertura de teste alta no guard em si (`roles.guard.spec.ts`, 100%, ABR §10.4).
- **Contras:** não permite regra fina (ex.: "SUPERVISOR pode editar tag mas não usuário") sem
  crescer a hierarquia ou introduzir Permission — hoje resolvido caso a caso via `@Roles()` por
  rota (ex.: `TagController` usa `SUPERVISOR`, `UserController` mistura `SUPERVISOR`/`ADMIN` por
  rota), que já é granularidade suficiente para os casos reais do produto até agora.
- **Complexidade:** baixa.
- **Risco:** baixo — o teto da hierarquia (crescer para além de 4 papéis, ou precisar de
  permission cruzada entre papéis do mesmo nível) ainda não foi atingido.
- **Impacto:** todos os 19 controllers.
- **Custo estimado:** baixo (já implementado, mantido).

### Alternativa B — RBAC com Permission granular (tabela `Permission`, `Role` como agrupamento de permissions)
- **Prós:** flexibilidade total — qualquer combinação de ação×recurso configurável sem alterar
  código.
- **Contras:** nenhuma necessidade de produto comprovada hoje justifica o custo — todos os 13
  controllers que já usam `@Roles()` resolveram a granularidade necessária com a hierarquia
  simples. Introduzir Permission sem caso de uso real é o mesmo erro que `ADR-0003` já recusou
  para persistência ("abstração sem benefício comprovado").
- **Complexidade:** alta.
- **Risco:** baixo tecnicamente, mas custo desproporcional ao problema real.
- **Impacto:** schema (nova tabela), todos os guards, toda tela de administração de usuário.
- **Custo estimado:** alto.

## Decisão Tomada — Pergunta 1

**Alternativa A**, já implementada e mantida. Sem Permission granular enquanto nenhum caso real
de produto exigir combinação não-hierárquica de ação×recurso.

## Alternativas Consideradas — Pergunta 2 (escopo por departamento/agente)

### Alternativa A — `ScopedResourceGuard` + decorator `@Scope('own'|'department'|'company')`
- **Prós:** aplica o mesmo padrão de guard já usado para Role — declarativo, por rota, auditável
  por revisão de controller (mesmo mecanismo de detecção que `AER-001/002` já propõem para
  guard ausente).
- **Contras:** precisa decidir, por empresa, se "agentes veem todas as conversas / só do
  departamento / só as próprias" é configuração ou comportamento fixo — está descrito como
  requisito no próprio item B-40 do roadmap ("configuração por empresa"), o que implica um
  campo novo em `Company` ou `Department`.
- **Complexidade:** média-alta.
- **Risco:** médio — precisa de teste de regressão forte (hoje inexistente, AER-020) para não
  quebrar o fluxo de atendimento existente ao introduzir a restrição.
- **Impacto:** os 5 controllers do B-40 + `Company`/`Department` (configuração).
- **Custo estimado:** médio-alto (não implementado).

### Alternativa B — Filtro implícito no `findAll`/`findOne` do Service, sem guard dedicado
- **Prós:** menor mudança de superfície — só a query muda, não a cadeia de guards.
- **Contras:** contraria o Princípio P-1 (Secure by Default) e o padrão já estabelecido em todo
  o resto do sistema (autorização por Role é decidida em guard, não escondida dentro do
  `where` de uma query) — inconsistente com `NoteService`, que hoje é a única exceção já
  conhecida a esse padrão (checagem de role dentro do service, achado da AGR §3.2).
- **Complexidade:** baixa.
- **Risco:** alto — invisível em revisão de controller (quem olha o `@UseGuards` do controller
  não veria a restrição, que estaria escondida dentro do service).
- **Impacto:** os 5 services correspondentes.
- **Custo estimado:** baixo, mas na direção errada.

## Decisão Tomada — Pergunta 2

**Ainda não aprovada.** A direção proposta (não decidida) é a **Alternativa A**, alinhada ao
padrão já usado para Role em todo o resto do sistema — mas a decisão final, incluindo se o
escopo é configurável por empresa ou fixo, pertence à implementação de **B-40**, que ainda não
começou.

## Justificativa Técnica

Para a Pergunta 1: o custo de Permission granular (Alternativa B) não se paga sem um caso de
uso real — o mesmo critério de "custo/benefício comprovado" usado em `ADR-0003`/`ADR-0009`.
Para a Pergunta 2: a Alternativa A mantém consistência com o padrão de guard já usado para Role
em 13 dos 19 controllers — inconsistência estrutural (guard para Role, `where` escondido para
escopo) seria pior do que a ausência de escopo em si, porque tornaria a autorização mais difícil
de auditar por leitura do controller.

## Trade-offs

- **O que foi ganho (Pergunta 1):** simplicidade e velocidade de desenvolvimento — cada rota
  nova só precisa de um `@Roles()`, sem modelar permission.
- **O que foi perdido (Pergunta 1):** se o produto precisar de combinação não-hierárquica no
  futuro (ex.: um papel que pode ver relatório mas não editar contato, sem estar acima/abaixo de
  outro papel em tudo), a hierarquia atual não modela isso sem gambiarra.
- **Dívida técnica (Pergunta 2):** os 5 controllers sem escopo — **B-40**, crítico, já
  catalogado.

## Consequências

### Positivas
- Modelo de Role simples é fácil de auditar (`roles.guard.spec.ts` cobre 100% da lógica de
  comparação).
- Convenção de `@Roles()` por rota já é o padrão a seguir quando B-40 for implementado — não
  exige inventar um mecanismo novo do zero, só estendê-lo.

### Negativas
- Enquanto B-40 não for implementado, qualquer `AGENT` acessa dado de qualquer departamento —
  inaceitável para clientes com jurídico/financeiro/RH separados (já registrado no roadmap).

### Neutras / a observar
- A decisão de "escopo configurável por empresa" (B-40 menciona isso como requisito) é, em si,
  uma decisão de produto que talvez mereça sua própria ADR quando implementada, separada desta.

## Componentes Afetados

- [x] Controllers (13 com `RolesGuard`; 5 sem escopo) · [x] Services (autorização de
  ownership) · [ ] Repositories · [ ] Prisma · [ ] Redis · [ ] Bull · [ ] Storage · [ ] Docker
- [ ] Nginx · [ ] WebSocket · [ ] Banco · [x] Outros: `roles.decorator.ts`, `Role` enum do Prisma

## Relação com Governança

- **ACR:** não tratou este tema diretamente
- **ABR:** §2 (Inventário de Controllers/Guards)
- **AGR:** §3 (Governança de Autorização — Authorization Flow Diagram completo)
- **AER (Constituição):** AER-001, AER-002, AER-003, AER-004
- **ASNF (Manual):** ASNF-016, ASNF-017, ASNF-042, ASNF-043
- **ATM:** Parte II (Matriz de Requisitos — P-1/P-2), Parte VI (Segurança), Parte VII
  (Roadmap — linha B-40)
- **Roadmap:** **B-40** (pergunta 2, pendente)

## Evidências

- **Arquivos/Classes/Métodos:** `roles.guard.ts:7-42`, `roles.decorator.ts`,
  `conversation.controller.ts:24` (exemplo de controller sem escopo)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** `roles.guard.spec.ts` (100% cobertura da Pergunta 1); **NÃO ENCONTRADO** teste da
  Pergunta 2 (funcionalidade não existe)
- **Pipelines:** `api-ci.yml`

## Critérios de Validação

Pergunta 1: `roles.guard.spec.ts` continua em 100% de cobertura de statement/branch a cada PR
que toque o guard. Pergunta 2 (quando implementada): teste de controller confirma que `AGENT`
do departamento X recebe 404 ao pedir conversa do departamento Y (critério de aceite já descrito
no próprio item B-40 do roadmap).

## Critérios de Revisão

Pergunta 1: revisar se um caso de produto real exigir permission não-hierárquica. Pergunta 2:
esta ADR muda de "Proposta" para "Aprovada"/"Implementada" no momento em que **B-40** for
trabalhado — não antes.

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação — formaliza o modelo de Role (implementado) e propõe a direção para o escopo (B-40, pendente) | 1.0 |

## Referências

- `docs/04-Arquitetura/ABR_2026-08-05_baseline.md` §2
- `docs/04-Arquitetura/AGR_2026-08-05_governance.md` §3
- `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` (AER-001..004)
- `ROADMAP_ESTABILIZACAO.md` (item B-40)
