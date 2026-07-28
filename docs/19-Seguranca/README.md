# 19-Seguranca — Segurança

## Objetivo

Documentar postura, controles e políticas de segurança da plataforma.

## Responsabilidade

Ser a referência de "como protegemos o sistema e o dado do cliente" — e o insumo de qualquer questionário de segurança de cliente Enterprise.

## Conteúdo esperado

- Modelo de ameaças (STRIDE) e camadas de defesa
- Política de autenticação, autorização e sessão
- Gestão de segredos e rotação
- Criptografia em trânsito e em repouso
- Política de resposta a incidente de segurança
- Hardening de contêiner, rede e borda

## Quem utiliza

Engenharia, DevOps, liderança, clientes em processo de compra.

## Quando utilizar

Ao projetar recurso que toca dado sensível; ao responder questionário de segurança; após incidente.

## Quem pode alterar

Tech lead e responsável por segurança. Exceção a controle exige registro formal.

## Estado atual

Achados abertos: B-38 (bucket público), B-40 (escopo de permissão), B-41 (RLS), B-43 (headers), B-44 (root).

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
