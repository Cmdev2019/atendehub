# ADR-0010 — Row-Level Security como rede de isolamento multi-tenant (proposta, relacionada a B-41)

- **Status:** Proposta
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia (formalização do item v1.0 já listado em `INDICE.md` desde 2026-08-01)
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board (decisão ainda não aprovada — ver Status)
- **Contexto técnico:** `infra/postgres/init.sql`, `apps/api/src/shared/prisma/prisma.service.ts`,
  as 14 tabelas do schema com `companyId`

> Ciclo de vida conforme `README.md` desta pasta. **Esta ADR está em Proposta, não Aprovada** —
> documenta a direção já apontada por 3 revisões anteriores (ABR, AGR, AER), não uma decisão
> tomada e implementada. Marcada assim deliberadamente, por regra desta série de revisões
> ("nunca criar decisões fictícias").

## Contexto

O isolamento entre empresas hoje é **inteiramente responsabilidade da camada de aplicação**:
cada método de `Service` que lê ou muta dado com `companyId` precisa lembrar de incluir esse
filtro no `where` da consulta Prisma — não há nada no banco que impeça uma consulta que esqueça
o filtro de devolver dado de outra empresa. `infra/postgres/init.sql:20-23` já cria a função
`current_company_id()` com o comentário "Usada pelas políticas de RLS em produção" — mas
nenhuma tabela tem `ENABLE ROW LEVEL SECURITY`, nenhuma `CREATE POLICY` existe
(confirmado por leitura integral do arquivo, ABR §4.2), e a função nunca é chamada por nenhum
código da aplicação. A intenção de usar RLS já existia no schema desde antes desta cadeia de
revisões — só nunca foi implementada.

Auditoria de código (ABR §4.3) encontrou 3 pontos concretos onde o filtro de `companyId` já
falta hoje: `message.service.ts:261`, `webhook.service.ts:365`, `whatsapp.service.ts:289` — a
ausência de rede de segurança não é hipotética, já haveria efeito real se um `externalId`/
`sessionName` colidisse entre duas empresas.

## Problema

O isolamento de tenant deve continuar dependendo só de disciplina de código em cada consulta,
ou deve existir uma camada no banco que rejeite/filtre automaticamente uma consulta sem
`companyId`, mesmo que a aplicação erre?

## Alternativas Consideradas

### Alternativa A — RLS nativo do PostgreSQL (`ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`)
- **Prós:** rede de segurança no nível mais baixo possível — mesmo um bug na aplicação, uma
  migration mal escrita, ou uma query administrativa ad hoc não vaza dado entre empresas,
  porque o próprio Postgres filtra. Reaproveita a função `current_company_id()` já criada.
- **Contras:** exige que toda transação faça `SET LOCAL app.current_company_id` antes de
  qualquer query — via extensão do Prisma (`$extends` em `query.$allOperations`), que precisa
  ser escrita (não existe hoje). Precisa de um bypass explícito e auditado para jobs de sistema
  (ex.: `webhook.processor.ts` resolvendo o tenant a partir de `sessionName`, antes de saber o
  `companyId`).
- **Complexidade:** média (a política em si é simples; a integração com Prisma via `$extends` é
  a parte não trivial).
- **Risco:** baixo de regressão funcional se bem testado; alto se implementado sem suíte de
  teste que force uma leitura cross-tenant e confirme 0 linhas.
- **Impacto:** as 14 tabelas com `companyId` + o `PrismaService`.
- **Custo estimado:** médio.

### Alternativa B — Middleware/Extension do Prisma sem RLS no banco (validação só na camada ORM)
- **Prós:** não exige `SET LOCAL` por transação nem bypass para jobs de sistema; mais simples de
  implementar isoladamente.
- **Contras:** continua sendo só a aplicação se protegendo de si mesma — uma query
  `$queryRaw`/administrativa feita fora do Prisma (ex.: acesso direto ao Postgres por um DBA,
  ferramenta de BI, script de manutenção) não é coberta. Não é uma "rede de segurança" no
  sentido em que a Constituição (P-4) define — é a mesma camada de hoje, só centralizada.
- **Complexidade:** baixa.
- **Risco:** médio — resolve o caso comum, não o caso de acesso fora da aplicação.
- **Impacto:** só `PrismaService`.
- **Custo estimado:** baixo.

### Alternativa C — Não fazer nada (manter isolamento 100% manual)
- **Custo de manter como está:** os 3 pontos sem filtro já catalogados continuam sem rede de
  segurança; qualquer novo ponto futuro tem o mesmo risco, sem nada que o pegue automaticamente
  além de code review.

## Decisão Tomada

