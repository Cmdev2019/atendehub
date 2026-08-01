# ADR-0002 — Estratégia de idempotência para dados vindos de fora (webhook/eco)

- **Status:** Aceita
- **Data:** 2026-08-01
- **Decisores:** Engenharia (Claude Code, sessão de correção B-48/B-49 + ACR)
- **Contexto técnico:** `apps/api/src/modules/message`, `apps/api/src/modules/conversation`, qualquer módulo futuro que crie um registro a partir de um evento externo (webhook) ou reentrante (retry)

## Contexto

O AtendeHub recebe eventos da Evolution API via webhook e os processa numa fila Bull com retry (B-39). Um mesmo evento pode chegar mais de uma vez (reenvio da Evolution, retry do Bull após timeout com a promise anterior ainda em voo, múltiplas réplicas da API). Dois recursos de domínio precisam da mesma garantia — "processar o mesmo evento N vezes produz o mesmo estado final que processar 1 vez" — mas com invariantes de unicidade de formato diferente:

- **Message**: unicidade de uma coluna inteira (`externalId` nunca se repete).
- **Conversation**: unicidade condicional (no máximo 1 linha com `status IN (WAITING, OPEN)` por contato; `RESOLVED`/`CLOSED` do mesmo contato coexistem livremente).

O padrão original (`findFirst()` → `create()` se não achou) tinha uma janela TOCTOU: dois workers liam "não existe" antes de qualquer `create()` terminar, e duplicavam o recurso (B-48: mensagem duplicada; B-49: "split-brain" de conversa — pior, porque fragmenta o histórico do cliente entre 2 tickets).

## Alternativas consideradas

### Alternativa A — Mutex em memória (por processo)
- **Prós:** trivial de implementar, zero infraestrutura nova.
- **Contras:** não sobrevive a múltiplas réplicas da API — é exatamente o cenário que amplia a corrida (mais réplicas = mais chance de duas execuções concorrentes em processos diferentes).
- **Custo estimado:** baixo, mas resolve o problema errado (só a metade "1 processo, múltiplas promises").

### Alternativa B — Lock distribuído via Redis (`SET NX` / Redlock)
- **Prós:** funciona entre réplicas; Redis já é dependência do projeto (Bull).
- **Contras:** adiciona uma dependência de coordenação externa para um problema que o PostgreSQL já resolve nativamente com uma constraint; risco de lock não liberado (crash do processo entre `SET NX` e o `DEL`) exige TTL e lógica de expiração própria; protege mais do que o necessário (serializaria também leituras que não precisam de exclusão mútua).
- **Custo estimado:** médio — precisa de biblioteca (`redlock` ou equivalente), testes de expiração/renovação, monitoramento de locks presos.

### Alternativa C — `upsert()` nativo do Prisma
- **Prós:** API idiomática do Prisma, uma linha de código.
- **Contras:** só é atômico (via `INSERT ... ON CONFLICT` nativo) quando o `where` aponta para uma constraint **não-parcial** conhecida pelo schema do Prisma. Funcionaria para `Message.externalId` (coluna inteira), mas **não é utilizável para `Conversation`** — sua invariante é condicional (`WHERE status IN (...)`), e o Prisma não expressa isso no tipo de `where` de `upsert()`. Além disso, `upsert()` não informa se **criou** ou **achou** — `isNew` é exigido por B-39 para não duplicar efeito colateral (mídia baixada 2x, auto-atendimento disparado 2x) num retry.
- **Custo estimado:** baixo onde funciona, mas não cobre os dois casos reais do projeto com uma única abordagem.

### Alternativa D — `SELECT ... FOR UPDATE` numa transação
- **Prós:** garantiria serialização real via lock de linha do PostgreSQL.
- **Contras:** não há linha para travar antes dela existir — o problema é justamente a criação. Viável travando uma linha *proxy* (ex.: o `Contact`) dentro de uma transação aberta, mas isso aumenta a contenção em qualquer outra operação sobre aquele contato durante toda a duração da transação, e é uma garantia só de aplicação: quebra de novo se outro código criar o recurso sem passar pelo lock (foi exatamente assim que o B-49 nasceu).
- **Custo estimado:** médio-alto — exige disciplina de todo código futuro passar pela mesma transação/lock.

### Alternativa E — Transação `SERIALIZABLE`
- **Prós:** o PostgreSQL detectaria o conflito (write skew) via predicate lock (SIREAD) e abortaria uma das duas transações concorrentes.
- **Contras:** exige implementar retry da transação inteira para o erro `40001`/`P2034`; custo de throughput do predicate lock é maior que o de uma constraint única para proteger uma invariante que não precisa de isolamento de leitura consistente entre múltiplas linhas — o conflito real é só "duas gravações para a mesma chave".
- **Custo estimado:** médio — precisa de retry loop em toda chamada, mais caro em CPU do PostgreSQL sob concorrência real.

