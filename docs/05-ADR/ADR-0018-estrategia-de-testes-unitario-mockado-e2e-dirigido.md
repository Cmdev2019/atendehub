# ADR-0018 — Estratégia de testes: unitário mockado como base, e2e dirigido a fluxo crítico, sem gate de cobertura no CI

- **Status:** Implementada (o que existe) — gate de cobertura sob Proposta
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `apps/api/src/**/*.spec.ts`, `apps/api/test/*.e2e-spec.ts`,
  `.github/workflows/api-ci.yml`

> Ciclo de vida conforme `README.md` desta pasta.

## Contexto

O backend tem 40 arquivos de spec (367 testes, medição ao vivo via `npx jest --coverage` nesta
sessão), todos unitários com dependência externa mockada (Prisma via injeção de mock, `ioredis`
via `jest.mock('ioredis', ...)`, HTTP externo da Evolution mockado). Só 2 arquivos e2e
(`sla.e2e-spec.ts`, `storage.e2e-spec.ts`), batendo em infraestrutura real (Postgres/MinIO).
Cobertura agregada medida: 50,28% de statements — mas **19 controllers, dos quais só 3 têm
`*.controller.spec.ts` próprio** (`health`, `auto-attendance`, `webhook`); os demais 16 estão em
0% de cobertura de statement/function na camada de controller. `api-ci.yml` roda `npm test` sem
`--coverage` — a métrica nunca é medida nem reportada em CI, só quando alguém a roda manualmente
(como nesta sessão).

## Problema

Três perguntas: (1) testes unitários mockados como base é a estratégia certa? (2) o e2e deveria
ser mais amplo do que os 2 fluxos que tem hoje? (3) deveria haver um piso mínimo de cobertura
que bloqueia merge?

## Alternativas Consideradas — Pergunta 1 (base de teste)

### Alternativa A — Unitário com mock, como hoje
- **Prós:** rápido (367 testes em ~64s, medido nesta sessão), determinístico, não exige
  infraestrutura real rodando para a maioria da suíte.
- **Contras:** não pega problema de integração real (ex.: query Prisma malformada só falharia
  contra um banco real) — mitigado parcialmente pelos 2 e2e existentes e pelos scripts de
  validação de concorrência (`validate-b48/b49-concurrency.ts`, que batem em Postgres real fora
  da suíte padrão).
- **Complexidade:** baixa.
- **Custo estimado:** baixo, já pago.

### Alternativa B — Integração ampla contra banco/Redis reais em todo teste
- **Prós:** pega mais classe de bug real.
- **Contras:** suíte lenta, exige infraestrutura provisionada em CI para todo PR, mais frágil
  (testes podem falhar por estado de banco compartilhado entre execuções paralelas).
- **Complexidade:** alta.
- **Custo estimado:** alto, sem necessidade comprovada além dos 2 e2e já existentes.

## Decisão Tomada — Pergunta 1

**Alternativa A**, mantida — unitário mockado como base, com e2e reservado a fluxos que
justificam o custo de infraestrutura real (Pergunta 2).

## Alternativas Consideradas — Pergunta 2 (escopo do e2e)

### Alternativa A — E2E só para os fluxos de maior risco de concorrência/integração real (SLA, Storage) — **já implementado**
- **Prós:** cobre exatamente os 2 pontos onde mock não seria suficiente para dar confiança (SLA
  depende de tempo real de fila+Postgres; Storage depende do comportamento real do MinIO
  — presign, bucket policy).
- **Contras:** login→conversa→envio→recebimento (o fluxo central do produto, citado no `CLAUDE.md`
  como a Fase 0 do roadmap) não tem e2e dedicado — achado já registrado na ABR §10.5.
- **Complexidade:** baixa (mantido).
- **Custo estimado:** baixo, mas com gap de cobertura de fluxo crítico.

### Alternativa B — Ampliar e2e para cobrir o fluxo central completo
- **Prós:** fecha o gap identificado na ABR §10.5.
- **Contras:** nenhum — é extensão natural do padrão já usado (não é uma alternativa
  conflitante, é a mesma direção, mais abrangente).
- **Complexidade:** baixa-média.
- **Custo estimado:** baixo.

## Decisão Tomada — Pergunta 2

Direção proposta: ampliar (Alternativa B), sem status de aprovação formal ainda — depende de
priorização, não de objeção técnica.

## Alternativas Consideradas — Pergunta 3 (gate de cobertura)

### Alternativa A — `jest --coverage` com `coverageThreshold` bloqueando merge abaixo de um piso
- **Prós:** torna a cobertura uma métrica que não pode regredir silenciosamente — hoje ela
  existe (50,28%) mas ninguém saberia se caísse para 40% sem rodar manualmente.
- **Contras:** piso mal calibrado pode bloquear PR legítimo; precisa ser calibrado por camada
  (controller vs. service), não só agregado — um piso agregado de 50% esconderia que
  controllers estão em 0%.
