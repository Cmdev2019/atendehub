import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { applyHttpPipeline } from '../src/shared/http/http-pipeline';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { runAsSystem, runWithTenant } from '../src/shared/tenant/tenant-context';

// Rota só do teste, com o "bug" que o RLS precisa conter: lista contatos pelo
// id SEM filtrar por empresa. Passa pelo mesmo caminho de qualquer rota real
// (guard JWT → TenantContextInterceptor → Prisma com a extensão). Uma versão
// aguarda a consulta e a outra devolve a PrismaPromise crua (sem await), que
// só executa quando o Nest a consome.
@Controller('__e2e_b83')
class LeakyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('contatos')
  async contatos(@Query('ids') ids: string) {
    return await this.prisma.contact.findMany({ where: { id: { in: ids.split(',') } }, select: { id: true } });
  }

  @Get('contatos-sem-await')
  contatosSemAwait(@Query('ids') ids: string) {
    return this.prisma.contact.findMany({ where: { id: { in: ids.split(',') } }, select: { id: true } });
  }
}

/**
 * M-19/B-83 (B-41) — Row-Level Security como rede de proteção.
 *
 * Critério de aceite do B-41: com o contexto da empresa A, uma consulta que
 * ESQUECE o filtro por companyId não alcança linhas da empresa B — em cada uma
 * das tabelas com companyId (e em companies). Usa o PrismaService da aplicação
 * (o mesmo cliente com a extensão do RLS que os services recebem) contra o
 * Postgres de verdade.
 */
