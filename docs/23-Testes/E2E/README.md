# Testes ponta a ponta

## Objetivo

Verificar jornadas completas do usuário através de toda a pilha.

## Responsabilidade

Cobrir os fluxos críticos: autenticar, receber mensagem, responder, transferir, encerrar, relatar.

## Conteúdo esperado

- Plano de teste desta natureza
- Casos de teste e massa de dados
- Evidências de execução, arquivadas por release
- Relatório consolidado com resultado e ações

## Quem utiliza

QA e desenvolvedores.

## Quando utilizar

Antes de promover build entre ambientes.

## Quem pode alterar

QA e engenharia. Evidência de execução nunca é apagada — é arquivada por release.

## Estado atual

Existe apenas `apps/api/test/sla.e2e-spec.ts`. Playwright para a interface é a lacuna principal.

---

> Estratégia geral de qualidade em [`../../22-QA/README.md`](../../22-QA/README.md).
