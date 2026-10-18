-- B-83 (M-19 / B-41): Row-Level Security como rede de proteção do isolamento
-- entre empresas. O usuário da aplicação é dono das tabelas (e superusuário no
-- container do Postgres), e o RLS não vale para ele. As consultas de
-- requisição autenticada passam a rodar com o papel `atendehub_tenant`
-- (SET LOCAL ROLE, na extensão do Prisma), que só enxerga a empresa gravada em
-- app.current_company_id. Sem esse papel (login, webhook, jobs, migrations),
-- nada muda.

-- Papel sem login e sem BYPASSRLS. É global no cluster: pode já existir
-- (outro banco no mesmo servidor, como o de testes).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atendehub_tenant') THEN
    CREATE ROLE atendehub_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- Quem roda a aplicação precisa poder assumir o papel (SET ROLE). Superusuário
-- já pode; num Postgres gerenciado, sem superusuário, é este GRANT.
GRANT atendehub_tenant TO CURRENT_USER;

-- Schema da aplicação = o da migration (o ?schema= do DATABASE_URL; não é
-- necessariamente o public).
DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO atendehub_tenant', s);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO atendehub_tenant', s);
  EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO atendehub_tenant', s);
  -- Tabelas criadas por migrations futuras (mesmo usuário) já nascem com acesso
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atendehub_tenant', s);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO atendehub_tenant', s);
END
$$;

-- Empresa da transação atual (o infra/postgres/init.sql cria a mesma função,
-- mas só roda na 1ª subida do container — a migration garante em qualquer banco)
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS TEXT AS $$
  SELECT current_setting('app.current_company_id', true);
$$ LANGUAGE sql STABLE;

-- companies: a própria empresa
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "companies" TO atendehub_tenant
  USING ("id" = current_company_id())
  WITH CHECK ("id" = current_company_id());

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "users" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "departments" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "queues" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "queues" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "auto_attendance_flows" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "auto_attendance_flows" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "whatsapp_connections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whatsapp_connections" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contacts" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversations" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tags" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "webhooks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "webhooks" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs" TO atendehub_tenant
  USING ("companyId" = current_company_id())
  WITH CHECK ("companyId" = current_company_id());
