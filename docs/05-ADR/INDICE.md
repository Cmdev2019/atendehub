# Índice de ADRs

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

## ADRs previstas

Decisões já tomadas na prática que ainda precisam ser formalizadas, ou decisões futuras identificadas no
plano de evolução. **Numeração renumerada em 2026-08-01** — os números originais (0002-0011) colidiam
com as ADRs reais escritas nesta ACR; esta tabela nunca reservou slots, era só uma lista de tópicos:

| Decisão a formalizar | Prazo |
|---|---|
| Manter Modular Monolith; critérios objetivos para extrair um serviço | v1.0 |
| RLS como camada obrigatória de isolamento multi-tenant (relacionado a B-41) | v1.0 |
| Storage privado: URL assinada vs. proxy autenticado (decisão já tomada em B-38 — formalizar como ADR) | v1.0 |
| Migração incremental do frontend por rota (não big-bang) | v1.1 |
| `IChannelAdapter` como contrato de canal | v2.0 |
| Identidade de contato desacoplada de telefone | v2.0 |
| Bull → BullMQ | v2.0 |
| Motor de fluxo próprio vs. Typebot embarcado | v2.5 |
| Abstração de LLM provider-agnostic | v3.0 |
| Estratégia de multi-região e residência de dados | v4.0 |

Ao formalizar qualquer uma destas, numerar sequencialmente a partir do maior número já usado (0009 em
diante) no momento em que for escrita — não reservar número com antecedência.

## Decisões históricas ainda não convertidas em ADR

Registradas em `ROADMAP_ESTABILIZACAO.md` na seção "Registro de decisões". Devem ser convertidas:

- **B-19** — manter tokens em `localStorage` (2026-07-25). ⚠️ A premissa desta decisão deve ser
  reavaliada após a implantação de CSP (item B-43).
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
