import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '../src/generated/prisma/client';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * M-08/B-72 — Sessões depois de troca e reset de senha, pela API HTTP real.
 *
 * Antes, trocar ou resetar a senha não encerrava nada: o access token antigo
 * seguia valendo até expirar e o refresh token, por até 7 dias. Aqui cada
 * usuário tem duas sessões abertas ("notebook" e "celular"); a troca feita
 * em uma precisa derrubar a outra.
 *
 * As sessões saem direto do AuthService, não de POST /auth/login: o login
 * tem limite de 5 por minuto por IP, e o http-authz.e2e já gasta quase
 * todos rodando em paralelo.
 */
const agent = new http.Agent({ keepAlive: false });
const PASSWORD = 'Senha-e2e-B72!';

describe('Sessões após troca/reset de senha (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let base: string;
  const run = randomUUID().slice(0, 8);
  let companyId: string;

  const request = (method: string, path: string, token?: string, data?: unknown) =>
    axios.request({
      method,
      url: `${base}/api/v1${path}`,
      data,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      httpAgent: agent,
      validateStatus: () => true,
    });

  const mkUser = async (key: string, role: Role) => {
    const hash = await bcrypt.hash(PASSWORD, 4);
    const u = await prisma.user.create({
      data: { companyId, name: key, email: `${key}-${run}@e2e.test`, passwordHash: hash, role },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
    return u;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);

    companyId = (
      await prisma.company.create({ data: { name: 'E2E B-72', slug: `e2e-b72-${run}` } })
    ).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await app.close();
  });

  it('troca da própria senha derruba a outra sessão e mantém a atual com tokens novos', async () => {
    const user = await mkUser('ana', Role.AGENT);
    const notebook = await auth.login(user);
    const celular = await auth.login(user);
    expect((await request('GET', '/auth/me', celular.accessToken)).status).toBe(200);

    // iat é em segundos — garante que a troca acontece num segundo depois da
    // emissão dos tokens antigos.
    await new Promise((r) => setTimeout(r, 1100));

    const change = await request('PATCH', `/users/${user.id}/password`, notebook.accessToken, {
      currentPassword: PASSWORD,
      newPassword: 'Senha-nova-B72!',
    });
    expect(change.status).toBe(200);
    expect(change.data.accessToken).toBeTruthy();
    expect(change.data.refreshToken).toBeTruthy();

    // A outra sessão caiu: access token e refresh token.
    expect((await request('GET', '/auth/me', celular.accessToken)).status).toBe(401);
    expect(
      (await request('POST', '/auth/refresh', undefined, { refreshToken: celular.refreshToken })).status,
    ).toBe(401);
    // O token antigo do próprio notebook também.
    expect((await request('GET', '/auth/me', notebook.accessToken)).status).toBe(401);

    // O par novo devolvido pela troca funciona e renova.
    expect((await request('GET', '/auth/me', change.data.accessToken)).status).toBe(200);
    const renewed = await request('POST', '/auth/refresh', undefined, {
      refreshToken: change.data.refreshToken,
    });
    expect(renewed.status).toBe(200);
  });

  it('reset administrativo derruba as sessões do usuário resetado', async () => {
    const admin = await mkUser('admin', Role.ADMIN);
    const agente = await mkUser('bruno', Role.AGENT);
    const adminSession = await auth.login(admin);
    const agenteSession = await auth.login(agente);

    await new Promise((r) => setTimeout(r, 1100));

    const reset = await request('POST', `/users/${agente.id}/reset-password`, adminSession.accessToken);
    expect(reset.status).toBe(200);

    expect((await request('GET', '/auth/me', agenteSession.accessToken)).status).toBe(401);
    expect(
      (await request('POST', '/auth/refresh', undefined, { refreshToken: agenteSession.refreshToken }))
        .status,
    ).toBe(401);
    // Quem resetou continua logado.
    expect((await request('GET', '/auth/me', adminSession.accessToken)).status).toBe(200);
  });

  it('refresh token não serve como access token', async () => {
    const user = await mkUser('carla', Role.AGENT);
    const session = await auth.login(user);

    expect((await request('GET', '/auth/me', session.refreshToken)).status).toBe(401);
  });
});
