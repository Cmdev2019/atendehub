# ADR-0015 — Imagem Docker multi-stage sobre `node:20-bookworm-slim`; hardening de runtime pendente (B-44)

- **Status:** Implementada (build multi-stage) · Proposta (hardening de runtime — usuário
  não-root, healthcheck, `tini`, shutdown gracioso)
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `apps/api/Dockerfile`, `docker-compose.prod.yml`

> Ciclo de vida conforme `README.md` desta pasta.

## Contexto

A imagem de produção da API é construída em 2 estágios (`build`/`runtime`,
`apps/api/Dockerfile:1-39`) sobre `node:20-bookworm-slim` (glibc), com o comentário já presente
no próprio arquivo explicando a escolha: "bcrypt/prisma usam binários nativos pré-compilados pra
glibc; alpine (musl) exigiria toolchain de compilação". A imagem final não declara `USER`
(roda como root), não tem `HEALTHCHECK`, não usa `tini`/`dumb-init` como entrypoint, e
`main.ts` não chama `app.enableShutdownHooks()` — confirmado por leitura integral do Dockerfile
e do `main.ts` nas revisões anteriores (ABR §9, AGR §10).

## Problema

Duas perguntas: (1) a base da imagem (`node:20-bookworm-slim`, multi-stage) está correta? (2) o
runtime deveria ter usuário não-root, healthcheck e shutdown gracioso?

## Alternativas Consideradas — Pergunta 1 (base da imagem)

### Alternativa A — `node:20-bookworm-slim` (glibc), multi-stage — **já implementado**
- **Prós:** compatibilidade direta com binários nativos pré-compilados do `bcrypt`/Prisma
  Engine, sem precisar instalar toolchain de compilação C++ na imagem; multi-stage mantém a
  imagem final sem as dependências de build.
- **Contras:** imagem maior que Alpine (glibc é maior que musl).
- **Complexidade:** baixa (já implementado).
- **Risco:** baixo — é a escolha padrão de mercado para projetos Node com dependência nativa.
- **Impacto:** todo o processo de build/deploy.
- **Custo estimado:** baixo.

### Alternativa B — `node:20-alpine` (musl)
- **Prós:** imagem menor.
- **Contras:** exigiria instalar toolchain de compilação (`python3`, `make`, `g++`) para
  recompilar `bcrypt`/Prisma Engine a partir do código-fonte, ou usar binários específicos para
  musl (nem sempre disponíveis/atualizados na mesma velocidade dos glibc) — custo de manutenção
  maior para o ganho de tamanho de imagem.
- **Complexidade:** média (troubleshooting de binário nativo é uma classe de problema recorrente
  com Alpine + Node).
- **Risco:** médio — falha de build por incompatibilidade de binário é um risco concreto e
  documentado na comunidade Node/Prisma.
- **Impacto:** mesmo escopo.
- **Custo estimado:** médio, sem benefício de segurança (o ganho seria só tamanho).

## Decisão Tomada — Pergunta 1

**Alternativa A**, mantida — já implementada, com o racional preservado no próprio comentário do
Dockerfile.

## Alternativas Consideradas — Pergunta 2 (hardening de runtime)

### Alternativa A — `USER node` + `HEALTHCHECK` + `tini` + `enableShutdownHooks()`
- **Prós:** processo roda com menor privilégio (não-root); orquestrador sabe distinguir
  container vivo de container pronto; sinais do SO encaminhados corretamente (PID 1 não é o
  processo Node direto); shutdown drena job em andamento antes de sair.
- **Contras:** exige ajustar ownership de arquivo na imagem (`COPY --chown=node:node` ou
  equivalente) e testar que a aplicação continua funcionando sem privilégio de root (ex.:
  binding de porta <1024 exigiria capability extra, mas a API já usa a porta 3001, sem esse
  problema).
- **Complexidade:** baixa-média.
- **Risco:** baixo — é o padrão de mercado documentado (`hadolint` já sinaliza a ausência de
  `USER` como regra própria, DL3002).
- **Impacto:** `Dockerfile`, `docker-compose.prod.yml` (healthcheck do serviço `api`), `main.ts`
  (shutdown hooks).
- **Custo estimado:** baixo.

