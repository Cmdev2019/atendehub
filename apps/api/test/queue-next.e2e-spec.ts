import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Availability, ConversationStatus, Role } from '../src/generated/prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * B-67 (ADR-0019, regra 5) — "Pegar próxima" pela API HTTP de verdade
 * (AppModule inteiro e Postgres real): entrega a conversa que espera há mais
 * tempo nos setores de quem pede, nunca a mesma para dois pedidos, e nada de
 * fora dos setores dele nem de outra empresa.
 *
 * A garantia é o `FOR UPDATE SKIP LOCKED` no banco, e ela só se prova com
 * concorrência real: cinco pedidos ao mesmo tempo contra cinco conversas na
 * fila (ADR-0004).
 *
 * Cada teste usa setores próprios, para não depender da ordem. Sessões saem
 * do AuthService (não de POST /auth/login) pelo limite de 5 logins por minuto
 * por IP.
 */
const agent = new http.Agent({ keepAlive: false });

describe('Pegar próxima — a mais antiga dos setores de quem pede (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const run = randomUUID().slice(0, 8);
  let companyId: string;
  let otherCompanyId: string;
  const dept: Record<string, string> = {};
  const queueOf: Record<string, string> = {};
  const users: Record<string, { id: string; name: string; token: string }> = {};

  const call = (method: string, path: string, who: string) =>
    axios.request({
      method,
      url: `${base}/api/v1${path}`,
      headers: { authorization: `Bearer ${users[who].token}` },
      httpAgent: agent,
      validateStatus: () => true,
    });
  const next = (who: string) => call('POST', '/conversations/next', who);

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
    users[key] = { id: u.id, name: u.name, token: (await app.get(AuthService).login(u)).accessToken };
  };

  // Conversa na fila há `minutes` minutos — `department` null = sem setor. No
  // setor com fila, o prazo do SLA é o da fila (300 s), já vencido.
  const mkWaiting = async (department: string | null, minutes: number, inCompany = companyId) => {
    const contact = await prisma.contact.create({
      data: { companyId: inCompany, phone: `55${Math.floor(Math.random() * 1e11)}`, name: 'Paciente' },
    });
    const waitingSince = new Date(Date.now() - minutes * 60_000);
    const queueId = department ? queueOf[department] : undefined;
    const conv = await prisma.conversation.create({
      data: {
        companyId: inCompany,
        contactId: contact.id,
        departmentId: department ? dept[department] : null,
        status: ConversationStatus.WAITING,
        waitingSince,
        ...(queueId && { queueId, waitSlaDueAt: new Date(waitingSince.getTime() + 300_000) }),
      },
    });
    return conv.id;
  };

  const stillWaiting = async (id: string) =>
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: ConversationStatus.WAITING,
      agentId: null,
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);

    companyId = (await prisma.company.create({ data: { name: 'E2E B-67', slug: `e2e-b67-${run}` } })).id;
    otherCompanyId = (await prisma.company.create({ data: { name: 'E2E B-67 outra', slug: `e2e-b67-b-${run}` } })).id;
    for (const name of ['receitas', 'outras', 'resultados', 'ultrassom', 'endosc', 'oftalmo', 'cirurgia', 'pedidos']) {
      dept[name] = (await prisma.department.create({ data: { companyId, name } })).id;
    }
    queueOf.receitas = (
      await prisma.queue.create({
        data: { companyId, departmentId: dept.receitas, name: 'Fila receitas', maxWaitSecs: 300 },
      })
    ).id;

    for (const key of ['ana', 'bruno', 'carla', 'davi', 'elisa']) {
      await mkUser(key, Role.AGENT, Availability.ONLINE, ['receitas']);
    }
    await mkUser('fabio', Role.AGENT, Availability.ONLINE, ['resultados', 'ultrassom']);
    await mkUser('otavio', Role.AGENT, Availability.OFFLINE, ['endosc']);
    await mkUser('gabi', Role.AGENT, Availability.ONLINE, ['oftalmo']);
    await mkUser('hugo', Role.AGENT, Availability.ONLINE, ['oftalmo']);
    await mkUser('sueli', Role.SUPERVISOR, Availability.ONLINE, ['cirurgia']);
    await mkUser('jonas', Role.AGENT, Availability.ONLINE, ['pedidos']);
  });

  afterAll(async () => {
    const companies = { in: [companyId, otherCompanyId] };
    await prisma.auditLog.deleteMany({ where: { companyId: companies } });
    await prisma.notification.deleteMany({ where: { companyId: companies } });
    await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });
    await prisma.conversation.deleteMany({ where: { companyId: companies } });
    await prisma.contact.deleteMany({ where: { companyId: companies } });
    await prisma.queue.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.department.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companies } });
    await app.close();
  });

  it('cinco atendentes pedindo ao mesmo tempo, com cinco conversas na fila: cada um recebe uma diferente', async () => {
    const queue: string[] = [];
    for (let i = 0; i < 5; i++) queue.push(await mkWaiting('receitas', 10 + i));
    // Esperam há mais tempo que todas, mas não são dos setores deles
    const otherDepartment = await mkWaiting('outras', 60);
    const noDepartment = await mkWaiting(null, 60);

    const pickers = ['ana', 'bruno', 'carla', 'davi', 'elisa'];
    const responses = await Promise.all(pickers.map(next));

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const got = responses.map((r) => r.data.id);
    expect(new Set(got).size).toBe(5);
    expect([...got].sort()).toEqual([...queue].sort());
    for (const [i, res] of responses.entries()) {
      expect(res.data).toMatchObject({ status: 'OPEN', agent: { id: users[pickers[i]].id } });
      expect(await prisma.conversation.findUniqueOrThrow({ where: { id: res.data.id } })).toMatchObject({
        status: ConversationStatus.OPEN,
        agentId: users[pickers[i]].id,
        waitSlaDueAt: null,
      });
    }
    // Um ciclo por conversa na auditoria, com o prazo da fila e o estouro
    const cycles = await prisma.auditLog.findMany({
      where: { entityId: { in: queue }, action: 'conversation.attended' },
    });
    expect(cycles).toHaveLength(5);
    cycles.forEach((c) => expect(c.after).toMatchObject({ maxWaitSecs: 300, breached: true }));

    // Acabou a fila dos setores deles: 204, sem corpo — e o resto segue esperando
    const empty = await next('ana');
    expect(empty.status).toBe(204);
    expect(empty.data).toBe('');
    await stillWaiting(otherDepartment);
    await stillWaiting(noDepartment);
  });

  it('entrega sempre a que espera há mais tempo, somando os setores de quem pede', async () => {
    const resultados30 = await mkWaiting('resultados', 30);
    const resultados10 = await mkWaiting('resultados', 10);
    const ultrassom20 = await mkWaiting('ultrassom', 20);

    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await next('fabio');
      expect(res.status).toBe(200);
      order.push(res.data.id);
    }

    expect(order).toEqual([resultados30, ultrassom20, resultados10]);
    expect((await next('fabio')).status).toBe(204);
  });

  it('Offline não pega da fila: 409 "Fique Online para atender"', async () => {
    const id = await mkWaiting('endosc', 5);

    const res = await next('otavio');

    expect(res.status).toBe(409);
    expect(res.data.message).toBe('Fique Online para atender');
    await stillWaiting(id);
  });

  it('Atender e Pegar próxima disputando a única conversa da fila: só um fica com ela', async () => {
    const id = await mkWaiting('oftalmo', 5);

    const [attend, picked] = await Promise.all([call('POST', `/conversations/${id}/attend`, 'gabi'), next('hugo')]);

    // Ou o Atender venceu (o Pegar próxima não acha mais nada: 204), ou o
    // Pegar próxima venceu (o Atender recebe 409 com o nome)
    expect([
      [200, 204],
      [409, 200],
    ]).toContainEqual([attend.status, picked.status]);
    const winner = attend.status === 200 ? users.gabi : users.hugo;
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id } })).agentId).toBe(winner.id);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'conversation.attended' } })).toBe(1);
  });

  it('supervisor também pega só dos setores de que é membro', async () => {
    const own = await mkWaiting('cirurgia', 5);
    const notMember = await mkWaiting('outras', 90);

    const res = await next('sueli');

    expect(res.status).toBe(200);
    expect(res.data.id).toBe(own);
    expect((await next('sueli')).status).toBe(204);
    await stillWaiting(notMember);
  });

  it('conversa de outra empresa nunca vem, mesmo apontando para o setor de quem pede', async () => {
    // Cenário forçado: o SQL do "Pegar próxima" roda sem o RLS (B-83), e só o
    // companyId do WHERE separa as empresas
    const foreign = await mkWaiting('pedidos', 120, otherCompanyId);

    const res = await next('jonas');

    expect(res.status).toBe(204);
    await stillWaiting(foreign);
  });
});
