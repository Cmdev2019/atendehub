# Testes de integração

## Objetivo

Verificar a colaboração entre componentes e a infraestrutura real — banco, fila, storage.

## Responsabilidade

Cobrir repositories, migrations, isolamento multi-tenant e processadores de fila com dependências reais.

## Conteúdo esperado

- Plano de teste desta natureza
- Casos de teste e massa de dados
- Evidências de execução, arquivadas por release
- Relatório consolidado com resultado e ações

## Quem utiliza

Desenvolvedores e QA.

## Quando utilizar

A cada PR que toque persistência ou fila.

## Quem pode alterar

QA e engenharia. Evidência de execução nunca é apagada — é arquivada por release.

## Estado atual

Ainda não existem. Testcontainers é a abordagem recomendada.

---

> Estratégia geral de qualidade em [`../../22-QA/README.md`](../../22-QA/README.md).
