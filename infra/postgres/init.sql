-- ─────────────────────────────────────────────────────────────────────────────
-- AtendeHub — Inicialização do PostgreSQL
-- Executado automaticamente na primeira vez que o container sobe
-- ─────────────────────────────────────────────────────────────────────────────

-- Banco dedicado da Evolution API (não pode compartilhar o banco da API:
-- ambos usam Prisma e colidem na tabela _prisma_migrations)
CREATE DATABASE evolution OWNER atendehub;

-- Habilita extensão para UUIDs (Prisma usa cuid por padrão, mas é boa prática)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Habilita extensão para busca full-text em português
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Row-Level Security helper ────────────────────────────────────────────────
-- Função utilitária: retorna o companyId da sessão atual
-- Usada pelas políticas de RLS em produção
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS TEXT AS $$
  SELECT current_setting('app.current_company_id', true);
$$ LANGUAGE sql STABLE;
