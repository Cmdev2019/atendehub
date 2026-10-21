import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { MAX_ACTIVE_DEPARTMENTS } from '../src/modules/department/department.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * B-116 (decisão do responsável em 2026-10-21) — os setores são criados pelo
 * admin conforme a necessidade, até 20 ativos por empresa, pela API HTTP de
 * verdade (AppModule inteiro e Postgres real).
 *
 * O limite só se prova com concorrência real: com 18 setores ativos, cinco
 * criações ao mesmo tempo deixam passar exatamente duas — a trava na linha da
 * empresa enfileira as contagens (ADR-0004).
 */
const agent = new http.Agent({ keepAlive: false });

describe('Limite de setores ativos por empresa (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const run = randomUUID().slice(0, 8);
  let companyId: string;
  let inactiveId: string;
  const users: Record<string, string> = {};

  const call = (method: string, path: string, who: string, data?: unknown) =>
    axios.request({
      method,
      url: `${base}/api/v1${path}`,
      data,
      headers: { authorization: `Bearer ${users[who]}` },
      httpAgent: agent,
      validateStatus: () => true,
    });

  const activeCount = () => prisma.department.count({ where: { companyId, isActive: true } });

  const mkUser = async (key: string, role: Role) => {
    const u = await prisma.user.create({
      data: { companyId, name: key, email: `${key}-${run}@e2e.test`, passwordHash: 'x', role },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
    users[key] = (await app.get(AuthService).login(u)).accessToken;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);

    companyId = (await prisma.company.create({ data: { name: 'E2E B-116', slug: `e2e-b116-${run}` } })).id;
    // Dois abaixo do limite, mais um desativado (não ocupa vaga)
    await prisma.department.createMany({
      data: Array.from({ length: MAX_ACTIVE_DEPARTMENTS - 2 }, (_, i) => ({ companyId, name: `Setor ${i + 1}` })),
    });
    inactiveId = (await prisma.department.create({ data: { companyId, name: 'Setor desativado', isActive: false } })).id;

    await mkUser('admin', Role.ADMIN);
    await mkUser('sueli', Role.SUPERVISOR);
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.department.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await app.close();
  });

  it('cinco criações ao mesmo tempo com duas vagas: exatamente duas passam, as outras recebem 400 com o motivo', async () => {
    const names = ['Receitas', 'Ultrassom', 'Resultados', 'Pedidos', 'Oftalmo'];

    const responses = await Promise.all(names.map((name) => call('POST', '/departments', 'admin', { name })));

    expect(responses.filter((r) => r.status === 201)).toHaveLength(2);
    const refused = responses.filter((r) => r.status === 400);
    expect(refused).toHaveLength(3);
    refused.forEach((r) =>
      expect(r.data.message).toBe(
        `Limite de ${MAX_ACTIVE_DEPARTMENTS} setores ativos atingido. Desative ou exclua um setor para abrir outro`,
      ),
    );
    expect(await activeCount()).toBe(MAX_ACTIVE_DEPARTMENTS);
  });

  it('com o limite cheio, reativar também é recusado; desativar um setor libera a vaga', async () => {
    expect((await call('PATCH', `/departments/${inactiveId}`, 'admin', { isActive: true })).status).toBe(400);

    const someActive = await prisma.department.findFirstOrThrow({ where: { companyId, isActive: true } });
    expect((await call('PATCH', `/departments/${someActive.id}`, 'admin', { isActive: false })).status).toBe(200);
    expect((await call('PATCH', `/departments/${inactiveId}`, 'admin', { isActive: true })).status).toBe(200);

    expect(await activeCount()).toBe(MAX_ACTIVE_DEPARTMENTS);
  });

  it('só o admin cria setores: supervisor recebe 403', async () => {
    const someActive = await prisma.department.findFirstOrThrow({ where: { companyId, isActive: true } });
    await call('PATCH', `/departments/${someActive.id}`, 'admin', { isActive: false }); // abre uma vaga

    expect((await call('POST', '/departments', 'sueli', { name: 'Financeiro' })).status).toBe(403);
    expect(await activeCount()).toBe(MAX_ACTIVE_DEPARTMENTS - 1);
  });
});
