# Como escrever um teste de concorrência real (não mockado)

> Guia de implementação. Decisão arquitetural correspondente: [ADR-0004](../../05-ADR/ADR-0004-estrategia-de-concorrencia-e-seus-testes.md).

## Quando este guia se aplica

Sempre que uma correção depender de uma constraint do PostgreSQL (`UNIQUE`, índice parcial) pra garantir
atomicidade sob concorrência — um teste unitário com Prisma mockado prova a *lógica de decisão*, nunca a
*garantia de banco*. Os dois são necessários.

## Receita (usada em B-48 e B-49)

1. **Infra real, não mock.** `docker compose up -d postgres` (ou `redis`, se a fila entrar no teste).
   Conectar com `new PrismaClient()` real, nunca um client injetado por teste unitário.
2. **Fixtures descartáveis.** Criar `Company`/`Contact`/`Conversation` (ou o que for necessário) com um
   `slug`/`phone` com timestamp (`Date.now()`) pra nunca colidir entre execuções. Sempre limpar no
   `finally` (cascade delete a partir da `Company` costuma bastar — ver `onDelete: Cascade` no schema).
3. **`Promise.all`, nunca `for` sequencial.** É a diferença entre provar concorrência de verdade e provar
   só que o retry funciona em sequência (coisas diferentes — ver ADR-0002, a corrida exige execução
   *simultânea*, não múltiplas tentativas em série).
4. **Rodar em progressão de carga.** 2, 5, 10, 50, 100 chamadas concorrentes pro mesmo recurso — a
   progressão importa: se só 100 falhar, é sinal de esgotamento de pool de conexão, não de falha da
   constraint (diagnóstico diferente).
5. **Medir o que realmente prova ausência de duplicata:**
   - Contagem de linhas no banco pro recurso em questão (`count()` direto, não confiar só no retorno das
     `Promise`s).
   - Contagem de `isNew: true` — deve ser exatamente 1.
   - **IDs distintos devolvidos por todos os chamadores** (`new Set(resultados.map(r => r.id)).size`) —
     evidência mais forte que só "existe 1 linha": prova que todo mundo, inclusive quem perdeu a corrida,
     converge pro mesmo registro (não só que o banco não duplicou).
   - Zero `Promise` rejeitada — qualquer exceção não tratada durante a corrida é, ela mesma, um bug.
6. **Reportar tempo total por rodada** — não é um teste de performance, mas um salto de ordem de grandeza
   entre rodadas (ex.: 30ms → 3000ms de 50 pra 100 workers) é sinal de algo errado mesmo sem falhar
   nenhuma asserção.

## Exemplo real no repositório

- `apps/api/scripts/validate-b48-concurrency.ts` (Message/externalId — unique de coluna inteira)
- `apps/api/scripts/validate-b49-concurrency.ts` (Conversation/contactId — índice parcial)

Ambos seguem exatamente os 6 passos acima. Reusar a estrutura pra qualquer 3º caso de idempotência.

## O que este tipo de teste NÃO substitui

- Teste unitário da lógica de decisão (`P2002` → recupera; outro erro → propaga) — mais rápido, roda a
  cada PR, não precisa de Postgres de pé.
- Teste de carga formal (k6/Artillery) se o objetivo for medir throughput/latência sob tráfego realista,
  não só provar ausência de duplicata.

## Estado atual

Executado manualmente a cada PRR de B-48/B-49 (2026-08-01), com evidência registrada em
`B48_AUDITORIA_POS_HARDENING.pdf`/`B49_AUDITORIA_POS_HARDENING.pdf` (raiz do repo). Não roda
automaticamente no CI (ver ADR-0004, critério de reavaliação).

---

> Estratégia geral de qualidade em [`../../22-QA/README.md`](../../22-QA/README.md).
