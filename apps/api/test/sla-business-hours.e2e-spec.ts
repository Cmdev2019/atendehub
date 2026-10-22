import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Availability, ConversationStatus, Role } from '../src/generated/prisma/client';
import axios from 'axios';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { ConversationService } from '../src/modules/conversation/conversation.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { QUEUE_NAMES } from '../src/shared/queues/queue-names';
import { zonedParts, zonedTimeToUtc } from '../src/shared/time/company-time';

/**
 * B-112 (ADR-0019, regra 17) — o relógio do SLA da espera só anda no
 * expediente, pela API HTTP de verdade (AppModule inteiro, Postgres e Bull
 * reais): a conversa que volta para a fila com o expediente fechado ganha o
 * prazo da próxima abertura mais o prazo da fila, e o job do SLA é agendado
 * para esse instante, não para daqui a 5 minutos.
 *
 * O expediente do teste abre só amanhã (no fuso da empresa), das 09:00 às
 * 18:00. Assim "agora" está sempre fora dele, seja qual for a hora em que o
 * teste rodar.
 *
 * Os jobs agendados são removidos no fim: eles vencem só amanhã e cairiam na
 * fila de uma API de dev que estivesse no ar.
 */
const agent = new http.Agent({ keepAlive: false });
const SP = 'America/Sao_Paulo';
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

describe('SLA da espera no expediente (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let slaQueue: Queue;
  let base: string;
  const run = randomUUID().slice(0, 8);
  let companyId: string;
  let departmentId: string;
  let ana: { id: string; token: string };
  const conversations: string[] = [];

  // Amanhã às 09:00 em São Paulo, e o expediente que só abre nesse dia
  const today = zonedParts(new Date(), SP);
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const opening = zonedTimeToUtc(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    9,
    0,
    0,
    0,
    SP,
  );
  const businessHours = { [WEEKDAYS[tomorrow.getUTCDay()]]: [{ start: '09:00', end: '18:00' }] };

  const backToQueue = async () => {
    const contact = await prisma.contact.create({
      data: { companyId, phone: `55${Math.floor(Math.random() * 1e11)}`, name: 'Paciente' },
    });
    const conv = await prisma.conversation.create({
      data: { companyId, contactId: contact.id, departmentId, status: ConversationStatus.OPEN, agentId: ana.id },
    });
    conversations.push(conv.id);

    // A Ana devolve a conversa dela para a fila do setor
    const res = await axios.request({
      method: 'PATCH',
      url: `${base}/api/v1/conversations/${conv.id}/assign`,
      data: {},
      headers: { authorization: `Bearer ${ana.token}` },
      httpAgent: agent,
      validateStatus: () => true,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('WAITING');

    const saved = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    // B-107: o job do SLA vai para o Redis depois da resposta
    await app.get(ConversationService).whenSlaSynced();
    const job = await slaQueue.getJob(`sla-check:${conv.id}`);
    return { saved, job };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);
    slaQueue = app.get(getQueueToken(QUEUE_NAMES.SLA_CHECK));

    companyId = (
      await prisma.company.create({ data: { name: 'E2E B-112', slug: `e2e-b112-${run}`, timezone: SP } })
    ).id;
    departmentId = (await prisma.department.create({ data: { companyId, name: 'Receitas' } })).id;
    await prisma.queue.create({ data: { companyId, departmentId, name: 'Fila Receitas', maxWaitSecs: 300 } });
    await prisma.autoAttendanceFlow.create({ data: { companyId, isActive: true, businessHours } });

    const u = await prisma.user.create({
      data: {
        companyId,
        name: 'Ana',
        email: `ana-${run}@e2e.test`,
        passwordHash: 'x',
        role: Role.AGENT,
        availability: Availability.ONLINE,
        departments: { connect: { id: departmentId } },
      },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
    ana = { id: u.id, token: (await app.get(AuthService).login(u)).accessToken };
  });

  afterAll(async () => {
    await app.get(ConversationService).whenSlaSynced();
    for (const id of conversations) {
      await (await slaQueue.getJob(`sla-check:${id}`))?.remove().catch(() => undefined);
    }
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.notification.deleteMany({ where: { companyId } });
    await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });
    await prisma.conversation.deleteMany({ where: { companyId } });
    await prisma.contact.deleteMany({ where: { companyId } });
    await prisma.autoAttendanceFlow.deleteMany({ where: { companyId } });
    await prisma.queue.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.department.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await app.close();
  });

  it('com o expediente fechado, o prazo é a próxima abertura mais o prazo da fila, e o job vai para ele', async () => {
    const before = Date.now();

    const { saved, job } = await backToQueue();

    expect(saved.waitingSince!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(saved.waitSlaDueAt!.toISOString()).toBe(new Date(opening.getTime() + 300_000).toISOString());
    // O Bull dispara o job em `timestamp + delay`: o prazo, e não daqui a 5 minutos
    expect(job).toBeTruthy();
    expect(Math.abs(job!.timestamp + Number(job!.opts.delay) - saved.waitSlaDueAt!.getTime())).toBeLessThan(2000);
  });

  it('com o auto-atendimento desligado, o horário não vale e o relógio anda o dia todo', async () => {
    await prisma.autoAttendanceFlow.update({ where: { companyId }, data: { isActive: false } });

    const { saved } = await backToQueue();

    expect(saved.waitSlaDueAt!.getTime() - saved.waitingSince!.getTime()).toBe(300_000);
  });
});
