import { pgConfigFromUrl } from './pg-adapter';

// B-86: o que o engine do Prisma 5 lia da DATABASE_URL e o `pg` não lê
describe('pgConfigFromUrl (B-86)', () => {
  const params = (connectionString?: string) => new URL(connectionString ?? '').searchParams;

  it('?schema= vira o schema do adapter e o search_path da conexão', () => {
    const { pool, schema } = pgConfigFromUrl('postgresql://u:p@127.0.0.1:5432/atendehub?schema=atendehub');

    expect(schema).toBe('atendehub');
    expect(params(pool.connectionString).has('schema')).toBe(false);
    expect(params(pool.connectionString).get('options')).toBe('-c search_path=atendehub');
  });

  it('mantém o options que já vinha na URL', () => {
    const { pool } = pgConfigFromUrl('postgresql://u:p@db/x?schema=s1&options=-c%20statement_timeout%3D5000');

    expect(params(pool.connectionString).get('options')).toBe('-c statement_timeout=5000 -c search_path=s1');
  });

  it('sem ?schema=, fica no padrão do Postgres (public)', () => {
    const { pool, schema } = pgConfigFromUrl('postgresql://u:p@db:5432/x?sslmode=require');

    expect(schema).toBeUndefined();
    expect(params(pool.connectionString).has('options')).toBe(false);
    expect(params(pool.connectionString).get('sslmode')).toBe('require');
  });

  it('desiste de conectar em 5 s, como o Prisma 5 (o `pg` esperaria para sempre)', () => {
    expect(pgConfigFromUrl('postgresql://u:p@db/x').pool.connectionTimeoutMillis).toBe(5000);
  });

  it('sem DATABASE_URL: erro claro, não um pool apontando para o padrão do `pg`', () => {
    expect(() => pgConfigFromUrl(undefined)).toThrow('DATABASE_URL não definida');
  });
});
