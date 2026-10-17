-- C-09/B-58: unicidade do externalId passa a ser POR CONEXÃO de WhatsApp.
-- O B-48 tornou `externalId` único no banco inteiro, mas o WhatsApp usa o
-- mesmo id de mensagem nos dois lados de uma conversa. Quando duas conexões
-- cadastradas no AtendeHub conversavam entre si (dois números da mesma
-- empresa, ou de duas empresas clientes), a 2ª gravação colidia com a 1ª: o
-- MessageService#createUnique devolvia a mensagem da OUTRA conversa como "já
-- existente" e a mensagem nunca aparecia. Status e exclusões, feitos só por
-- externalId, alcançavam a linha da outra empresa.

-- 1. Coluna nova, preenchida a partir da conversa de cada mensagem.
ALTER TABLE "messages" ADD COLUMN "whatsappConnectionId" TEXT;

UPDATE "messages" AS m
SET "whatsappConnectionId" = c."whatsappConnectionId"
FROM "conversations" AS c
WHERE m."conversationId" = c."id"
  AND c."whatsappConnectionId" IS NOT NULL;

-- 2. Troca o índice único global pelo composto. O índice antigo garantia
-- que não havia externalId repetido, então o novo nasce sem conflito.
DROP INDEX "messages_externalId_key";
CREATE UNIQUE INDEX "messages_whatsappConnectionId_externalId_key" ON "messages"("whatsappConnectionId", "externalId");

-- 3. Conexão excluída não apaga o histórico: a mensagem só perde o vínculo.
ALTER TABLE "messages" ADD CONSTRAINT "messages_whatsappConnectionId_fkey" FOREIGN KEY ("whatsappConnectionId") REFERENCES "whatsapp_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
