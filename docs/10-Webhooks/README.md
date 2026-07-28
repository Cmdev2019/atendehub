# 10-Webhooks — Webhooks

## Objetivo

Documentar o webhook de entrada (provedores → AtendeHub) e o de saída (AtendeHub → cliente).

## Responsabilidade

Descrever payloads, autenticação, idempotência, política de retry e tratamento de falha definitiva.

## Conteúdo esperado

- Payloads de entrada por provedor e seu mapeamento para o modelo canônico
- Autenticação e verificação de assinatura
- Política de retry, backoff e dead letter queue
- Catálogo de eventos de saída e formato de assinatura HMAC
- Guia de teste local de webhook

## Quem utiliza

Backend, integradores, suporte técnico ao investigar mensagem não recebida.

## Quando utilizar

Ao integrar um provedor; ao investigar perda de mensagem; ao expor um evento novo.

## Quem pode alterar

Backend com revisão do tech lead — o webhook é o ponto de entrada de dado externo, tem impacto direto em segurança.

## Estado atual

Entrada: `POST /api/v1/webhooks/evolution`. O retry inoperante está registrado como B-39.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
