import { AsyncLocalStorage } from 'async_hooks';

// ── B-83 (M-19 / B-41): empresa da requisição, para o RLS do Postgres ───────
// O TenantContextInterceptor grava aqui o companyId do usuário autenticado; a
// extensão do Prisma (tenant-rls.extension.ts) lê e faz cada consulta rodar
// com o papel `atendehub_tenant`, que só enxerga linhas dessa empresa. Fora
// de requisição autenticada (login, cadastro, webhook, jobs) não há empresa
// e nada muda.
interface TenantStore {
  companyId?: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantId(): string | undefined {
  return tenantStorage.getStore()?.companyId;
}

export function runWithTenant<T>(companyId: string, fn: () => T): T {
  return tenantStorage.run({ companyId }, fn);
}

// Escape explícito do RLS para checagens que precisam enxergar todas as
// empresas de propósito (ex.: e-mail único no sistema inteiro). Cada uso é
// uma decisão — procure por `runAsSystem` para auditar.
//
// O `await` fica DENTRO do contexto de propósito: a consulta do Prisma é
// preguiçosa (só executa no then()); devolvida crua, rodaria já fora do
// escape, de volta no contexto da empresa.
export function runAsSystem<T>(fn: () => PromiseLike<T> | T): Promise<T> {
  return tenantStorage.run({}, async () => await fn());
}
