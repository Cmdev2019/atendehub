-- AlterEnum
ALTER TYPE "ConversationResolution" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "resolutionNote" TEXT;
