import { PrismaClient } from '../../generated/prisma/client';
import { getTenantId } from '../tenant/tenant-context';

// ── B-83 (M-19 / B-41): Row-Level Security como rede de proteção ────────────
// Papel do Postgres criado pela migration b83: sem login, sem BYPASSRLS, com
// política `companyId = current_company_id()` nas tabelas com companyId (e
// `id = ...` em companies). O usuário da aplicação é dono das tabelas (e
// superusuário no container), então o RLS não vale para ele — a consulta só
// fica sujeita às políticas quando roda com este papel.
export const TENANT_DB_ROLE = 'atendehub_tenant';

// Com empresa no contexto, cada operação vira uma transação curta:
//   set_config('app.current_company_id') + SET LOCAL ROLE + a consulta.
// SET LOCAL e set_config(..., true) valem só dentro da transação: a conexão
// volta limpa para o pool. Assim, um `where` que esqueça o companyId ainda
// não alcança linhas de outra empresa.
//
// Limites (ADR-0010 v1.1): operação já dentro de uma transação explícita
// ($transaction) e SQL cru ($queryRaw/$executeRaw) seguem sem o papel — não
// há como injetar o SET na transação de quem chamou —, assim como tudo o que
// roda sem empresa no contexto (login, cadastro, webhook, jobs).
export function withTenantRls<T extends PrismaClient>(base: T): T {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations(params) {
          const { args, query } = params;
          const inTransaction = Boolean(
            (params as { __internalParams?: { transaction?: unknown } }).__internalParams?.transaction,
          );
          const companyId = getTenantId();
          if (!companyId || inTransaction) return query(args);

          const [, , result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.current_company_id', ${companyId}, true)`,
            base.$executeRawUnsafe(`SET LOCAL ROLE ${TENANT_DB_ROLE}`),
            query(args),
          ]);
          return result;
        },
      },
    },
  }) as unknown as T;
}
