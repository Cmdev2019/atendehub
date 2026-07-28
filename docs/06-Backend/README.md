# 06-Backend — Backend

## Objetivo

Documentar a aplicação NestJS: estrutura de módulos, convenções internas e decisões de implementação.

## Responsabilidade

Ser o guia de quem escreve código em `apps/api`. Não duplica a documentação de API (que vive em `09-APIs`) nem a de banco (`08-Banco-de-Dados`).

## Conteúdo esperado

- Estrutura de módulos e responsabilidade de cada um
- Convenções de camada (controller, service, repository, DTO, guard, pipe, decorator)
- Padrões de tratamento de erro, validação, logging e transação
- Estratégia de multi-tenancy e onde ela é aplicada
- Guia de criação de um módulo novo do zero

## Quem utiliza

Desenvolvedores backend.

## Quando utilizar

Ao criar um módulo; ao revisar PR de backend; no onboarding de dev backend.

## Quem pode alterar

Time de backend, com revisão do tech lead.

## Estado atual

Hoje o backend tem 18 controllers, 85 rotas e 3 filas Bull. Estrutura real em `apps/api/src/modules/`.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
