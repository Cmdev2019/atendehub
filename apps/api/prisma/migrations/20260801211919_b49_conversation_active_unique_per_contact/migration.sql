-- B-49: fecha a race condition de idempotência em
-- ConversationService#upsertFromWebhook. findFirst+create não era atômico —
-- sob concorrência real (dois workers processando duas mensagens do mesmo
-- contato quase ao mesmo tempo, nem precisa de retry: cliente mandando 2
-- mensagens seguidas já basta) os dois passavam pelo findFirst antes de
-- qualquer create existir, e duas conversas WAITING nasciam pro mesmo
-- contato — pior que duplicar mensagem, porque a conversa do cliente fica
-- "split-brain" entre 2 tickets.
--
-- Diferente do B-48 (Message.externalId, unicidade de coluna inteira), a
-- invariante aqui é CONDICIONAL: no máximo 1 conversa ATIVA (WAITING/OPEN)
-- por contato — conversas RESOLVED/CLOSED do mesmo contato continuam
-- coexistindo livremente, é o histórico normal de atendimentos passados.
-- Prisma não expressa índice parcial (cláusula WHERE) via @@unique/@@index
-- na DSL — por isso esta migration é SQL puro, sem `prisma migrate dev`.
CREATE UNIQUE INDEX "conversations_active_per_contact_key"
  ON "conversations" ("companyId", "contactId")
  WHERE "status" IN ('WAITING', 'OPEN');
