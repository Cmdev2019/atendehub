# 16-Bots — Bots e atendimento automático

## Objetivo

Documentar o comportamento automatizado que conversa com o cliente antes ou no lugar do humano.

## Responsabilidade

Descrever motor de execução, tipos de nó, estado de sessão e métricas de contenção.

## Conteúdo esperado

- Motor de fluxo e ciclo de vida da sessão
- Catálogo de tipos de nó e sua configuração
- Gatilhos, horário de funcionamento e tratamento de inatividade
- Versionamento e rollback de fluxo
- Métricas do bot (contenção, abandono por nó, deflexão)

## Quem utiliza

Product Management, backend, time de operação do cliente.

## Quando utilizar

Ao configurar ou evoluir automação conversacional.

## Quem pode alterar

Backend implementa o motor; a configuração de fluxo é do cliente final.

## Estado atual

Hoje existe menu numérico de um nível (`AutoAttendanceFlow`), com estado em Redis e timeout via Bull. Flow builder é v2.5.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
