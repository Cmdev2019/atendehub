-- Torna o e-mail do usuário único globalmente, não só por empresa (B-20).
-- O login (auth.service.ts#validateUser) busca por e-mail sem companyId — a
-- tela de login não pede empresa — então duas empresas com o mesmo e-mail
-- cadastrado resolveriam login de forma ambígua. Pré-requisito do
-- auto-cadastro público de empresas (B-9).
DROP INDEX "users_companyId_email_key";
DROP INDEX "users_email_idx";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
