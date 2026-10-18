-- Purga das cópias de um titular no banco da Evolution (B-62).
-- Procedimento completo em docs/35-LGPD/MAPA-DE-DADOS-PESSOAIS.md, seção 4.
-- Variáveis: numero (só dígitos, ex. 5511999999999) e instancias (nomes
-- separados por vírgula — TODAS as conexões da empresa, inclusive antigas).
-- Troque ROLLBACK por COMMIT só depois de conferir as contagens.
BEGIN;
CREATE TEMP TABLE alvo_instancia AS
  SELECT id FROM "Instance" WHERE name = ANY(string_to_array(:'instancias', ','));
-- O número aparece como remoteJid, remoteJidAlt, participant ou
-- participantAlt, com ou sem sufixo de dispositivo (":12"), em conversa
-- direta ou em grupo.
CREATE TEMP TABLE alvo_msg AS
  SELECT m.id FROM "Message" m
  WHERE m."instanceId" IN (SELECT id FROM alvo_instancia)
    AND m."key"::text ~ ('"' || :'numero' || '(:[0-9]+)?@');
SELECT 'mensagens a apagar: ' || count(*) FROM alvo_msg;
SELECT 'arquivos de mídia (apagar do bucket antes do COMMIT): ' || string_agg("fileName", ', ')
  FROM "Media" WHERE "messageId" IN (SELECT id FROM alvo_msg);
DELETE FROM "Media" WHERE "messageId" IN (SELECT id FROM alvo_msg);
DELETE FROM "MessageUpdate" WHERE "messageId" IN (SELECT id FROM alvo_msg)
   OR ("instanceId" IN (SELECT id FROM alvo_instancia)
       AND ("remoteJid" ~ ('^' || :'numero' || '(:[0-9]+)?@') OR "participant" ~ ('^' || :'numero' || '(:[0-9]+)?@')));
DELETE FROM "Message" WHERE id IN (SELECT id FROM alvo_msg);
DELETE FROM "Chat" WHERE "instanceId" IN (SELECT id FROM alvo_instancia) AND "remoteJid" ~ ('^' || :'numero' || '(:[0-9]+)?@');
DELETE FROM "Contact" WHERE "instanceId" IN (SELECT id FROM alvo_instancia) AND "remoteJid" ~ ('^' || :'numero' || '(:[0-9]+)?@');
DELETE FROM "IsOnWhatsapp" WHERE "remoteJid" ~ ('^' || :'numero' || '(:[0-9]+)?@');
ROLLBACK;
