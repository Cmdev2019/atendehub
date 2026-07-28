# 11-WebSocket — WebSocket e tempo real

## Objetivo

Documentar o canal de tempo real: namespace, autenticação, salas e catálogo de eventos.

## Responsabilidade

Descrever tudo que trafega fora do REST, incluindo garantias e limites do canal.

## Conteúdo esperado

- Namespace, handshake e autenticação
- Modelo de salas (empresa, agente, conversa) e regra de entrada
- Catálogo de eventos emitidos, com payload e quando ocorrem
- Estratégia de reconexão e renovação de token
- Escala horizontal e adaptador Redis

## Quem utiliza

Backend, frontend, QA.

## Quando utilizar

Ao consumir ou emitir evento em tempo real; ao investigar UI dessincronizada.

## Quem pode alterar

Backend e frontend em conjunto — o contrato de evento é compartilhado.

## Estado atual

Namespace `/ws`, adaptador Redis aplicado no IoAdapter raiz. 9 eventos consumidos hoje pelo front.

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
