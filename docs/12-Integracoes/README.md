# 12-Integracoes — Integrações

## Objetivo

Documentar cada sistema externo com o qual o AtendeHub conversa.

## Responsabilidade

Uma subpasta ou arquivo por integração, com credenciais necessárias, limites, custos e plano de contingência.

## Conteúdo esperado

- Provedores de canal (Evolution API, WhatsApp Cloud, Meta, Telegram)
- Serviços de apoio (storage, e-mail transacional, pagamento, transcrição, LLM)
- Limites de taxa, custos e SLA de cada fornecedor
- Plano de contingência por integração indisponível
- Guia de configuração em ambiente novo

## Quem utiliza

Backend, DevOps, suporte, financeiro (custos).

## Quando utilizar

Ao adicionar integração; ao investigar falha externa; ao revisar custo de infraestrutura.

## Quem pode alterar

Backend e DevOps. Contrato comercial com fornecedor é decisão de liderança.

## Estado atual

Integração real hoje: Evolution API v2 (Baileys), MinIO e Sentry. Demais são planejadas.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
