# 04-Arquitetura — Arquitetura

## Objetivo

Descrever como o sistema é construído: camadas, fronteiras, fluxos e topologia.

## Responsabilidade

Permitir que alguém entenda a estrutura do sistema sem ler todo o código. Deve estar sempre sincronizada com a realidade — diagrama desatualizado é pior que diagrama ausente.

## Conteúdo esperado

- Diagramas C4 (contexto, contêiner, componente)
- Fluxogramas funcional e técnico
- Diagramas UML (caso de uso, atividade, classe, sequência, estado, implantação, ER, componente)
- Definição de bounded contexts e suas fronteiras
- Padrões adotados (Clean Architecture, Hexagonal, CQRS, Repository, Event-Driven)
- Topologia de produção e estratégia de escala

## Quem utiliza

Engenharia, arquitetos, pessoas novas no time, auditoria técnica externa.

## Quando utilizar

No onboarding; antes de qualquer mudança estrutural; ao revisar um PR que cruza fronteiras de módulo.

## Quem pode alterar

Arquitetos e tech lead. Mudança estrutural exige ADR aprovada em `05-ADR` antes do diagrama mudar.

## Estado atual

Os 19 diagramas Mermaid das Fases 6, 7 e 8 do plano de evolução são a base inicial.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
