-- B-48: fecha a race condition de idempotência em MessageService#createFromWebhook.
-- O findFirst+create anterior não era atômico — sob concorrência real (dois
-- workers do Bull processando o mesmo evento ao mesmo tempo, ver B-48 no
-- ROADMAP_ESTABILIZACAO.md) os dois passavam pelo findFirst antes de qualquer
-- create existir, e duas linhas de Message eram gravadas pro mesmo externalId.
-- Troca o índice não-único por um UNIQUE — Postgres permite múltiplos NULL
-- (mensagens de agente sem externalId, hoje só no caminho legado
-- MessageService#createFromAgent, não são afetadas) — e o
-- findFirst+create em MessageService#createUnique dá lugar a um create()
-- direto com captura de P2002, atômico porque a checagem de unicidade passa
-- a ser feita pelo próprio Postgres dentro do INSERT.
DROP INDEX "messages_externalId_idx";
CREATE UNIQUE INDEX "messages_externalId_key" ON "messages"("externalId");
