# ADR-0004 — Concorrência: garantia no banco, validação com carga real

- **Status:** Aceita
- **Data:** 2026-08-01
- **Decisores:** Engenharia (correções B-48/B-49 + ACR)
- **Contexto técnico:** `apps/api/scripts/validate-b48-concurrency.ts`, `apps/api/scripts/validate-b49-concurrency.ts`, suítes unitárias de `MessageService`/`ConversationService`

## Contexto

Um teste unitário com Prisma mockado prova que o CÓDIGO reage certo a um erro `P2002` simulado — não prova que a CONSTRAINT existe de verdade no banco, nem que ela realmente impede duplicidade sob concorrência genuína (múltiplas conexões, múltiplas transações simultâneas). As duas coisas são necessárias e nenhuma substitui a outra.

## Alternativas consideradas

### Alternativa A — Só testes unitários com Prisma mockado
- **Prós:** rápido, sem dependência de infraestrutura, roda em qualquer CI sem serviço externo.
- **Contras:** não prova nada sobre o banco real. Um `@@unique` removido acidentalmente do schema, ou uma migration não aplicada, passaria despercebido — o mock nunca vai "colidir de verdade".
- **Custo estimado:** baixo, mas cobertura incompleta pro que a ADR-0002 realmente promete.

### Alternativa B — Só teste de carga formal (k6, Artillery) num ambiente de staging
- **Prós:** mais realista ainda (rede, várias réplicas de verdade).
- **Contras:** infraestrutura pesada para validar uma garantia que é, na prática, local ao banco — não precisa de um ambiente de staging completo pra provar que 100 `INSERT`s concorrentes por uma constraint única resultam em 1 linha.
- **Custo estimado:** alto, desproporcional ao que está sendo validado.

### Alternativa C — Script de validação com `Promise.all` contra Postgres real (docker compose), fora do CI, evidência coletada manualmente
- **Prós:** prova a garantia no nível certo — concorrência de verdade (múltiplas transações simultâneas no mesmo Postgres), sem a sobrecarga de um ambiente de carga formal. Reaproveita a mesma infraestrutura de dev (`docker compose up -d postgres`). Gera evidência literal (contagem de linhas, `conversationId`s distintos devolvidos) citável em relatório/auditoria.
- **Contras:** não roda automaticamente no CI hoje (depende de Postgres real de pé) — é rodado manualmente em cada auditoria/PRR, não a cada PR.
- **Custo estimado:** baixo — script standalone, sem framework de teste, ~100 linhas.

## Decisão

**Alternativa A + C combinadas**, nunca A sozinha: suíte unitária (mock) para a lógica de decisão (`P2002` → recupera; outro erro → propaga), + script de validação real (`validate-b48-concurrency.ts`, `validate-b49-concurrency.ts`) para a garantia de banco, rodado manualmente a cada mudança relevante no schema/constraint e documentado com evidência literal no roadmap/PDF de auditoria.

B foi descartada por desproporção de custo/infraestrutura para o que precisa ser provado.

## Consequências

### Positivas
- Cobertura em 2 camadas: lógica (rápida, todo PR) + garantia de banco (sob demanda, com evidência).
- Os scripts de validação são reutilizáveis — rodados de novo em cada PRR (B-48/B-49) sem reescrever nada, sempre com números frescos.

### Negativas
- A camada de banco não é verificada automaticamente a cada PR — depende de disciplina humana/PRR para rodar de novo após uma mudança de schema. Não há hoje um "gate" de CI que rode os scripts de concorrência.

### Neutras / a observar
- `docs/23-Testes/` é o lugar correto para o guia de "como escrever um teste de concorrência real" (ver `docs/23-Testes/Stress/concorrencia-real.md`, criado nesta ACR).

## Critérios de reavaliação

Se o projeto ganhar um ambiente de CI com Postgres de serviço (já existe parcialmente — `api-ci.yml` roda testes unitários; não roda os scripts de `validate-*-concurrency.ts`), avaliar promovê-los a um step do CI, ao menos numa branch de release.

## Referências

- ADR-0002. `B48_AUDITORIA_POS_HARDENING.pdf`, `B49_AUDITORIA_POS_HARDENING.pdf`.
