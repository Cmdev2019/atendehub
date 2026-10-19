-- B-66 (ADR-0019): fila compartilhada e ciclo de espera gravado na conversa.

-- M-21: a estratégia da fila era gravada e nunca aplicada. Só MANUAL existe
-- de fato ("quem atender primeiro"); as filas existentes passam para ela.
ALTER TABLE "queues" ALTER COLUMN "strategy" SET DEFAULT 'MANUAL';
UPDATE "queues" SET "strategy" = 'MANUAL' WHERE "strategy" <> 'MANUAL';

-- Regra 15: início da espera atual e prazo do SLA dela
ALTER TABLE "conversations" ADD COLUMN "waitSlaDueAt" TIMESTAMP(3),
ADD COLUMN "waitingSince" TIMESTAMP(3);

-- Quem já está na fila começa a contar de quando a conversa nasceu — o mesmo
-- critério que o front usava até aqui (B-104). O prazo fica vazio: o job de
-- SLA já agendado continua valendo.
UPDATE "conversations" SET "waitingSince" = "createdAt" WHERE "status" = 'WAITING' AND "waitingSince" IS NULL;