describe('RLS — isolamento entre empresas no banco (E2E)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const run = randomUUID().slice(0, 8);
  const ids: Record<'A' | 'B', Record<string, string>> = { A: {}, B: {} };

  // Cada tabela com companyId: como criar uma linha e como contar sem filtro
  const seed = async (side: 'A' | 'B') => {
    const companyId = (
      await prisma.company.create({ data: { name: `E2E B-83 ${side}`, slug: `e2e-b83-${side}-${run}` } })
    ).id;
    const r = ids[side];
    r.company = companyId;
    r.user = (
      await prisma.user.create({
        data: { companyId, name: side, email: `b83-${side.toLowerCase()}-${run}@e2e.test`, passwordHash: 'x' },
      })
    ).id;
    r.department = (await prisma.department.create({ data: { companyId, name: `Dept ${side}` } })).id;
    r.queue = (await prisma.queue.create({ data: { companyId, name: `Fila ${side}` } })).id;
    r.autoAttendanceFlow = (await prisma.autoAttendanceFlow.create({ data: { companyId } })).id;
    r.whatsAppConnection = (
      await prisma.whatsAppConnection.create({
        data: { companyId, name: `Conn ${side}`, sessionName: `e2e-b83-${side}-${run}` },
      })
    ).id;
    r.contact = (
      await prisma.contact.create({ data: { companyId, name: `Contato ${side}`, phone: `55${Math.floor(Math.random() * 1e11)}` } })
    ).id;
    r.conversation = (await prisma.conversation.create({ data: { companyId, contactId: r.contact } })).id;
    r.tag = (await prisma.tag.create({ data: { companyId, name: `Tag ${side}` } })).id;
    r.webhook = (
      await prisma.webhook.create({ data: { companyId, name: 'wh', url: 'https://x.test', secret: 's' } })
    ).id;
    r.notification = (
      await prisma.notification.create({ data: { companyId, userId: r.user, type: 't', title: 't' } })
    ).id;
    r.auditLog = (
      await prisma.auditLog.create({ data: { companyId, action: 'a', entity: 'e', entityId: 'x' } })
    ).id;
  };

  const MODELS = [
    'user',
    'department',
    'queue',
    'autoAttendanceFlow',
    'whatsAppConnection',
    'contact',
    'conversation',
    'tag',
    'webhook',
    'notification',
    'auditLog',
  ] as const;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [LeakyController],
    }).compile();
    app = moduleRef.createNestApplication();
    applyHttpPipeline(app);
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = app.get(PrismaService);
    // Sem contexto: o seed enxerga e grava nas duas empresas
    await seed('A');
    await seed('B');
  });

  afterAll(async () => {
    const companyIds = [ids.A.company, ids.B.company].filter(Boolean);
    await prisma.refreshToken.deleteMany({ where: { user: { companyId: { in: companyIds } } } });
    for (const model of [...MODELS].reverse()) {
      await (prisma as any)[model].deleteMany({ where: { companyId: { in: companyIds } } });
    }
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await app.close();
  });

  // `await` dentro do contexto: a PrismaPromise é preguiçosa — só executa no
  // then(). Devolvê-la crua faria a consulta rodar já fora do contexto.
  const asA = <T>(fn: () => PromiseLike<T>) => runWithTenant(ids.A.company, async () => await fn());

  it('pela API HTTP: rota que esquece o companyId devolve só as linhas da empresa do usuário', async () => {
    const userA = await prisma.user.findUniqueOrThrow({ where: { id: ids.A.user } });
    const { accessToken } = await app.get(AuthService).login({ ...userA, role: userA.role });
    const agent = new http.Agent({ keepAlive: false });
    const qs = `ids=${ids.A.contact},${ids.B.contact}`;

    for (const path of ['contatos', 'contatos-sem-await']) {
      const res = await axios.get(`${base}/api/v1/__e2e_b83/${path}?${qs}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        httpAgent: agent,
      });
      expect(res.data.map((c: { id: string }) => c.id)).toEqual([ids.A.contact]);
    }
  });

  it.each(MODELS.map((m) => [m]))('%s: sem filtro por empresa, A só enxerga as próprias linhas', async (model) => {
    const delegate = (prisma as any)[model];
    const rows: { id: string; companyId: string }[] = await asA(() =>
      delegate.findMany({ where: { id: { in: [ids.A[model], ids.B[model]] } } }),
    );

    expect(rows.map((r) => r.id)).toEqual([ids.A[model]]);
    // findUnique pelo id da outra empresa também não acha
    expect(await asA(() => delegate.findUnique({ where: { id: ids.B[model] } }))).toBeNull();
  });

  it('companies: A só enxerga a própria empresa', async () => {
    const rows = await asA(() => prisma.company.findMany({ where: { id: { in: [ids.A.company, ids.B.company] } } }));
    expect(rows.map((r) => r.id)).toEqual([ids.A.company]);
  });

  it('escrita: A não altera nem apaga linha de B, e não cria linha em nome de B', async () => {
    const updated = await asA(() =>
      prisma.contact.updateMany({ where: { id: ids.B.contact }, data: { name: 'invadido' } }),
    );
    expect(updated.count).toBe(0);

    const deleted = await asA(() => prisma.tag.deleteMany({ where: { id: ids.B.tag } }));
    expect(deleted.count).toBe(0);

    await expect(
      asA(() => prisma.tag.create({ data: { companyId: ids.B.company, name: 'forjada' } })),
    ).rejects.toThrow(/row-level security/i);

    const contactB = await prisma.contact.findUnique({ where: { id: ids.B.contact } });
    expect(contactB?.name).not.toBe('invadido');
  });

  // Escape explícito (runAsSystem): o e-mail é único no sistema todo, então a
  // checagem precisa enxergar as outras empresas mesmo sob o RLS.
  it('pela API HTTP: e-mail já usado em outra empresa continua dando 409 com o motivo', async () => {
    const admin = await prisma.user.create({
      data: {
        companyId: ids.A.company,
        name: 'Admin A',
        email: `b83-admin-${run}@e2e.test`,
        passwordHash: 'x',
        role: 'ADMIN',
      },
    });
    const { accessToken } = await app.get(AuthService).login(admin);
    const res = await axios.post(
      `${base}/api/v1/users`,
      { name: 'Copia', email: `b83-b-${run}@e2e.test`, password: 'Senha-forte-1' },
      { headers: { authorization: `Bearer ${accessToken}` }, validateStatus: () => true, httpAgent: new http.Agent({ keepAlive: false }) },
    );

    expect(res.status).toBe(409);
    expect(res.data.message).toBe('Já existe um usuário com este e-mail');
  });

  it('sem contexto (webhook, jobs) e com runAsSystem, nada muda: enxerga as duas empresas', async () => {
    const ids2 = [ids.A.contact, ids.B.contact];
    expect(await prisma.contact.count({ where: { id: { in: ids2 } } })).toBe(2);
    expect(await asA(() => runAsSystem(() => prisma.contact.count({ where: { id: { in: ids2 } } })))).toBe(2);
  });

  it('a conexão volta limpa para o pool: depois do contexto de A, consulta sem contexto enxerga tudo', async () => {
    await asA(() => prisma.contact.count());
    const both = await prisma.contact.count({ where: { id: { in: [ids.A.contact, ids.B.contact] } } });
    expect(both).toBe(2);
  });
});