### Alternativa F — Constraint `UNIQUE` (coluna inteira ou parcial) + tratamento de `P2002`
- **Prós:** atomicidade garantida pelo PostgreSQL dentro do próprio `INSERT` — a checagem de unicidade e a escrita acontecem na mesma operação atômica de banco, sem lock explícito de aplicação. Cobre os dois formatos de invariante do projeto: `@@unique` de coluna inteira para `Message.externalId`; índice **parcial** (`CREATE UNIQUE INDEX ... WHERE status IN (...)`, escrito à mão porque o Prisma não expressa `WHERE` na DSL de `@@unique`/`@@index`) para `Conversation`. Não depende de nenhuma réplica, processo ou disciplina de código lembrar de nada — é impossível violar a invariante no banco, ponto final. `P2002` capturado dá exatamente o sinal (`isNew: false`) que B-39 precisa.
- **Contras:** exige uma migration por invariante nova; o índice parcial não é visível pra introspecção/tipagem do Prisma (mitigado com comentário no `schema.prisma` apontando pra migration).
- **Custo estimado:** baixo — 1 migration + `try { create() } catch(P2002) { recover }`, sem infraestrutura nova.

### Alternativa G — Não fazer nada
Manter `findFirst()`+`create()`. Custo: duplicação de dado sob concorrência real, já comprovada ao vivo tanto para `Message` (B-48, validação operacional do B-39) quanto para `Conversation` (B-49). Inaceitável para dado de conversa de cliente.

## Decisão

Escolhida a **Alternativa F** — constraint `UNIQUE` (coluna inteira ou parcial, conforme a invariante de cada recurso) + `create()` direto + captura de `P2002` como "outro processo venceu a corrida", com uma consulta de recuperação só no caminho de colisão.

Justificativa objetiva: é a única alternativa que move a garantia de atomicidade para a camada que pode garanti-la sob qualquer grau de concorrência (múltiplos workers, múltiplas réplicas, sem exceção) sem adicionar infraestrutura nova, sem lock explícito de aplicação, e sem depender de nenhum código futuro "lembrar" de usar um lock — a constraint é impossível de contornar. `Alternativa C` (upsert) foi descartada não por ser pior em geral, mas por ser **estruturalmente inviável** para a invariante condicional de `Conversation` — essa é a razão pela qual a decisão não é "sempre usar upsert", é "usar `UNIQUE`/índice parcial + `P2002`", que cobre os dois casos com o mesmo raciocínio.

## Consequências

### Positivas
- Duplicação de `Message`/`Conversation` sob concorrência é estruturalmente impossível, não apenas improvável.
- `isNew` continua disponível para o consumidor decidir se dispara efeito colateral.
- Sem infraestrutura nova (Redis lock, biblioteca de coordenação).
- Padrão replicável: qualquer 3º caso futuro de "criar-ou-reaproveitar sob concorrência" segue a mesma receita (ver `docs/06-Backend/README.md`, seção de idempotência).

### Negativas
- Cada novo caso exige uma migration própria (não é um componente genérico reutilizável em runtime — ver ADR-0003 sobre por que um `AtomicPersistenceHelper` genérico não foi criado).
- Um índice parcial não é visível na tipagem do Prisma — exige disciplina de comentário cruzado entre `schema.prisma` e a migration (ver `enum ConversationStatus` no schema, comentário adicionado na PRR do B-49).

### Neutras / a observar
- O predicado `isUniqueConstraintViolation(err)` foi extraído para `shared/prisma/prisma-errors.util.ts` (ACR 2026-08-01) — usado por `MessageService` e `ConversationService`. Um 3º consumidor deve reusar essa função, não reescrever a checagem.

## Critérios de reavaliação

Se um 3º caso de idempotência aparecer com uma invariante que **não** seja expressável como `UNIQUE`/índice parcial do PostgreSQL (ex.: unicidade que depende de uma agregação, não de uma tupla de colunas), esta ADR deve ser revisitada — nesse caso a Alternativa D (lock em linha proxy) volta a ser candidata viável.

## Referências

- `ROADMAP_ESTABILIZACAO.md`, itens B-48 e B-49 (changelog com evidência de concorrência real: 2 a 100 workers, sempre 1 registro).
- `B48_AUDITORIA_POS_HARDENING.pdf`, `B49_AUDITORIA_POS_HARDENING.pdf` (raiz do repo).
- `apps/api/src/modules/message/message.service.ts` (`createUnique`), `apps/api/src/modules/conversation/conversation.service.ts` (`upsertFromWebhook`).
