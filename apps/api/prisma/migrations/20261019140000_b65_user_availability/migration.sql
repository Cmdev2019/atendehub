-- B-65 (ADR-0019): estado do atendente (Online/Offline), trocado só por ele.
-- Todo mundo começa Offline: ninguém aparece disponível sem ter escolhido.
CREATE TYPE "Availability" AS ENUM ('ONLINE', 'OFFLINE');

ALTER TABLE "users" ADD COLUMN "availability" "Availability" NOT NULL DEFAULT 'OFFLINE',
ADD COLUMN "availabilityChangedAt" TIMESTAMP(3);
