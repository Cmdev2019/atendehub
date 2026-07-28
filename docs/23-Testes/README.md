# 23-Testes — Testes

## Objetivo

Guardar planos, casos e evidências de teste, separados por natureza.

## Responsabilidade

Cada subpasta tem escopo próprio e não se sobrepõe às demais. Evidência de execução mora junto do plano correspondente.

## Conteúdo esperado

- Uma subpasta por natureza de teste, cada uma com plano, casos e evidências
- Massa de dados e fixtures compartilhadas
- Relatórios de execução por release

## Quem utiliza

QA, engenharia, auditoria.

## Quando utilizar

Ao planejar ou executar teste; ao investigar regressão.

## Quem pode alterar

QA e engenharia. Evidência de execução nunca é apagada — é arquivada por release.

## Estado atual

Subpastas: Unitarios, Integracao, E2E, Performance, Stress, Carga, Regressao, Homologacao, GoLive.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
