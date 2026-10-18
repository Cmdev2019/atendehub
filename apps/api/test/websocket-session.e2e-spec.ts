import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { EventsGateway } from '../src/modules/events/events.gateway';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * M-09/B-74 — Sessão no WebSocket, com a aplicação inteira e o Socket.IO real.
 *
 * Antes, o handshake só conferia a assinatura do token: logout, desativação
 * e troca de senha não tiravam ninguém do tempo real, e um socket aberto
 * seguia recebendo eventos para sempre. Aqui cada caso abre um socket de
 * verdade e confere quem conecta e quem é derrubado.
 *
 * Sessões saem do AuthService (não de POST /auth/login) pelo mesmo motivo do
 * auth-sessions.e2e: o limite de 5 logins por minuto por IP.
 */
const agent = new http.Agent({ keepAlive: false });
const PASSWORD = 'Senha-e2e-B74!';

type Outcome = { connected: true } | { connected: false; message: string; code?: string };

describe('Sessão no WebSocket (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let base: string;
  const run = randomUUID().slice(0, 8);
  let companyId: string;
  const sockets: Socket[] = [];

  const connect = (token: string): Promise<{ socket: Socket; outcome: Outcome }> =>
    new Promise((resolve) => {
      const socket = io(`${base}/ws`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      socket.once('connected', () => resolve({ socket, outcome: { connected: true } }));
      socket.once('connect_error', (err: Error & { data?: { code?: string } }) =>
        resolve({ socket, outcome: { connected: false, message: err.message, code: err.data?.code } }),
      );
    });

  const disconnectReason = (socket: Socket, ms = 5000): Promise<string | null> =>
    new Promise((resolve) => {
      if (socket.disconnected) return resolve('already');
      const timer = setTimeout(() => resolve(null), ms);
      socket.once('disconnect', (reason) => {
        clearTimeout(timer);
        resolve(reason);
      });
    });

  const request = (method: string, path: string, token: string, data?: unknown) =>
    axios.request({
      method,
      url: `${base}/api/v1${path}`,
      data,
      headers: { authorization: `Bearer ${token}` },
      httpAgent: agent,
      validateStatus: () => true,
    });

  const mkUser = async (key: string, role: Role) => {
    const hash = await bcrypt.hash(PASSWORD, 4);
    return prisma.user.create({
      data: { companyId, name: key, email: `${key}-${run}@e2e.test`, passwordHash: hash, role },
      select: { id: true, companyId: true, name: true, email: true, role: true, avatarUrl: true },
    });
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
      await prisma.company.create({ data: { name: 'E2E B-74', slug: `e2e-b74-${run}` } })
    ).id;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await app.close();
  });

  it('access token válido conecta; refresh token e token inválido não', async () => {
    const user = await mkUser('ana', Role.AGENT);
    const session = await auth.login(user);

    expect((await connect(session.accessToken)).outcome).toEqual({ connected: true });
    // B-80: contagem pelo adapter (todas as réplicas), não por Map do processo
    expect(await app.get(EventsGateway).getConnectedCount()).toBeGreaterThanOrEqual(1);

    const withRefresh = (await connect(session.refreshToken)).outcome;
    expect(withRefresh).toEqual(expect.objectContaining({ connected: false, code: 'UNAUTHORIZED' }));

    const garbage = (await connect('nao-e-um-jwt')).outcome;
    expect(garbage).toEqual(expect.objectContaining({ connected: false, code: 'UNAUTHORIZED' }));
  });

  it('logout derruba o socket da sessão e o token não reconecta; a outra sessão segue', async () => {
    const user = await mkUser('bruno', Role.AGENT);
    const notebook = await auth.login(user);
    const celular = await auth.login(user);
    const { socket: nbSocket } = await connect(notebook.accessToken);
    const { socket: celSocket } = await connect(celular.accessToken);

    const nbDropped = disconnectReason(nbSocket);
    const logout = await request('POST', '/auth/logout', notebook.accessToken, {
      refreshToken: notebook.refreshToken,
    });
    expect(logout.status).toBe(204);
    expect(await nbDropped).toBe('io server disconnect');
    expect(celSocket.connected).toBe(true);

    const again = (await connect(notebook.accessToken)).outcome;
    expect(again).toEqual({ connected: false, message: 'Token foi revogado', code: 'UNAUTHORIZED' });
  });

  it('desativação derruba os sockets do usuário e impede nova conexão', async () => {
    const admin = await mkUser('admin', Role.ADMIN);
    const user = await mkUser('carla', Role.AGENT);
    const adminSession = await auth.login(admin);
    const session = await auth.login(user);
    const { socket } = await connect(session.accessToken);

    const dropped = disconnectReason(socket);
    expect((await request('DELETE', `/users/${user.id}`, adminSession.accessToken)).status).toBe(200);
    expect(await dropped).toBe('io server disconnect');

    const again = (await connect(session.accessToken)).outcome;
    expect(again).toEqual(expect.objectContaining({ connected: false, code: 'UNAUTHORIZED' }));
  });

  it('troca de senha derruba os outros sockets e mantém o da sessão que trocou', async () => {
    const user = await mkUser('davi', Role.AGENT);
    const notebook = await auth.login(user);
    const celular = await auth.login(user);
    const { socket: nbSocket } = await connect(notebook.accessToken);
    const { socket: celSocket } = await connect(celular.accessToken);

    // iat é em segundos — a troca precisa cair num segundo depois da emissão.
    await new Promise((r) => setTimeout(r, 1100));

    const celDropped = disconnectReason(celSocket);
    const change = await request('PATCH', `/users/${user.id}/password`, notebook.accessToken, {
      currentPassword: PASSWORD,
      newPassword: 'Senha-nova-B74!',
    });
    expect(change.status).toBe(200);
    expect(await celDropped).toBe('io server disconnect');
    expect(nbSocket.connected).toBe(true);

    // O par novo da resposta conecta; o token antigo do celular não.
    expect((await connect(change.data.accessToken)).outcome).toEqual({ connected: true });
    const old = (await connect(celular.accessToken)).outcome;
    expect(old).toEqual({ connected: false, message: 'Sessão encerrada', code: 'UNAUTHORIZED' });
  });
});
