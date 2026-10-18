import { firstValueFrom, Observable } from 'rxjs';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { getTenantId, runAsSystem, runWithTenant } from './tenant-context';

// B-83 (M-19 / B-41): o handler roda no contexto da empresa do usuário — é
// dele que a extensão do Prisma tira o companyId para o RLS. O caminho
// completo (guard → interceptor → Prisma → Postgres) está no e2e
// rls-tenant-isolation.
describe('TenantContextInterceptor (B-83)', () => {
  const interceptor = new TenantContextInterceptor();
  const httpContext = (user?: { companyId: string }) =>
    ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;
  // Handler que lê o contexto de dentro, de forma assíncrona (como um service)
  const handler = { handle: () => new Observable((s) => void Promise.resolve().then(() => { s.next(getTenantId()); s.complete(); })) };

  it('com usuário autenticado, o handler enxerga a empresa dele', async () => {
    await expect(firstValueFrom(interceptor.intercept(httpContext({ companyId: 'company-a' }), handler))).resolves.toBe(
      'company-a',
    );
  });

  it('sem usuário (rota pública: login, webhook), não há empresa no contexto', async () => {
    await expect(firstValueFrom(interceptor.intercept(httpContext(undefined), handler))).resolves.toBeUndefined();
  });

  it('runAsSystem tira a empresa só durante a consulta, mesmo com promessa preguiçosa', async () => {
    await runWithTenant('company-a', async () => {
      const lazy = { then: (resolve: (v: unknown) => void) => resolve(getTenantId()) };
      await expect(runAsSystem(() => lazy as PromiseLike<unknown>)).resolves.toBeUndefined();
      expect(getTenantId()).toBe('company-a');
    });
  });
});
