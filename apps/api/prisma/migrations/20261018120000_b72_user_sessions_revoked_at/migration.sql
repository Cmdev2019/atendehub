-- B-72 (M-08): marca de revogação das sessões do usuário (troca/reset de senha).
ALTER TABLE "users" ADD COLUMN "sessionsRevokedAt" TIMESTAMP(3);
