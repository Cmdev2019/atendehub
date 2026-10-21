-- B-86 (Prisma 5 → 7): desde o Prisma 6, a tabela de junção de uma relação N:N
-- implícita no PostgreSQL tem chave primária (A, B) em vez de índice único.
-- Mesma garantia (o par não se repete); o schema gerado pelo Prisma 7 já
-- espera a chave, e o `migrate diff` acusava a diferença nas três tabelas.

-- Etiquetas do contato
ALTER TABLE "_ContactTags" ADD CONSTRAINT "_ContactTags_AB_pkey" PRIMARY KEY ("A", "B");
DROP INDEX "_ContactTags_AB_unique";

-- Etiquetas da conversa
ALTER TABLE "_ConversationTags" ADD CONSTRAINT "_ConversationTags_AB_pkey" PRIMARY KEY ("A", "B");
DROP INDEX "_ConversationTags_AB_unique";

-- Setores do usuário
ALTER TABLE "_UserDepartments" ADD CONSTRAINT "_UserDepartments_AB_pkey" PRIMARY KEY ("A", "B");
DROP INDEX "_UserDepartments_AB_unique";
