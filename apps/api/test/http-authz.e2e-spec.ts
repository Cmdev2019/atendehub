import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { AccessSessionService } from '../src/modules/auth/access-session.service';
import { AuthService } from '../src/modules/auth/auth.service';

/**
 * M-22/B-63 — Autorização pela API HTTP de verdade (AppModule inteiro).
 *
 * A auditoria de 2026-10-16 encontrou 0% de cobertura em controllers, guards
 * e estratégias JWT — por isso falhas de papel (C-06) e de escopo (C-10)
 * passaram despercebidas. Este teste sobe a aplicação inteira (mesmo
 * AppModule e mesmo pipeline HTTP do main.ts), cria duas empresas
 * descartáveis e confere, requisição por requisição, papéis (@Roles), dono
 * do recurso, isolamento entre empresas e o escopo por departamento.
 *
 * Pré-requisito: Postgres, Redis e MinIO (como os demais e2e); na CI, o job
 * `api-e2e` sobe os três.
 */
const agent = new http.Agent({ keepAlive: false });
const PASSWORD = 'Senha-e2e-B63!';

describe('Autorização HTTP — papéis, dono do recurso, empresa e escopo (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const run = randomUUID().slice(0, 8);
  const companyIds: string[] = [];
  const users: Record<string, { id: string; token: string }> = {};
  const conv: Record<string, string> = {};
  const depts: Record<string, string> = {};

  const call = async (method: string, path: string, who?: string, data?: unknown) =>
    (
      await axios.request({
        method,
        url: `${base}/api/v1${path}`,
        data,
        headers: who ? { authorization: `Bearer ${users[who].token}` } : {},
        httpAgent: agent,
        validateStatus: () => true,
      })
    ).status;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const company = async (label: string) => {
      const c = await prisma.company.create({ data: { name: `E2E B-63 ${label}`, slug: `e2e-b63-${label}-${run}` } });
      companyIds.push(c.id);
      return c.id;
    };
    const A = await company('a');
    const B = await company('b');
    const jur = await prisma.department.create({ data: { companyId: A, name: 'Jurídico' } });
    const fin = await prisma.department.create({ data: { companyId: A, name: 'Financeiro' } });
    depts.jur = jur.id;
    depts.fin = fin.id;

    const mkUser = async (key: string, companyId: string, role: 'ADMIN' | 'SUPERVISOR' | 'AGENT', deptId?: string) => {
      const u = await prisma.user.create({
        data: {
          companyId, name: key, email: `${key.toLowerCase()}-${run}@e2e.test`, passwordHash: hash, role,
          ...(deptId && { departments: { connect: { id: deptId } } }),
        },
      });
      users[key] = { id: u.id, token: '' };
    };
    await mkUser('adminA', A, 'ADMIN');
    await mkUser('supervisorA', A, 'SUPERVISOR');
    await mkUser('agentJur', A, 'AGENT', jur.id);
    await mkUser('adminB', B, 'ADMIN');

    const mkConv = async (key: string, companyId: string, departmentId: string | null) => {
      const contact = await prisma.contact.create({ data: { companyId, phone: `55${Math.floor(Math.random() * 1e11)}`, name: key } });
      conv[key] = (await prisma.conversation.create({ data: { companyId, contactId: contact.id, departmentId } })).id;
    };
    await mkConv('juridico', A, jur.id);
    await mkConv('financeiro', A, fin.id);
    await mkConv('daEmpresaB', B, null);
    conv.conexaoA = (
      await prisma.whatsAppConnection.create({ data: { companyId: A, name: 'Conn A', sessionName: `e2e-b63-conn-${run}` } })
    ).id;

    // B-73 (M-07): contato com uma conversa RESOLVED e outra já ativa, e uma
    // conversa encerrada — o índice único parcial de conversa ativa só existe
    // no Postgres, então o 409 só se prova aqui.
    const repeat = await prisma.contact.create({ data: { companyId: A, phone: `55${Math.floor(Math.random() * 1e11)}`, name: 'repete' } });
    conv.resolvida = (await prisma.conversation.create({ data: { companyId: A, contactId: repeat.id, status: 'RESOLVED' } })).id;
    await prisma.conversation.create({ data: { companyId: A, contactId: repeat.id, status: 'WAITING' } });
    const closed = await prisma.contact.create({ data: { companyId: A, phone: `55${Math.floor(Math.random() * 1e11)}`, name: 'encerrada' } });
    conv.encerrada = (await prisma.conversation.create({ data: { companyId: A, contactId: closed.id, status: 'CLOSED' } })).id;

    for (const key of Object.keys(users)) {
      const res = await axios.post(
        `${base}/api/v1/auth/login`,
        { email: `${key.toLowerCase()}-${run}@e2e.test`, password: PASSWORD },
        { httpAgent: agent },
      );
      users[key].token = res.data.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.refreshToken.deleteMany({ where: { user: { companyId: { in: companyIds } } } });
    await prisma.conversation.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.contact.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.whatsAppConnection.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.department.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await app.close();
  });

  it('sem token, rotas protegidas respondem 401', async () => {
    expect(await call('GET', '/conversations')).toBe(401);
    expect(await call('GET', '/users')).toBe(401);
  });

  it.each([
    ['GET', '/audit-logs', 'ADMIN'],
    ['GET', '/users', 'SUPERVISOR'],
    ['GET', '/reports/attendance', 'SUPERVISOR'],
  ])('%s %s exige %s — AGENT recebe 403', async (method, path) => {
    expect(await call(method, path, 'agentJur')).toBe(403);
  });

  it('papéis permitidos passam nas mesmas rotas', async () => {
    expect(await call('GET', '/audit-logs', 'adminA')).toBe(200);
    expect(await call('GET', '/users', 'supervisorA')).toBe(200);
    expect(await call('GET', '/reports/attendance', 'supervisorA')).toBe(200);
  });

  it('SUPERVISOR não acessa rotas só de ADMIN', async () => {
    expect(await call('GET', '/audit-logs', 'supervisorA')).toBe(403);
    expect(await call('PATCH', '/company/me', 'supervisorA', { name: 'x' })).toBe(403);
  });

  it('dono do recurso: ninguém troca a senha de outro usuário (C-06/B-51)', async () => {
    const status = await call('PATCH', `/users/${users.adminA.id}/password`, 'agentJur', {
      currentPassword: PASSWORD,
      newPassword: 'Outra-senha-forte-1!',
    });
    expect(status).toBe(403);
  });

  it('isolamento entre empresas: ADMIN da empresa B não vê conversa da empresa A', async () => {
    expect(await call('GET', `/conversations/${conv.juridico}`, 'adminB')).toBe(404);
    expect(await call('GET', `/conversations/${conv.daEmpresaB}`, 'adminA')).toBe(404);
  });

  it('escopo por departamento (C-10/B-40): AGENT do Jurídico não alcança o Financeiro', async () => {
    expect(await call('GET', `/conversations/${conv.juridico}`, 'agentJur')).toBe(200);
    expect(await call('GET', `/conversations/${conv.financeiro}`, 'agentJur')).toBe(404);
    expect(await call('GET', `/conversations/${conv.financeiro}/messages`, 'agentJur')).toBe(404);
    expect(await call('POST', `/conversations/${conv.financeiro}/notes`, 'agentJur', { content: 'x' })).toBe(404);
    expect(await call('GET', `/conversations/${conv.financeiro}`, 'supervisorA')).toBe(200);
  });

  it('B-73 (M-07): atribuir conversa encerrada é 400; reativar com outra ativa do contato é 409', async () => {
    const body = { agentId: users.supervisorA.id };
    expect(await call('PATCH', `/conversations/${conv.encerrada}/assign`, 'adminA', body)).toBe(400);
    expect(await call('PATCH', `/conversations/${conv.resolvida}/assign`, 'adminA', body)).toBe(409);
    expect(await call('PATCH', `/conversations/${conv.resolvida}/status`, 'adminA', { status: 'OPEN' })).toBe(409);
  });

  // B-95 (L-06): os guards globais não rodam de novo no controller — antes,
  // cada requisição validava a sessão (banco + Redis) duas vezes.
  it('cada requisição autenticada valida a sessão uma vez só', async () => {
    const spy = jest.spyOn(app.get(AccessSessionService), 'validate');
    expect(await call('GET', '/users', 'supervisorA')).toBe(200);
    expect(await call('GET', `/conversations/${conv.juridico}`, 'agentJur')).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  // B-100 (L-12): sincronizar o status grava no banco — POST e só ADMIN
  it('sincronizar status da conexão é POST e só ADMIN; o GET antigo não existe mais', async () => {
    expect(await call('POST', `/whatsapp/${conv.conexaoA}/status`, 'agentJur')).toBe(403);
    expect(await call('POST', `/whatsapp/${conv.conexaoA}/status`, 'supervisorA')).toBe(403);
    expect(await call('GET', `/whatsapp/${conv.conexaoA}/status`, 'adminA')).toBe(404);
  });

  // B-102 (L-16): diagnóstico de dependências só para ADMIN
  it('diagnóstico de dependências: ADMIN vê as 4 checagens, AGENT recebe 403', async () => {
    expect(await call('GET', '/health/dependencies', 'agentJur')).toBe(403);
    const res = await axios.get(`${base}/api/v1/health/dependencies`, {
      headers: { authorization: `Bearer ${users.adminA.token}` },
      httpAgent: agent,
    });
    expect(Object.keys(res.data.checks).sort()).toEqual(['database', 'evolution', 'redis', 'storage']);
    expect(res.data.checks.database.status).toBe('up');
  });

  it('validação global: campo fora do DTO responde 400', async () => {
    expect(await call('PATCH', '/users/me', 'agentJur', { name: 'Novo nome', campoQueNaoExiste: 1 })).toBe(400);
  });

  // B-113 (ADR-0019, regra 22): setores escolhidos no cadastro do atendente
  it('setores no cadastro: com dois setores vê a fila dos dois; a lista substitui; setor de outra empresa é 400', async () => {
    const res = await axios.post(
      `${base}/api/v1/users`,
      { name: 'Dois Setores', email: `dois-setores-${run}@e2e.test`, password: PASSWORD, departmentIds: [depts.jur, depts.fin] },
      { headers: { authorization: `Bearer ${users.adminA.token}` }, httpAgent: agent, validateStatus: () => true },
    );
    expect(res.status).toBe(201);
    expect(res.data.departments.map((d: { id: string }) => d.id).sort()).toEqual([depts.jur, depts.fin].sort());

    // Sessão direto pelo AuthService: o POST /auth/login tem limite de 5 por minuto por IP
    const created = await prisma.user.findUniqueOrThrow({
      where: { id: res.data.id },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
    users.doisSetores = { id: created.id, token: (await app.get(AuthService).login(created)).accessToken };

    expect(await call('GET', `/conversations/${conv.juridico}`, 'doisSetores')).toBe(200);
    expect(await call('GET', `/conversations/${conv.financeiro}`, 'doisSetores')).toBe(200);

    // A lista substitui os setores: sem o Financeiro, a conversa dele sai do alcance na hora
    expect(await call('PATCH', `/users/${created.id}`, 'adminA', { departmentIds: [depts.jur] })).toBe(200);
    expect(await call('GET', `/conversations/${conv.financeiro}`, 'doisSetores')).toBe(404);

    // Setor de outra empresa não entra, nem no cadastro nem na edição
    const deptB = await prisma.department.create({ data: { companyId: companyIds[1], name: `Setor B ${run}` } });
    expect(await call('PATCH', `/users/${created.id}`, 'adminA', { departmentIds: [deptB.id] })).toBe(400);
    expect(
      await call('POST', '/users', 'adminA', {
        name: 'Outra', email: `outra-empresa-${run}@e2e.test`, password: PASSWORD, departmentIds: [deptB.id],
      }),
    ).toBe(400);
  });
});
