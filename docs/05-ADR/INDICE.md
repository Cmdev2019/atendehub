# Índice de ADRs

## Dashboard executivo

Medido por contagem direta desta pasta em 2026-08-05 (não estimado):

| Indicador | Valor |
|---|---|
| Total de ADRs | 18 (0001–0018) |
| ADRs por domínio | Estrutura/repo: 1 · Concorrência/idempotência/erros/observabilidade: 6 · Multi-tenant/autorização: 3 · Infraestrutura (Docker/Nginx/Redis): 3 · Storage: 1 · WebSocket: 1 · Testes: 1 · Segurança/autenticação: 1 · Modular Monolith: 1 |
| Aprovadas/Implementadas (status maduro) | 10 (0001–0009, 0011, 0013–0016, 0018 na parte já implementada de cada uma) |
| Propostas (decisão ainda não tomada) | 2 integralmente (0010 — RLS; e partes específicas de 0012, 0015, 0016, 0017, 0018 — ver status composto de cada uma) |
| Substituídas (Superseded) | 0 |
| Arquivadas | 0 |
| Sem revisão desde a criação | 10 (todas as novas, 0009–0018, criadas e revisadas na mesma data — ainda não passaram por um ciclo de revisão) |
| Vinculadas a item de roadmap (`B-XX`) | 9 de 18 (0009 sem item — decisão estrutural; 0010→B-41; 0011→B-38; 0012→B-40; 0013→B-19/B-43; 0014→B-46; 0015→B-44; 0016→B-43; 0017→sem ID, sugestão AGR; 0018→sem ID, sugestão AGR; 0002–0008→B-38/B-39/B-48/B-49) |
| Com validação automatizada real | 1 (`ADR-0002`/idempotência — via teste tripwire do `ConversationStatus`, mesmo mecanismo citado em `AER-019` da Constituição) — as demais dependem de validação manual documentada |

## ADRs 0001–0008 — formato de status curto (histórico, não migrado retroativamente)

| # | Título | Status | Data | Supera | Superada por |
|---|---|---|---|---|---|
| [0001](ADR-0001-estrutura-do-repositorio.md) | Estrutura de monorepo com documentação numerada | ✅ Aceita | 2026-07-28 | — | — |
| [0002](ADR-0002-estrategia-de-idempotencia.md) | Estratégia de idempotência para dados vindos de fora (webhook/eco) | ✅ Aceita | 2026-08-01 | — | — |
| [0003](ADR-0003-persistencia-atomica.md) | Persistência atômica: sem helper genérico entre domínios | ✅ Aceita | 2026-08-01 | — | — |
| [0004](ADR-0004-estrategia-de-concorrencia-e-seus-testes.md) | Concorrência: garantia no banco, validação com carga real | ✅ Aceita | 2026-08-01 | — | — |
| [0005](ADR-0005-estrategia-de-retry.md) | Retry: política por fila, não global única | ✅ Aceita | 2026-08-01 | — | — |
| [0006](ADR-0006-dead-letter-queue.md) | DLQ apenas na fila de webhook | ✅ Aceita | 2026-08-01 | — | — |
| [0007](ADR-0007-tratamento-de-erros.md) | Três classificadores de erro, um por camada | ✅ Aceita | 2026-08-01 | — | — |
| [0008](ADR-0008-observabilidade.md) | Observabilidade: AsyncLocalStorage no HTTP, threading explícito na fila | ✅ Aceita | 2026-08-01 | — | — |

ADRs 0002 a 0008 escritas na Architecture Consolidation Review de 2026-08-01, formalizando decisões já
implementadas nas correções B-38/B-39/B-48/B-49 (ver `ARQUITETURA_CONSOLIDADA_ATENDEHUB.pdf`, raiz do
repo, para o relatório completo da revisão).

## ADRs 0009–0018 — formato de ciclo de vida estendido (2026-08-05, ver `README.md`)

Escritas na Architecture Decision Records review de 2026-08-05, que sucede ACR → ABR → AGR → AER →
ASNF → ATM. Cada uma referencia a matriz de rastreabilidade
(`MATRIZ-DE-RASTREABILIDADE-ARQUITETURAL.md`) e a Constituição (`CONSTITUICAO-ARQUITETURAL.md`).

