// ─────────────────────────────────────────────────────────────────────────────
// Validação operacional B-48 — race condition de idempotência em
// MessageService#createFromWebhook, contra Postgres REAL (não mock).
//
// Reproduz exatamente o cenário do achado original (validação B-39 de
// 2026-07-29): N chamadas concorrentes (Promise.all, não sequenciais) pro
// mesmo externalId, como aconteceria com dois workers do Bull processando o
// mesmo evento ao mesmo tempo. Antes do B-48 isso gravava N linhas de
// Message. Critério de aceite: sempre exatamente 1 linha, exatamente 1
// isNew=true, e nenhuma exceção não tratada escapando pro chamador.
//
// Uso: npx ts-node -r dotenv/config scripts/validate-b48-concurrency.ts
// Requer Postgres real de pé (docker compose up -d postgres) — mesmo banco
// de DATABASE_URL do .env.
// ─────────────────────────────────────────────────────────────────────────────
import { PrismaClient, MessageType, SenderType } from '@prisma/client';
import { MessageService } from '../src/modules/message/message.service';

const prisma = new PrismaClient();
const messageService = new MessageService(prisma as any);

const ROUNDS = [2, 5, 10, 50, 100];

async function setupFixtures() {
  const company = await prisma.company.create({
    data: { name: 'B-48 Validação Concorrência', slug: `b48-validacao-${Date.now()}` },
  });
  const contact = await prisma.contact.create({
    data: { companyId: company.id, name: 'Contato B-48', phone: `55119${Date.now()}` },
  });
  const conversation = await prisma.conversation.create({
    data: { companyId: company.id, contactId: contact.id },
  });
  return { company, contact, conversation };
}

async function teardownFixtures(companyId: string) {
  // onDelete: Cascade em Conversation→Message e Company→Contact/Conversation
  // — apagar a empresa limpa tudo que este script criou.
  await prisma.company.delete({ where: { id: companyId } });
}

async function runRound(conversationId: string, concurrency: number) {
  const externalId = `b48-concorrencia-${concurrency}w-${Date.now()}`;

  const startedAt = Date.now();
  const settled = await Promise.allSettled(
    Array.from({ length: concurrency }, () =>
      messageService.createFromWebhook({
        conversationId,
        content: `Mensagem de teste — ${concurrency} workers concorrentes`,
        type: MessageType.TEXT,
        senderType: SenderType.CLIENT,
        externalId,
      }),
    ),
  );
  const elapsedMs = Date.now() - startedAt;

  const rejected = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  const fulfilled = settled.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
    Awaited<ReturnType<typeof messageService.createFromWebhook>>
  >[];
  const isNewCount = fulfilled.filter((r) => r.value.isNew).length;

  const rowsInDb = await prisma.message.count({ where: { externalId } });

  const ok = rowsInDb === 1 && isNewCount === 1 && rejected.length === 0;

  console.log(
    `${ok ? '✅' : '❌'} ${String(concurrency).padStart(3)} workers concorrentes | ` +
      `linhas no banco: ${rowsInDb} | isNew=true: ${isNewCount} | ` +
      `rejeitadas: ${rejected.length} | tempo: ${elapsedMs}ms`,
  );

  if (rejected.length > 0) {
    console.error('   Exceções não tratadas (não deveria acontecer nenhuma):');
    for (const r of rejected) console.error('   -', r.reason?.message ?? r.reason);
  }

  return ok;
}

async function main() {
  console.log('── Validação B-48: idempotência de MessageService#createFromWebhook sob concorrência real ──\n');

  const { company, conversation } = await setupFixtures();
  let allOk = true;

  try {
    for (const concurrency of ROUNDS) {
      const ok = await runRound(conversation.id, concurrency);
      allOk = allOk && ok;
    }
  } finally {
    await teardownFixtures(company.id);
  }

  console.log(`\n${allOk ? '✅ TODAS as rodadas passaram — exatamente 1 registro por rodada, sempre.' : '❌ ALGUMA rodada falhou — ver acima.'}`);
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Falha ao rodar a validação:', err);
  await prisma.$disconnect();
  process.exit(1);
});