### Alternativa B — Não fazer nada (manter root, sem healthcheck)
- **Custo de manter como está:** superfície de ataque maior se o processo for comprometido
  (privilégio de root dentro do container); orquestrador não distingue container travado de
  saudável; deploy/reinício mata job em andamento sem aviso.

## Decisão Tomada — Pergunta 2

**Ainda não aprovada.** A direção proposta (Alternativa A) é a mesma já detalhada em **AER-010,
AER-011, AER-012** da Constituição — esta ADR não reabre essa análise, só formaliza que a
decisão pertence à implementação de **B-44**, ainda não iniciada.

## Justificativa Técnica

Para a Pergunta 1: o custo de recompilar/gerenciar binário nativo para musl (Alternativa B) supera
o ganho de tamanho de imagem, para um serviço que não está otimizando por tamanho de imagem como
prioridade hoje. Para a Pergunta 2: o hardening de runtime é puro ganho de postura de segurança
sem trade-off técnico relevante identificado — a única razão de ainda não estar implementado é
priorização de roadmap (B-44 na fila), não uma objeção técnica.

## Trade-offs

- **Pergunta 1 — o que foi ganho:** compatibilidade sem fricção com dependência nativa. **O que
  foi perdido:** tamanho de imagem.
- **Pergunta 2 — dívida técnica:** superfície de ataque de container root, ausência de
  healthcheck (deploy não sabe esperar o processo ficar pronto), sem shutdown gracioso (perda de
  requisição/job em reinício) — tudo já catalogado como **B-44**.

## Consequências

### Positivas
- Build multi-stage já mantém a imagem final livre de ferramentas de build.
- Escolha de base documentada no próprio Dockerfile evita que uma migração futura para Alpine
  seja tentada sem entender por que foi evitada.

### Negativas
- Container roda como root até B-44.
- Sem healthcheck, `docker-compose.prod.yml` não usa `condition: service_healthy` para o
  serviço `api` — Nginx pode rotear tráfego para uma API ainda não pronta.

### Neutras / a observar
- `docker-compose.prod.yml` já usa `condition: service_healthy` corretamente para `postgres`/
  `redis` — o padrão a seguir para `api` já existe no próprio arquivo, só falta aplicar.

## Componentes Afetados

- [ ] Controllers · [ ] Services · [ ] Repositories · [ ] Prisma · [ ] Redis · [ ] Bull
- [ ] Storage · [x] Docker · [ ] Nginx · [ ] WebSocket · [ ] Banco
- [x] Outros: `main.ts` (shutdown hooks, quando implementado)

## Relação com Governança

- **ACR:** não tratou este tema
- **ABR:** §9 (Segurança), citando o Dockerfile
- **AGR:** §10 (Governança Operacional — tabela completa de gaps)
- **AER (Constituição):** AER-010, AER-011, AER-012
- **ASNF (Manual):** ASNF-085..092
- **ATM:** Parte VII (Roadmap, linha B-44), Parte XI (Riscos)
- **Roadmap:** **B-44**

## Evidências

- **Arquivos/Classes/Métodos:** `apps/api/Dockerfile:1-39`, `docker-compose.prod.yml:51-70`
  (serviço `api`, sem `healthcheck:`)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** NÃO ENCONTRADO teste automatizado de container
- **Pipelines:** NÃO ENCONTRADO — nenhum step de build/scan de imagem em `api-ci.yml`

## Critérios de Validação

Pergunta 2, quando implementada: `docker exec atendehub_api whoami` retorna `node` (não `root`);
`docker inspect atendehub_api` mostra `Health.Status: healthy` após o boot; `SIGTERM` encerra a
API sem interromper job em processamento (teste manual documentado, similar ao que valida
concorrência em B-48/B-49).

## Critérios de Revisão

Revisar obrigatoriamente ao implementar **B-44**. Revisar a escolha de base (Pergunta 1) só se
o tamanho de imagem se tornar um problema operacional medido (tempo de deploy, custo de
armazenamento de registry).

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação — formaliza a base já implementada e propõe a direção do hardening pendente | 1.0 |

## Referências

- `docs/04-Arquitetura/AGR_2026-08-05_governance.md` §10
- `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` (AER-010..012)
- `ROADMAP_ESTABILIZACAO.md` (item B-44)
