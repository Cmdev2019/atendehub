# 25-Observabilidade — Observabilidade

## Objetivo

Documentar como o sistema é instrumentado: traces, métricas e logs.

## Responsabilidade

Descrever o que é instrumentado, com qual convenção de nome, e como correlacionar os três sinais numa investigação.

## Conteúdo esperado

- Estratégia de instrumentação e convenção de nomes
- Catálogo de métricas expostas
- Padrão de log estruturado e política de dado sensível em log
- Correlação entre trace, log e métrica
- Guia de investigação de incidente a partir dos sinais

## Quem utiliza

Engenharia, DevOps, plantão.

## Quando utilizar

Ao instrumentar código novo; durante investigação de incidente.

## Quem pode alterar

DevOps e engenharia.

## Estado atual

Hoje: Winston com requestId via AsyncLocalStorage e Sentry. OpenTelemetry, Prometheus e Grafana são pendências da v1.0.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
