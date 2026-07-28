# 09-APIs — APIs

## Objetivo

Documentar o contrato HTTP: rotas, shapes, códigos de erro e regras de versionamento.

## Responsabilidade

Ser a fonte de verdade do contrato entre backend e qualquer consumidor (front, integrador, app mobile).

## Conteúdo esperado

- Contrato completo das rotas REST
- Especificação OpenAPI gerada
- Padrão de erro e de paginação
- Política de versionamento e deprecação (sunset)
- Autenticação, escopos e limites de taxa
- Guia do desenvolvedor integrador

## Quem utiliza

Backend, frontend, integradores externos, QA.

## Quando utilizar

Ao consumir ou alterar qualquer endpoint.

## Quem pode alterar

Backend. **Regra rígida:** alteração de endpoint e atualização do contrato acontecem no mesmo PR.

## Estado atual

Contém `API_CONTRACT.md` (contrato mantido à mão). O OpenAPI está registrado como pendência B-45.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
