# 30-Deploy — Deploy

## Objetivo

Documentar o procedimento de implantação e a estratégia de liberação.

## Responsabilidade

Tornar o deploy uma operação previsível, ensaiada e reversível.

## Conteúdo esperado

- Procedimento de deploy por ambiente
- Estratégia de liberação (canário, blue-green)
- Procedimento de migração de banco durante deploy
- Critérios de rollback e como executá-lo
- Checklist pré e pós-deploy

## Quem utiliza

DevOps, engenharia, plantão.

## Quando utilizar

A cada deploy; ao ensaiar rollback.

## Quem pode alterar

DevOps. O procedimento só é oficial depois de ter sido executado com sucesso em homologação.

## Estado atual

Deploy hoje é manual. Pipeline de promoção proposto na seção 11.6 do plano de evolução.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
