# 05-ADR — Architecture Decision Records

## Objetivo

Registrar decisões arquiteturais relevantes com contexto, alternativas e consequências — de forma imutável.

## Responsabilidade

Preservar o **porquê** de cada decisão. Uma ADR nunca é editada depois de aceita: é superada por outra que a referencia.

## Conteúdo esperado

- Uma ADR por decisão, numerada sequencialmente (`ADR-0001-titulo-em-kebab-case.md`)
- Template padrão em `ADR-0000-template.md`
- Índice com status de cada ADR (Proposta, Aceita, Superada, Rejeitada)

## Quem utiliza

Engenharia, arquitetos, qualquer pessoa que questione "por que foi feito assim?".

## Quando utilizar

Sempre que uma decisão for cara de reverter, afetar mais de um módulo ou contrariar uma convenção vigente.

## Quem pode alterar

Qualquer pessoa pode **propor** uma ADR. Só arquiteto ou tech lead **aceita**. Ninguém edita ADR já aceita — cria-se uma nova que a supera.

## Estado atual

Contém o template e o índice. As 10 ADRs pendentes estão listadas na seção 11.19 do plano de evolução.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