- **Complexidade:** baixa (mudança de configuração, não de código de produto).
- **Custo estimado:** baixo.

### Alternativa B — Manter sem gate (medir só manualmente, como hoje)
- **Custo de manter como está:** cobertura pode regredir sem ninguém notar até uma auditoria
  manual (como esta sessão) medir de novo.

## Decisão Tomada — Pergunta 3

**Ainda não aprovada.** Direção proposta: Alternativa A, com piso calibrado por glob
(`coverageThreshold` por caminho, não só agregado) — já detalhada em **AER-022/ASNF-103**.

## Justificativa Técnica

Para a Pergunta 1: o custo de integração ampla (Alternativa B) não se justifica quando os pontos
de maior risco real (concorrência, storage) já têm e2e dedicado e scripts de validação próprios
(B-48/B-49) — mock cobre o resto com velocidade e determinismo. Para a Pergunta 3: sem gate, a
métrica medida nesta sessão (50,28%) é um retrato de um instante, não uma garantia — o mesmo
princípio de observabilidade (P-7 da Constituição) aplicado a teste: "funcionou e ninguém sabe"
vale tanto para defesa em produção quanto para cobertura de teste em CI.

## Trade-offs

- **O que foi ganho:** suíte rápida e determinística; e2e dirigido ao que realmente precisa de
  infraestrutura real.
- **O que foi perdido:** nenhuma garantia de que a cobertura de hoje se mantém amanhã (sem
  gate); fluxo central do produto sem e2e dedicado.
- **Dívida técnica:** 16 de 19 controllers em 0% de cobertura — é a lacuna mais concreta e mais
  citada em toda esta cadeia de revisões (ABR §10.1, AGR, AER-020, ASNF-101), e é justamente a
  camada onde a autorização de B-40 é decidida — sem teste de controller, uma correção de B-40
  não tem rede de regressão.

## Consequências

### Positivas
- Suíte de 367 testes roda em ~64s — feedback rápido em todo PR.
- Os 2 e2e existentes cobrem exatamente os pontos de maior risco de concorrência (validados com
  2-100 workers reais em B-48/B-49, embora os scripts de concorrência em si não rodem via e2e
  nem via CI — ver ADR relacionadas).

### Negativas
- 16 controllers sem teste próprio — nenhuma prova automatizada de que a cadeia de guards
  aplicada em cada rota é a esperada.
- Cobertura não medida em CI — regressão silenciosa é possível.

### Neutras / a observar
- `company.service.ts`, `department.service.ts`, `note.service.ts` também em 0% — não é só
  problema de controller, alguns services inteiros não têm spec.

## Componentes Afetados

- [x] Controllers (16 de 19 sem spec) · [x] Services (3 sem spec) · [ ] Repositories
- [ ] Prisma · [ ] Redis · [ ] Bull · [ ] Storage · [ ] Docker · [ ] Nginx · [ ] WebSocket
- [ ] Banco · [x] Outros: `api-ci.yml` (gate de cobertura, quando implementado)

## Relação com Governança

- **ACR:** não tratou este tema
- **ABR:** §10 (Cobertura de Testes — medição real completa)
- **AGR:** §10.1, achado sobre 15/18 (corrigido para 16/19 pela ATM)
- **AER (Constituição):** AER-020, AER-021, AER-022
- **ASNF (Manual):** ASNF-100..109
- **ATM:** Parte VIII (Matriz de Testes), Parte XIV (Dashboard — % cobertura)
- **Roadmap:** sem ID formal — sugestão C da AGR §16 ("cobertura de controller como
  pré-requisito de B-40")

## Evidências

- **Arquivos/Classes/Métodos:** saída de `npx jest --coverage` executada ao vivo na sessão da
  ABR (40 suites, 367 testes, 50,28% statements)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** os próprios 40 arquivos de spec
- **Pipelines:** `api-ci.yml` (roda `npm test`, sem `--coverage`)

## Critérios de Validação

Quando o gate de cobertura for implementado: `api-ci.yml` falha se `coverageThreshold` por glob
não for atingido; cobertura de controller sobe de 3/19 para pelo menos os 5 controllers do B-40
com teste do caminho negativo de autorização.

## Critérios de Revisão

Revisar obrigatoriamente **antes ou junto de B-40** — a correção de escopo por departamento
precisa de teste de controller que prove que a regressão não volta, e hoje esse teste não
existiria para provar nada.

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação | 1.0 |

## Referências

- `docs/04-Arquitetura/ABR_2026-08-05_baseline.md` §10
- `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` (AER-020..022)
- `docs/05-ADR/ADR-0004-estrategia-de-concorrencia-e-seus-testes.md` (mesmo domínio, escopo
  diferente — concorrência específica, não estratégia geral de teste)
