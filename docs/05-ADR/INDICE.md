# Índice de ADRs

| # | Título | Status | Data | Supera | Superada por |
|---|---|---|---|---|---|
| [0001](ADR-0001-estrutura-do-repositorio.md) | Estrutura de monorepo com documentação numerada | ✅ Aceita | 2026-07-28 | — | — |

## ADRs previstas

Decisões já tomadas na prática que ainda precisam ser formalizadas, ou decisões futuras identificadas no
plano de evolução:

| # previsto | Decisão a formalizar | Prazo |
|---|---|---|
| 0002 | Manter Modular Monolith; critérios objetivos para extrair um serviço | v1.0 |
| 0003 | RLS como camada obrigatória de isolamento multi-tenant | v1.0 |
| 0004 | Storage privado: URL assinada vs. proxy autenticado | v1.0 |
| 0005 | Migração incremental do frontend por rota (não big-bang) | v1.1 |
| 0006 | `IChannelAdapter` como contrato de canal | v2.0 |
| 0007 | Identidade de contato desacoplada de telefone | v2.0 |
| 0008 | Bull → BullMQ | v2.0 |
| 0009 | Motor de fluxo próprio vs. Typebot embarcado | v2.5 |
| 0010 | Abstração de LLM provider-agnostic | v3.0 |
| 0011 | Estratégia de multi-região e residência de dados | v4.0 |

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
