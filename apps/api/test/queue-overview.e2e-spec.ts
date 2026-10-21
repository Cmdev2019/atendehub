import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Availability, ConversationStatus, Role, SenderType } from '@prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * B-68 (parte 2) — a visão do supervisor pela API HTTP de verdade (AppModule
 * inteiro e Postgres real): `GET /conversations/overview` conta, por setor e
 * por atendente, as conversas na fila e em atendimento, os SLAs estourados e
 * quem espera resposta — só da empresa de quem pede, e só para supervisor e
 * admin.
 */
const agent = new http.Agent({ keepAlive: false });

describe('Visão do supervisor — setores × atendentes (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const run = randomUUID().slice(0, 8);
  const companies: string[] = [];
  let companyId: string;
  const dept: Record<string, string> = {};
  const users: Record<string, { id: string; token: string }> = {};

  const get = (path: string, who: string) =>
    axios.get(`${base}/api/v1${path}`, {
      headers: { authorization: `Bearer ${users[who].token}` },
      httpAgent: agent,
      validateStatus: () => true,
    });

  const mkUser = async (key: string, role: Role, availability: Availability, departments: string[]) => {
    const u = await prisma.user.create({
      data: {
        companyId,
        name: key,
        email: `${key}-${run}@e2e.test`,
        passwordHash: 'x',
        role,
        availability,
        departments: { connect: departments.map((d) => ({ id: dept[d] })) },
      },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
    users[key] = { id: u.id, token: (await app.get(AuthService).login(u)).accessToken };
  };

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

  // Conversa com a última mensagem de quem for informado (CLIENT = esperando resposta)
  const mkConversation = async (data: {
    company?: string;
    department?: string | null;
    status: ConversationStatus;
    agentId?: string;
    waitingSince?: Date;
    waitSlaDueAt?: Date;
    serviceSlaDueAt?: Date;
    lastFrom?: SenderType;
  }) => {
    const owner = data.company ?? companyId;
    const contact = await prisma.contact.create({
      data: { companyId: owner, phone: `55${Math.floor(Math.random() * 1e11)}`, name: 'Paciente' },
    });
    const conv = await prisma.conversation.create({
      data: {
        companyId: owner,
        contactId: contact.id,
        departmentId: data.department ? dept[data.department] : null,
        status: data.status,
        agentId: data.agentId,
        waitingSince: data.waitingSince,
        waitSlaDueAt: data.waitSlaDueAt,
        attendedAt: data.serviceSlaDueAt ? minutesAgo(40) : undefined,
        serviceSlaDueAt: data.serviceSlaDueAt,
      },
    });
    if (data.lastFrom) {
      await prisma.message.create({
        data: { conversationId: conv.id, senderType: data.lastFrom, content: 'oi', sentAt: minutesAgo(1) },
      });
    }
    return conv.id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);

    companyId = (await prisma.company.create({ data: { name: 'E2E B-68', slug: `e2e-b68-${run}` } })).id;
    const otherCompany = (await prisma.company.create({ data: { name: 'E2E B-68 outra', slug: `e2e-b68-b-${run}` } })).id;
    companies.push(companyId, otherCompany);
    for (const name of ['Receitas', 'Ultrassom']) {
      dept[name] = (await prisma.department.create({ data: { companyId, name } })).id;
    }

    await mkUser('ana', Role.AGENT, Availability.ONLINE, ['Receitas']);
    await mkUser('bia', Role.AGENT, Availability.OFFLINE, ['Receitas', 'Ultrassom']);
    await mkUser('sueli', Role.SUPERVISOR, Availability.ONLINE, []);

    // Fila: duas em Receitas (uma já passou do prazo) e uma sem setor
    await mkConversation({ department: 'Receitas', status: ConversationStatus.WAITING, waitingSince: minutesAgo(30), waitSlaDueAt: minutesAgo(25) });
    await mkConversation({ department: 'Receitas', status: ConversationStatus.WAITING, waitingSince: minutesAgo(2), waitSlaDueAt: new Date(Date.now() + 180_000) });
    await mkConversation({ department: null, status: ConversationStatus.WAITING, waitingSince: minutesAgo(45) });
    // Em atendimento: a Ana espera resposta dela; a Bia está Offline, com o
    // prazo do atendimento vencido e o paciente esperando resposta
    await mkConversation({ department: 'Receitas', status: ConversationStatus.OPEN, agentId: users.ana.id, lastFrom: SenderType.CLIENT });
    await mkConversation({ department: 'Ultrassom', status: ConversationStatus.OPEN, agentId: users.ana.id, lastFrom: SenderType.AGENT });
    await mkConversation({ department: 'Ultrassom', status: ConversationStatus.OPEN, agentId: users.bia.id, serviceSlaDueAt: minutesAgo(5), lastFrom: SenderType.CLIENT });
    // Encerrada e de outra empresa: não entram na conta
    await mkConversation({ department: 'Receitas', status: ConversationStatus.CLOSED });
    await mkConversation({ company: otherCompany, status: ConversationStatus.WAITING, waitingSince: minutesAgo(90) });
  });

  afterAll(async () => {
    const inCompanies = { in: companies };
    await prisma.message.deleteMany({ where: { conversation: { companyId: inCompanies } } });
    await prisma.refreshToken.deleteMany({ where: { user: { companyId: inCompanies } } });
    await prisma.conversation.deleteMany({ where: { companyId: inCompanies } });
    await prisma.contact.deleteMany({ where: { companyId: inCompanies } });
    await prisma.user.deleteMany({ where: { companyId: inCompanies } });
    await prisma.department.deleteMany({ where: { companyId: inCompanies } });
    await prisma.company.deleteMany({ where: { id: inCompanies } });
    await app.close();
  });

  it('supervisor vê os setores e os atendentes com as contagens certas, só da empresa dele', async () => {
    const res = await get('/conversations/overview', 'sueli');

    expect(res.status).toBe(200);
    expect(res.data.totals).toMatchObject({
      waiting: 3,
      waitSlaBreached: 1,
      inService: 3,
      serviceSlaBreached: 1,
      agentsOnline: 2,
      agentsTotal: 3,
    });
    // A maior espera é a sem setor, de 45 min — a de 90 min é de outra empresa
    expect(Date.now() - Date.parse(res.data.totals.oldestWaitingSince)).toBeLessThan(50 * 60_000);

    const byName = Object.fromEntries(res.data.departments.map((d: any) => [d.name, d]));
    expect(byName.Receitas).toMatchObject({ waiting: 2, waitSlaBreached: 1, inService: 1, serviceSlaBreached: 0, agentsOnline: 1, agentsTotal: 2 });
    expect(byName.Ultrassom).toMatchObject({ waiting: 0, inService: 2, serviceSlaBreached: 1, agentsOnline: 0, agentsTotal: 1 });
    expect(byName['Sem setor']).toMatchObject({ id: null, waiting: 1, inService: 0 });

    const agentsByName = Object.fromEntries(res.data.agents.map((a: any) => [a.name, a]));
    expect(agentsByName.ana).toMatchObject({ availability: 'ONLINE', inService: 2, serviceSlaBreached: 0, awaitingReply: 1 });
    expect(agentsByName.bia).toMatchObject({ availability: 'OFFLINE', inService: 1, serviceSlaBreached: 1, awaitingReply: 1 });
    expect(agentsByName.sueli).toMatchObject({ role: 'SUPERVISOR', inService: 0 });
  });

  it('atendente comum não abre a visão do supervisor (403)', async () => {
    expect((await get('/conversations/overview', 'ana')).status).toBe(403);
  });
});
