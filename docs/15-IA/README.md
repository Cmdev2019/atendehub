# 15-IA — Inteligência artificial

## Objetivo

Documentar onde a IA é aplicada, com qual modelo, a que custo e sob quais limites.

## Responsabilidade

Manter IA como recurso governado: toda aplicação precisa de métrica de resultado, teto de custo e caminho de escalonamento para humano.

## Conteúdo esperado

- Casos de uso e métrica de sucesso de cada um
- Abstração de provedor de LLM e política de fallback
- Prompts versionados e estratégia de avaliação
- Guardrails, limites e escalonamento para humano
- Custo por tenant, quota e controle de gasto
- Tratamento de dado pessoal enviado a terceiros (LGPD)

## Quem utiliza

Product Management, engenharia, encarregado de dados, financeiro.

## Quando utilizar

Antes de aplicar IA a um fluxo novo; ao revisar custo; em auditoria de privacidade.

## Quem pode alterar

Engenharia e Product Management em conjunto. Envio de dado pessoal a terceiro exige aval do encarregado.

## Estado atual

Nenhuma capacidade de IA implementada. Planejada para a v3.0.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
