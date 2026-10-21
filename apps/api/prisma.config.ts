import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// B-86 (Prisma 7): a configuração do CLI saiu do schema.prisma, e o CLI não lê
// mais o .env sozinho. A variável já definida no ambiente (CI, container) vale
// mais que a do arquivo.
config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `process.env` e não `env()`: o `env()` falha quando a variável não existe,
  // e o `prisma generate` roda sem banco (build da imagem, job de testes da CI)
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
