#!/usr/bin/env node
// ── B-89 (M-24): números do projeto, contados do código ─────────────────────
// A auditoria de 2026-10-16 achou contagens diferentes em cada documento
// (testes, rotas, módulos, migrations), porque cada uma envelhecia num ritmo.
// Agora os documentos não fixam números: apontam para este script, que a CI
// roda e publica no resumo do job (web-ci.yml).
//
//   node scripts/project-stats.mjs            → tabela em Markdown
//   node scripts/project-stats.mjs --json     → JSON
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function walk(dir, filter, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'coverage' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, filter, acc);
    else if (filter(full)) acc.push(full);
  }
  return acc;
}

const read = (f) => readFileSync(f, 'utf8');
// Casos de teste declarados: it(...), test(...) e cada linha de it.each/test.each
const countCases = (files) =>
  files.reduce((n, f) => n + (read(f).match(/^\s*(it|test)(\.each\([^)]*\))?\(/gm) ?? []).length, 0);

const api = join(root, 'apps/api');
const controllers = walk(join(api, 'src'), (f) => f.endsWith('.controller.ts'));
const routes = controllers.reduce(
  (n, f) => n + (read(f).match(/^\s*@(Get|Post|Put|Patch|Delete)\(/gm) ?? []).length,
  0,
);
const modules = walk(join(api, 'src/modules'), (f) => f.endsWith('.module.ts')).length;
const migrations = readdirSync(join(api, 'prisma/migrations')).filter((d) =>
  statSync(join(api, 'prisma/migrations', d)).isDirectory(),
).length;
const apiUnit = walk(join(api, 'src'), (f) => f.endsWith('.spec.ts'));
const apiE2e = walk(join(api, 'test'), (f) => f.endsWith('.e2e-spec.ts'));
const webTests = walk(join(root, 'src'), (f) => /\.test\.jsx?$/.test(f));
const adrs = readdirSync(join(root, 'docs/05-ADR')).filter((f) => /^ADR-\d{4}-/.test(f) && !f.startsWith('ADR-0000'));

const stats = {
  'Módulos da API (apps/api/src/modules)': modules,
  'Rotas HTTP (decorators nos controllers)': routes,
  'Migrations do Prisma': migrations,
  'Testes unitários da API (arquivos / casos declarados)': `${apiUnit.length} / ${countCases(apiUnit)}`,
  'Testes e2e da API (arquivos / casos declarados)': `${apiE2e.length} / ${countCases(apiE2e)}`,
  'Testes do front (arquivos / casos declarados)': `${webTests.length} / ${countCases(webTests)}`,
  'ADRs (sem o modelo)': adrs.length,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(stats, null, 2));
} else {
  console.log('| Item | Valor |\n|---|---|');
  for (const [k, v] of Object.entries(stats)) console.log(`| ${k} | ${v} |`);
  console.log('\n_Casos declarados contam `it.each` como 1; o total executado sai no log do Jest._');
}
