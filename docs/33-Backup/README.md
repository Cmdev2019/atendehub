# 33-Backup — Backup

## Objetivo

Documentar o que é copiado, com que frequência, para onde e por quanto tempo.

## Responsabilidade

Backup não verificado não é backup. Toda rotina aqui precisa de evidência de restauração bem-sucedida.

## Conteúdo esperado

- Matriz de ativos, método, frequência e retenção
- Procedimento de restauração passo a passo
- Registro de testes de restauração com data e resultado
- RPO e RTO alvo por ativo
- Política de criptografia e acesso ao backup

## Quem utiliza

DevOps, plantão, auditoria de conformidade.

## Quando utilizar

Ao configurar rotina; no teste periódico; durante recuperação.

## Quem pode alterar

DevOps. Rotina nova só entra em vigor após uma restauração de teste bem-sucedida e registrada.

## Estado atual

O `RUNBOOK.md` já documenta backup/restore de Postgres e MinIO, com restauração validada localmente. Automação ainda não existe.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