**Ainda não aprovada.** A direção proposta por ABR/AGR/AER (e mantida aqui) é a **Alternativa
A** combinada com a Alternativa B — RLS no banco como a rede de segurança de última linha, mais
a extensão do Prisma como o mecanismo prático que faz a aplicação cooperar com ela
(`SET LOCAL app.current_company_id` a cada transação). A Alternativa B sozinha foi descartada
como solução final porque não cobre acesso fora da aplicação — mas a extensão do Prisma que ela
descreve é, de qualquer forma, um componente necessário da Alternativa A completa, não uma
alternativa mutuamente exclusiva.

## Justificativa Técnica

O princípio P-4 da Constituição ("Multi-tenancy como Requisito Estrutural, não Convenção de
Código") exige que o isolamento não dependa só de um desenvolvedor lembrar — RLS é o único
mecanismo entre as alternativas avaliadas que continua protegendo mesmo se a consulta vier de
fora da aplicação (migration manual, ferramenta de terceiro, acesso direto ao banco).

## Trade-offs

- **O que se ganha, quando implementada:** proteção contra a classe inteira de bug "esqueci o
  `companyId`" — os 3 pontos já catalogados (ABR §4.3) deixariam de ser exploráveis mesmo sem
  correção individual de cada um (defesa em profundidade real, não só correção pontual).
- **O que se perde:** complexidade operacional — toda transação precisa setar o contexto de
  sessão; testes de integração precisam simular isso; debugging de uma query que "não retorna
  nada" ganha mais uma causa possível a descartar (contexto de RLS não setado).
- **Dívida técnica enquanto não implementada:** os 3 pontos sem filtro (`message.service.ts:261`,
  `webhook.service.ts:365`, `whatsapp.service.ts:289`) continuam expostos — item **B-41** do
  roadmap.

## Consequências

### Positivas (projetadas, não realizadas)
- Rede de segurança que sobrevive a erro de aplicação.
- Fecha a lacuna dos 3 pontos catalogados sem depender de corrigir cada um individualmente
  primeiro (embora corrigi-los também continue sendo necessário — RLS não substitui bom código,
  reforça).

### Negativas (projetadas)
- Introduz um novo modo de falha ("contexto de sessão não setado") que precisa de teste
  dedicado.
- `webhook.processor.ts` precisa de bypass explícito e auditado (resolve `companyId` só depois
  de olhar `sessionName` — não tem o contexto antes disso).

### Neutras / a observar
- Nenhuma tabela sem `companyId` (`RefreshToken`, por exemplo) é afetada — RLS só se aplica onde
  a coluna existe.

## Componentes Afetados

- [ ] Controllers · [x] Services (todos que leem/escrevem as 14 tabelas) · [ ] Repositories
- [x] Prisma (extensão nova, não implementada) · [ ] Redis · [ ] Bull · [ ] Storage
- [ ] Docker · [ ] Nginx · [ ] WebSocket · [x] Banco (14 tabelas + `init.sql`) · [ ] Outros

## Relação com Governança

- **ACR:** não tratou este tema diretamente (função `current_company_id()` já existia antes)
- **ABR:** §4.2 (estado real: função existe, política não), §4.3 (3 pontos sem filtro)
- **AGR:** §4 (Tenant Flow Diagram), §4.4 (Tenant Isolation Matrix), §11 (Gap crítico)
- **AER (Constituição):** Princípio P-4, AER-005, AER-006
- **ASNF (Manual):** ASNF-038, ASNF-046, ASNF-049, ASNF-055
- **ATM:** Parte V (Matriz Multi-Tenant), Parte VI (Matriz de Segurança), Parte XI (Riscos)
- **Roadmap:** **B-41**

## Evidências

- **Arquivos:** `infra/postgres/init.sql:20-23` (função já criada, política ausente)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** NÃO ENCONTRADO — nenhum teste de RLS existe porque RLS não existe
- **Pipelines:** NÃO ENCONTRADO

## Critérios de Validação

Quando implementada: (1) `SELECT tablename FROM pg_tables WHERE rowsecurity = false` retorna 0
linhas entre as 14 tabelas com `companyId`; (2) teste de integração que, com o contexto de
sessão da empresa A, tenta ler uma linha da empresa B via SQL direto (não via Prisma) e recebe 0
linhas.

## Critérios de Revisão

Revisar obrigatoriamente ao implementar **B-41** — nesse momento esta ADR muda de "Proposta"
para "Aprovada" e depois "Implementada"/"Validada" conforme os critérios acima forem cumpridos.
Revisar também se um caso de acesso administrativo/BI direto ao Postgres for introduzido antes
disso (aumenta a urgência).

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação — formaliza a direção já apontada por ABR/AGR/AER, status Proposta | 1.0 |

## Referências

- `docs/04-Arquitetura/ABR_2026-08-05_baseline.md` §4.2, §4.3
- `docs/04-Arquitetura/AGR_2026-08-05_governance.md` §4
- `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` (Princípio P-4, AER-005/006)
