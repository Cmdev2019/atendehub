-- B-76 (M-01): etapas do webhook ainda pendentes por mensagem (retry retoma de onde parou).
ALTER TABLE "messages" ADD COLUMN "pendingWebhookSteps" TEXT[] DEFAULT ARRAY[]::TEXT[];
