# 14-Omnichannel — Omnichannel

## Objetivo

Documentar a abstração de canal e as particularidades de cada canal suportado.

## Responsabilidade

Garantir que adicionar um canal novo seja implementar um contrato, não alterar o núcleo do sistema.

## Conteúdo esperado

- Contrato do adaptador de canal (porta) e suíte de conformidade
- Capacidades por canal (o que cada um suporta: mídia, botões, template, tamanho de arquivo)
- Modelo de caixa (inbox) e roteamento entre canais
- Particularidades por canal e limitações do provedor
- Guia de implementação de um canal novo

## Quem utiliza

Arquitetos, backend, Product Management.

## Quando utilizar

Ao adicionar canal; ao decidir se um recurso é genérico ou específico de canal.

## Quem pode alterar

Arquitetos definem o contrato; backend implementa adaptadores.

## Estado atual

Hoje há um único canal implementado (WhatsApp via Evolution). A abstração é a entrega central da v2.0.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
