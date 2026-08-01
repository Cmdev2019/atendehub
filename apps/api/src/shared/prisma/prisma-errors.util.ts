import { Prisma } from '@prisma/client';

// ── Consolidação arquitetural (ACR 2026-08-01) ──────────────────────────────
// O predicado `err instanceof Prisma.PrismaClientKnownRequestError &&
// err.code === 'P2002'` existia duplicado, byte a byte, em
// MessageService#createUnique (B-48) e ConversationService#upsertFromWebhook
// (B-49) — mesmo padrão de "tentei criar, colidi com uma constraint única,
// trato como corrida vencida por outro processo" em dois domínios
// diferentes. Extraído aqui porque os dois vão continuar existindo lado a
// lado (são recursos diferentes, Message e Conversation) e qualquer 3º caso
// futuro do mesmo padrão (ver docs/adr/0003-persistencia-atomica.md) deve
// reusar isto em vez de reescrever a checagem.
export function isUniqueConstraintViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
