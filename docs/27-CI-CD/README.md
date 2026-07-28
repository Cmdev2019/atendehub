# 27-CI-CD — Integração e entrega contínuas

## Objetivo

Documentar o pipeline: o que roda, quando, com quais portões de qualidade.

## Responsabilidade

Descrever cada workflow e o critério que bloqueia um merge ou uma promoção.

## Conteúdo esperado

- Descrição de cada workflow e seus gatilhos
- Portões de qualidade e critério de bloqueio
- Estratégia de build, cache e artefatos
- Assinatura de imagem e geração de SBOM
- Guia para adicionar um passo novo ao pipeline

## Quem utiliza

Engenharia, DevOps.

## Quando utilizar

Ao alterar o pipeline; quando um build falha e não se sabe por quê.

## Quem pode alterar

DevOps e tech lead. Afrouxar portão de qualidade exige justificativa registrada.

## Estado atual

Hoje: 2 workflows (api-ci, web-ci). Sem CD, sem varredura de segurança, sem portão de cobertura.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