| # | Título | Status | Componentes afetados | Docs. relacionados | Revisão prevista |
|---|---|---|---|---|---|
| [0009](ADR-0009-modular-monolith-e-criterios-de-extracao.md) | Modular Monolith; critérios objetivos de extração | Implementada | Todos os 19 módulos | ABR §1/§11, AGR §5 | A cada marco de roadmap com crescimento de time |
| [0010](ADR-0010-row-level-security-como-rede-de-isolamento-multi-tenant.md) | RLS como rede de isolamento multi-tenant | **Proposta** | Prisma, Banco (14 tabelas) | ABR §4.2/§4.3, AGR §4 | Obrigatória ao implementar **B-41** |
| [0011](ADR-0011-storage-privado-com-url-assinada.md) | Storage privado com URL assinada | Validada | Storage, WebSocket | ABR §9, AGR §4.3/§6 | Se volume de mídia justificar proxy autenticado |
| [0012](ADR-0012-modelo-de-autorizacao-rbac-hierarquico.md) | Modelo de autorização: RBAC hierárquico + escopo pendente | Implementada (Role) / **Proposta** (escopo) | Controllers, Services | ABR §2, AGR §3 | Obrigatória ao implementar **B-40** |
| [0013](ADR-0013-tokens-de-autenticacao-em-localstorage.md) | Tokens em `localStorage` | Implementada — premissa sob reavaliação | Controllers (Auth), WebSocket | ABR §9, AGR §6 | Obrigatória ao implementar **B-43** |
| [0014](ADR-0014-clientes-redis-especializados-sem-provider-compartilhado.md) | 5 clientes Redis sem provider compartilhado | Implementada — consolidação sob avaliação | Redis, Bull | ABR §6 | Obrigatória ao implementar **B-46** |
| [0015](ADR-0015-imagem-docker-multi-stage-sem-hardening-de-runtime.md) | Docker multi-stage; hardening de runtime pendente | Implementada (build) / **Proposta** (runtime) | Docker | AGR §10 | Obrigatória ao implementar **B-44** |
| [0016](ADR-0016-nginx-como-borda-sem-hardening-proprio.md) | Nginx como borda única; hardening pendente | Implementada (topologia) / **Proposta** (hardening) | Nginx, WebSocket | AGR §6/§9 | Obrigatória ao implementar **B-43** |
| [0017](ADR-0017-websocket-autenticado-por-handshake-jwt.md) | WebSocket por handshake JWT; paridade de revogação pendente | Implementada (handshake) / **Proposta** (paridade) | WebSocket, Redis | AGR §9.1 | Recomendada, independente de outro item |
| [0018](ADR-0018-estrategia-de-testes-unitario-mockado-e2e-dirigido.md) | Testes: unitário mockado, e2e dirigido, gate pendente | Implementada (o que existe) / **Proposta** (gate) | Todos (via CI) | ABR §10, AGR §10.1 | Antes ou junto de **B-40** |

## ADRs previstas (v1.1 em diante — ainda pendentes)

Itens de v1.0 (Modular Monolith, RLS, Storage) foram formalizados acima como ADR-0009/0010/0011 em
2026-08-05. Restam:

| Decisão a formalizar | Prazo |
|---|---|
| Migração incremental do frontend por rota (não big-bang) | v1.1 |
| `IChannelAdapter` como contrato de canal | v2.0 |
| Identidade de contato desacoplada de telefone | v2.0 |
| Bull → BullMQ | v2.0 |
| Motor de fluxo próprio vs. Typebot embarcado | v2.5 |
| Abstração de LLM provider-agnostic | v3.0 |
| Estratégia de multi-região e residência de dados | v4.0 |

Ao formalizar qualquer uma destas, numerar sequencialmente a partir do maior número já usado (0019 em
diante) no momento em que for escrita — não reservar número com antecedência.

## Decisões históricas ainda não convertidas em ADR

Registradas em `ROADMAP_ESTABILIZACAO.md` na seção "Registro de decisões". **B-19 foi convertida em
`ADR-0013` em 2026-08-05.** Ainda pendentes:

- **B-28** — exclusão de contato vira anonimização, não remoção física (LGPD)
- **B-26** — recuperação de senha no modelo de reset administrativo mínimo
- **B-9** — onboarding de tenant por auto-cadastro público
- **F5-3** — frontend permanece em Vite + React, sem migração para Next.js

## Como escrever uma ADR

1. Copie [`ADR-0000-template.md`](ADR-0000-template.md)
2. Numere sequencialmente a partir do maior número existente
3. Abra PR com status **Proposta**
4. Discussão acontece no PR, não em conversa paralela
5. Ao aprovar, altere o status para **Aceita** e adicione a linha neste índice
6. **Nunca edite uma ADR aceita.** Para mudar de ideia, escreva uma nova que a supera e atualize as
   colunas "Supera" / "Superada por" de ambas
