-- M-04/B-61: fuso horário por empresa. Até aqui tudo era calculado no fuso
-- do servidor (UTC no Docker): o expediente do auto-atendimento ficava
-- deslocado em 3 horas no Brasil, "resolvidas hoje" virava às 21h e o último
-- dia dos relatórios ficava de fora. Empresas existentes ficam com o padrão.
ALTER TABLE "companies" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
