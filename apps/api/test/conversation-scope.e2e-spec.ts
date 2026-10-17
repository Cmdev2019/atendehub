import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ConversationScopeService } from '../src/shared/conversation-scope/conversation-scope.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';

/**
 * C-10/B-40 — Teste E2E do escopo de conversas (Postgres real).
 *
 * Empresa descartável com dois departamentos (Jurídico e Financeiro), um
 * atendente em cada um e quatro conversas: uma por departamento, uma sem
 * departamento e uma do Financeiro atribuída ao atendente do Jurídico. Confere
 * que o filtro gerado pelo ConversationScopeService, aplicado numa consulta de
 * verdade, devolve exatamente o que cada papel pode ver.
 *
 * Pré-requisito: Postgres em localhost:5432 com as migrations aplicadas.
 */
describe('Escopo de conversas por departamento (E2E, Postgres real)', () => {
  jest.setTimeout(30000);

  let module: TestingModule;
  let prisma: PrismaService;
  let scope: ConversationScopeService;
  let companyId: string;
  const ids: Record<string, string> = {};
  const users: Record<string, { id: string; companyId: string; role: Role }> = {};

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })],
      providers: [PrismaService, ConversationScopeService],
    }).compile();
    await module.init();
    prisma = module.get(PrismaService);
    scope = module.get(ConversationScopeService);

    const run = randomUUID().slice(0, 8);
    companyId = (await prisma.company.create({ data: { name: 'E2E B-40', slug: `e2e-b40-spec-${run}` } })).id;
    const jur = await prisma.department.create({ data: { companyId, name: 'Jurídico' } });
    const fin = await prisma.department.create({ data: { companyId, name: 'Financeiro' } });

    const mkUser = async (key: string, role: Role, departmentId?: string) => {
      const u = await prisma.user.create({
        data: {
          companyId,
          name: key,
          email: `${key}-${run}@e2e.test`,
          passwordHash: 'x',
          role,
          ...(departmentId && { departments: { connect: { id: departmentId } } }),
        },
      });
      users[key] = { id: u.id, companyId, role };
    };
    await mkUser('supervisor', Role.SUPERVISOR);
    await mkUser('agJur', Role.AGENT, jur.id);
    await mkUser('agFin', Role.AGENT, fin.id);

    const mkConv = async (key: string, departmentId: string | null, agentId: string | null) => {
      const contact = await prisma.contact.create({
        data: { companyId, phone: `55${Math.floor(Math.random() * 1e11)}`, name: key },
      });
      ids[key] = (await prisma.conversation.create({ data: { companyId, contactId: contact.id, departmentId, agentId } })).id;
    };
    await mkConv('juridico', jur.id, null);
    await mkConv('financeiro', fin.id, null);
    await mkConv('semDepto', null, null);
    await mkConv('finDoAgJur', fin.id, users.agJur.id);
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { companyId } });
    await prisma.contact.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.department.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await module.close();
  });

  const visible = async (user: { id: string; role: Role }) => {
    const rows = await prisma.conversation.findMany({
      where: { AND: [{ companyId }, await scope.conversationWhere(user)] },
      select: { id: true },
    });
    const names = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
    return rows.map((r) => names[r.id]).sort();
  };

  it('SUPERVISOR vê as quatro', async () => {
    expect(await visible(users.supervisor)).toEqual(['finDoAgJur', 'financeiro', 'juridico', 'semDepto']);
  });

  it('AGENT do Jurídico vê Jurídico, sem departamento e a atribuída a ele', async () => {
    expect(await visible(users.agJur)).toEqual(['finDoAgJur', 'juridico', 'semDepto']);
  });

  it('AGENT do Financeiro vê o Financeiro e sem departamento — nunca o Jurídico', async () => {
    expect(await visible(users.agFin)).toEqual(['finDoAgJur', 'financeiro', 'semDepto']);
  });

  it('acesso direto fora do escopo responde 404; dentro, passa', async () => {
    await expect(scope.assertAccess(users.agJur, ids.financeiro)).rejects.toBeInstanceOf(NotFoundException);
    await expect(scope.assertAccess(users.agJur, ids.juridico)).resolves.toBeUndefined();
    await expect(scope.assertAccess(users.supervisor, ids.financeiro)).resolves.toBeUndefined();
  });

  it('trocar o departamento do atendente vale na hora (sem novo login)', async () => {
    const fin = await prisma.conversation.findUniqueOrThrow({ where: { id: ids.financeiro }, select: { departmentId: true } });
    await prisma.user.update({
      where: { id: users.agJur.id },
      data: { departments: { connect: { id: fin.departmentId! } } },
    });

    await expect(scope.assertAccess(users.agJur, ids.financeiro)).resolves.toBeUndefined();
  });
});
