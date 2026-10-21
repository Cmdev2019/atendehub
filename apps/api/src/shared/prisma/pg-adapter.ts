import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';

// ── B-86 (Prisma 7): o cliente fala com o Postgres pelo `pg` ────────────────
// O Prisma 7 não tem mais engine próprio para as consultas: elas passam por um
// driver adapter. O que o engine fazia sozinho a partir da DATABASE_URL passa
// a ser feito aqui:
//   - `?schema=`: o `pg` não conhece o parâmetro. O adapter recebe o schema
//     para as consultas que o Prisma monta, e a conexão abre com o
//     `search_path` nele, porque o SQL cru ($queryRaw) usa nomes sem schema;
//   - prazo para conectar: o `pg` espera para sempre, o engine desistia em
//     5 s. Sem prazo, o /health/ready ficaria pendurado com o banco fora.
const CONNECT_TIMEOUT_MS = 5_000;

export function pgConfigFromUrl(databaseUrl: string | undefined): { pool: PoolConfig; schema?: string } {
  if (!databaseUrl) throw new Error('DATABASE_URL não definida');
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? undefined;
  if (schema) {
    url.searchParams.delete('schema');
    const options = url.searchParams.get('options');
    url.searchParams.set('options', [options, `-c search_path=${schema}`].filter(Boolean).join(' '));
  }
  return { pool: { connectionString: url.toString(), connectionTimeoutMillis: CONNECT_TIMEOUT_MS }, schema };
}

export function createPgAdapter(databaseUrl = process.env.DATABASE_URL): PrismaPg {
  const { pool, schema } = pgConfigFromUrl(databaseUrl);
  return new PrismaPg(pool, { schema });
}
