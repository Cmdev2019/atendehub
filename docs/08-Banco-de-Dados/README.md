# 08-Banco-de-Dados — Banco de dados

## Objetivo

Documentar o modelo de dados, a estratégia de migração e as políticas de acesso.

## Responsabilidade

Ser a referência sobre o esquema e sobre como evoluí-lo sem downtime nem perda de dado.

## Conteúdo esperado

- Modelo de dados e diagrama ER
- Dicionário de dados (tabela, coluna, tipo, significado, PII sim/não)
- Estratégia de migração expand/contract
- Política de índices e justificativa de cada um
- Row-Level Security e isolamento multi-tenant
- Política de retenção, arquivamento e anonimização

## Quem utiliza

Backend, DBA, DevOps, encarregado de dados (LGPD).

## Quando utilizar

Antes de qualquer migration; ao investigar performance; em auditoria de conformidade.

## Quem pode alterar

Backend com revisão obrigatória do tech lead. Migration destrutiva exige aprovação explícita.

## Estado atual

Schema real em `apps/api/prisma/schema.prisma`: 17 modelos, 11 enums, 6 migrations aplicadas.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
