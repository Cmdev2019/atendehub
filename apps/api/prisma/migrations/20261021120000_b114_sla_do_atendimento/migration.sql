-- B-114 (ADR-0019, regras 18 a 21): SLA do atendimento, do Atender ao Encerrar.

-- Regra 19: prazo do atendimento por setor, na fila do setor (null = sem SLA
-- do atendimento). Nenhuma fila existente ganha prazo: o setor escolhe.
ALTER TABLE "queues" ADD COLUMN "maxServiceSecs" INTEGER;

-- Regra 21: o ciclo do atendimento atual — início, prazo e estouro. As
-- conversas já em atendimento ficam sem ciclo: não se sabe quando começaram.
ALTER TABLE "conversations" ADD COLUMN "attendedAt" TIMESTAMP(3),
ADD COLUMN "serviceSlaDueAt" TIMESTAMP(3),
ADD COLUMN "serviceSlaBreachedAt" TIMESTAMP(3);
