-- ─────────────────────────────────────────────────────────────────────────────
-- AtendeHub — Inicialização do PostgreSQL
-- Executado automaticamente na primeira vez que o container sobe
-- ─────────────────────────────────────────────────────────────────────────────

-- Banco dedicado da Evolution API (não pode compartilhar o banco da API:
-- ambos usam Prisma e colidem na tabela _prisma_migrations).
-- B-83 (M-19): sem OWNER fixo — o dono é quem roda este script (o
-- POSTGRES_USER do container). Antes, `OWNER atendehub` quebrava a 1ª subida
-- com qualquer outro POSTGRES_USER.
CREATE DATABASE evolution;

-- Habilita extensão para UUIDs (Prisma usa cuid por padrão, mas é boa prática)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Habilita extensão para busca full-text em português
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Row-Level Security helper ────────────────────────────────────────────────
-- Função utilitária: retorna o companyId da sessão atual. As políticas de RLS
-- (e a própria função, de novo) são criadas pela migration
-- b83_rls_tenant_isolation — este script só roda na 1ª subida do container.
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS TEXT AS $$
  SELECT current_setting('app.current_company_id', true);
$$ LANGUAGE sql STABLE;
