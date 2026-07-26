-- CreateEnum
CREATE TYPE "ConversationResolution" AS ENUM ('RESOLVED', 'UNRESOLVED');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "resolution" "ConversationResolution";
