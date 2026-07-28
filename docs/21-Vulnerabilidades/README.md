# 21-Vulnerabilidades — Gestão de vulnerabilidades

## Objetivo

Rastrear vulnerabilidades conhecidas — de dependência, de código ou de configuração — do descobrimento à correção.

## Responsabilidade

Garantir que nenhuma vulnerabilidade seja esquecida e que exceções sejam conscientes, datadas e com prazo.

## Conteúdo esperado

- Inventário de vulnerabilidades abertas com severidade e prazo
- Política de SLA de correção por severidade
- Registro de exceções aceitas, com justificativa e data de reavaliação
- Relatórios de varredura automatizada
- Processo de divulgação responsável

## Quem utiliza

Engenharia, DevOps, segurança.

## Quando utilizar

Semanalmente na triagem; sempre que uma varredura sinalizar algo.

## Quem pode alterar

Responsável por segurança. Aceitar risco alto exige aprovação do tech lead com prazo de reavaliação.

## Estado atual

Nenhuma varredura automatizada no CI ainda (CodeQL, Trivy, gitleaks e Dependabot são pendências da v1.0).

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
