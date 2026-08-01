# ADR-0003 — Persistência atômica: sem helper genérico entre domínios

- **Status:** Aceita
- **Data:** 2026-08-01
- **Decisores:** Engenharia (Architecture Consolidation Review, 2026-08-01)
- **Contexto técnico:** `apps/api/src/shared/prisma/`, `MessageService`, `ConversationService`

## Contexto

`MessageService#createUnique` (B-48) e o `try/catch(P2002)` inline de `ConversationService#upsertFromWebhook` (B-49) implementam a mesma **forma** de operação — `create()` direto, captura de violação de unicidade, recuperação da linha vencedora — mas com **conteúdo** diferente na recuperação: `Message` recupera com `findUniqueOrThrow({ where: { externalId } })` (unique de coluna inteira, tipado pelo Prisma); `Conversation` recupera com `findFirst({ where: { companyId, contactId, status: { in: [...] } } })` (índice parcial, não representável no tipo `where` de um lookup único do Prisma). Cabe perguntar: vale a pena extrair um `AtomicPersistenceHelper` genérico, cross-model, para as duas (e futuras) chamadas?

## Alternativas consideradas

### Alternativa A — `AtomicPersistenceHelper` genérico, parametrizado por delegate Prisma
Um serviço tipo `createUnique<TDelegate>(delegate, data, select, recover: () => Promise<T>)`, injetável, usado por qualquer domínio.
- **Prós:** um único lugar para qualquer 3º caso futuro.
- **Contras:** o Prisma gerado não expõe uma interface estrutural comum entre delegates de modelos diferentes (`message.create` e `conversation.create` têm tipos de `data`/`select`/retorno próprios, sem supertype útil sem recorrer a `Prisma.TypeMap` e generics avançados). A parte que realmente varia — a consulta de RECUPERAÇÃO — já não é um `where` simples num dos dois casos (índice parcial), então o helper precisaria aceitar um callback de recuperação de qualquer forma, o que reduz o "genérico" a pouco mais que o `try/catch` de 6 linhas que já existe hoje, com uma camada de indireção genérica por cima (generics difíceis de ler) para economizar exatamente essas 6 linhas.
- **Custo estimado:** médio (design de generics) para benefício baixo (2 call sites hoje, recuperação já não-uniforme entre eles).

### Alternativa B — Extrair só o predicado de erro (`isUniqueConstraintViolation`), manter o `try/catch` em cada domínio
- **Prós:** remove a única linha *de fato* duplicada byte-a-byte (`err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'`, repetida em `message.service.ts` e `conversation.service.ts` antes desta ACR); mantém a lógica de recuperação — que é a parte que importa e que diverge — legível e local a cada domínio, sem generics.
- **Contras:** um 3º caso futuro ainda escreve seu próprio `try/catch` (mas reusa o predicado).
- **Custo estimado:** baixo — 1 função pura, sem estado, sem DI.

### Alternativa C — Não fazer nada (manter os dois predicados duplicados)
Duplicação real, mas trivial (2 linhas idênticas) — baixo risco de divergência silenciosa (é um `if`, não uma regra de negócio complexa), mas sem motivo pra manter depois que o custo de extrair é tão baixo.

## Decisão

Escolhida a **Alternativa B**. `isUniqueConstraintViolation(err)` extraída para `apps/api/src/shared/prisma/prisma-errors.util.ts`, consumida por `MessageService` e `ConversationService`. **Não** foi criado um `AtomicPersistenceHelper` genérico — decisão consciente, não omissão: com apenas 2 consumidores reais hoje e uma consulta de recuperação que já diverge estruturalmente entre eles (lookup único vs. índice parcial), a abstração genérica pagaria complexidade de generics por uma economia de poucas linhas, na direção contrária de "não introduzir abstração sem benefício comprovado".

## Consequências

### Positivas
- Zero duplicação do único trecho verdadeiramente idêntico entre os dois domínios.
- Cada domínio mantém sua lógica de recuperação explícita e fácil de ler, sem generics.

### Negativas
- Se um 3º e 4º caso aparecerem com a MESMA forma de recuperação (lookup único simples), a decisão desta ADR deve ser revisitada — nesse ponto o cálculo de custo/benefício muda a favor de um helper genérico (ver Critérios de reavaliação).

### Neutras / a observar
- `docs/06-Backend/README.md` documenta o padrão "create() + catch(P2002) + recuperação" como receita oficial para qualquer novo caso, independente de haver ou não um helper genérico.

## Critérios de reavaliação

Revisitar quando existir um **3º caso real** de idempotência via constraint única cuja consulta de recuperação seja um `findUniqueOrThrow` por um único campo (mesma forma do `Message`) — nesse ponto, 2 dos 3 casos compartilhariam a mesma forma de recuperação, e um helper parametrizado só pelo campo único (sem tentar cobrir o caso de índice parcial) passa a valer o custo.

## Referências

- ADR-0002 (Estratégia de idempotência).
- `apps/api/src/shared/prisma/prisma-errors.util.ts` e seu spec.
