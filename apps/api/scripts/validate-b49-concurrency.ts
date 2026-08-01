// ─────────────────────────────────────────────────────────────────────────────
// Validação operacional B-49 — race condition de idempotência em
// ConversationService#upsertFromWebhook, contra Postgres REAL (não mock).
//
// Reproduz o cenário real do achado: N chamadas concorrentes (Promise.all,
// não sequenciais) de upsertFromWebhook pro MESMO contato, como aconteceria
// com duas mensagens do cliente chegando quase juntas e sendo processadas
// por workers/réplicas diferentes. Antes do B-49 isso gravava N conversas
// WAITING pro mesmo contato ("split-brain"). Critério de aceite: sempre
// exatamente 1 conversa ATIVA, exatamente 1 isNew=true, nenhuma exceção não
// tratada escapando pro chamador.
//
// Uso: npx ts-node -r dotenv/config scripts/validate-b49-concurrency.ts
// Requer Postgres real de pé (docker compose up -d postgres).
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient, ConversationStatus } from '@prisma/client';
import { ConversationService } from '../src/modules/conversation/conversation.service';

const prisma = new PrismaClient();

// Dependências do ConversationService que não participam da corrida sendo
// testada (sem departmentId no cenário abaixo, scheduleSlaCheck nunca é
// chamado — os stubs existem só pra satisfazer o construtor).
const noopEvents = { emitConversationAssigned() {}, emitConversationUpdated() {} } as any;
const noopAuditLog = { record: async () => undefined } as any;
const noopNotification = { create: async () => undefined } as any;
const noopSlaQueue = { add: async () => undefined, getJob: async () => null } as any;

const conversationService = new ConversationService(
  prisma as any,
  noopEvents,
  noopAuditLog,
  noopNotification,
  noopSlaQueue,
);

const ROUNDS = [2, 5, 10, 50, 100];

async function setupFixtures() {
  const company = await prisma.company.create({
    data: { name: 'B-49 Validação Concorrência', slug: `b49-validacao-${Date.now()}` },
  });
  const whatsapp = await prisma.whatsAppConnection.create({
    data: { companyId: company.id, name: 'Conexão de teste', sessionName: `b49-validacao-${Date.now()}` },
  });
  return { company, whatsapp };
}

async function teardownFixtures(companyId: string) {
  await prisma.company.delete({ where: { id: companyId } });
}

async function runRound(companyId: string, whatsappConnectionId: string, concurrency: number) {
  const contact = await prisma.contact.create({
    data: { companyId, name: 'Contato B-49', phone: `55118${Date.now()}${concurrency}` },
  });

  const startedAt = Date.now();
  const settled = await Promise.allSettled(
    Array.from({ length: concurrency }, () =>
      conversationService.upsertFromWebhook(companyId, contact.id, whatsappConnectionId),
    ),
  );
  const elapsedMs = Date.now() - startedAt;

  const rejected = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  const fulfilled = settled.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
    Awaited<ReturnType<typeof conversationService.upsertFromWebhook>>
  >[];
  const isNewCount = fulfilled.filter((r) => r.value.isNew).length;
  const distinctConversationIds = new Set(fulfilled.map((r) => r.value.conversation.id));

  const activeRowsInDb = await prisma.conversation.count({
    where: { companyId, contactId: contact.id, status: { in: [ConversationStatus.WAITING, ConversationStatus.OPEN] } },
  });

  const ok =
    activeRowsInDb === 1 && isNewCount === 1 && distinctConversationIds.size === 1 && rejected.length === 0;

  console.log(
    `${ok ? '✅' : '❌'} ${String(concurrency).padStart(3)} workers concorrentes | ` +
      `conversas ativas no banco: ${activeRowsInDb} | isNew=true: ${isNewCount} | ` +
      `ids distintos devolvidos: ${distinctConversationIds.size} | rejeitadas: ${rejected.length} | ` +
      `tempo: ${elapsedMs}ms`,
  );

  if (rejected.length > 0) {
    console.error('   Exceções não tratadas (não deveria acontecer nenhuma):');
    for (const r of rejected) console.error('   -', r.reason?.message ?? r.reason);
  }

  return ok;
}

async function main() {
  console.log('── Validação B-49: idempotência de ConversationService#upsertFromWebhook sob concorrência real ──\n');

  const { company, whatsapp } = await setupFixtures();
  let allOk = true;

  try {
    for (const concurrency of ROUNDS) {
      const ok = await runRound(company.id, whatsapp.id, concurrency);
      allOk = allOk && ok;
    }
  } finally {
    await teardownFixtures(company.id);
  }

  console.log(`\n${allOk ? '✅ TODAS as rodadas passaram — exatamente 1 conversa ativa por rodada, sempre.' : '❌ ALGUMA rodada falhou — ver acima.'}`);
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Falha ao rodar a validação:', err);
  await prisma.$disconnect();
  process.exit(1);
});
