# ADR-0017 — WebSocket autenticado por handshake JWT com Redis Adapter; paridade de revogação com o HTTP ainda não implementada

- **Status:** Implementada (handshake + Redis Adapter) · Proposta (paridade de blacklist/`isActive`)
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `apps/api/src/modules/events/events.gateway.ts`,
  `apps/api/src/shared/websocket/redis-io.adapter.ts`

> Ciclo de vida conforme `README.md` desta pasta.

## Contexto

Tempo real (mensagem nova, atribuição de conversa, status de conexão) é entregue via Socket.IO
no namespace `/ws`. `RedisIoAdapter` (`main.ts:79-81`) permite múltiplas réplicas da API
compartilharem broadcast entre si. O handshake valida o JWT via `jwtService.verify()`
(`events.gateway.ts:63-89`), monta `socket.user` a partir do payload, e entra automaticamente
nas salas `company:${companyId}` e `agent:${userId}` (linhas 93-99). Achado da AGR §9.1: o
handshake **não** consulta `TokenBlacklistService.isBlacklisted()` nem revalida `user.isActive`
no banco — ao contrário do `JwtStrategy` usado no HTTP, que faz as duas checagens
(`jwt.strategy.ts:36-64`).

## Problema

Duas perguntas: (1) Socket.IO + Redis Adapter + validação de JWT no handshake é o modelo
correto para tempo real multi-tenant? (2) a ausência de checagem de blacklist/`isActive` no
handshake é uma decisão aceitável ou uma lacuna a fechar?

## Alternativas Consideradas — Pergunta 1 (modelo de tempo real)

### Alternativa A — Socket.IO + Redis Adapter, JWT verificado no handshake — **já implementado**
- **Prós:** reaproveita o mesmo JWT do HTTP (sem sessão paralela); `RedisIoAdapter` permite
  escalar para múltiplas réplicas sem reescrever a lógica de broadcast; sala por `companyId`
  isola tráfego por tenant sem depender de filtro em cada emissão.
- **Contras:** qualquer decisão de segurança tomada só no handshake (não revalidada depois)
  fica válida até a conexão cair ou o JWT expirar — ver Pergunta 2.
- **Complexidade:** média (já implementado e testado indiretamente).
- **Risco:** baixo para o modelo em si; a lacuna da Pergunta 2 é o risco real.
- **Impacto:** `EventsGateway`, `EventsService`, todo consumidor de evento em tempo real.
- **Custo estimado:** baixo (já implementado).

### Alternativa B — Polling HTTP em vez de WebSocket
- **Prós:** reaproveitaria 100% da pilha de autenticação HTTP (blacklist, `isActive`, tudo já
  correto) sem precisar duplicar nada.
- **Contras:** latência de atualização pior (intervalo de polling vs. push imediato); carga
  desnecessária no servidor sob alta frequência de polling; produto de central de atendimento
  depende de latência baixa para notificação de mensagem nova — polling degradaria a experiência
  central do produto.
- **Complexidade:** baixa de implementar, alta em trade-off de UX.
- **Impacto:** toda a experiência de tempo real do painel.
- **Custo estimado:** baixo de implementação, alto de UX perdida.

## Decisão Tomada — Pergunta 1

**Alternativa A**, mantida.

## Alternativas Consideradas — Pergunta 2 (paridade de revogação)

### Alternativa A — Handshake replica as mesmas 3 checagens do `JwtStrategy`
- **Prós:** fecha a inconsistência — um token revogado via `POST /auth/revoke` ou um usuário
  desativado deixaria de autenticar novas conexões WebSocket, igual ao HTTP.
- **Contras:** adiciona 1 chamada Redis (`isBlacklisted`) + 1 consulta Postgres (`isActive`) por
  handshake — custo pequeno e único por conexão (não por mensagem), aceitável.
- **Complexidade:** baixa.
- **Risco:** baixo.
- **Impacto:** `events.gateway.ts`.
- **Custo estimado:** baixo.

### Alternativa B — Não fazer nada (aceitar a janela)
- **Custo de manter como está:** um token revogado continua autenticando WebSocket até expirar
  naturalmente — janela limitada à validade do access token (curta, por desenho), mas real.

## Decisão Tomada — Pergunta 2

**Ainda não aprovada.** Direção proposta é a Alternativa A — pequena, isolada, sem dependência de
nenhum outro item do roadmap (ao contrário de B-40/B-41/B-43/B-44). Sugerida pela AGR §16 como
"Novo item sugerido A", ainda **sem ID formal no roadmap**.

## Justificativa Técnica

Para a Pergunta 1: WebSocket é o requisito de latência do produto (central de atendimento
depende de notificação em tempo real) — polling sacrificaria isso sem necessidade. Para a
Pergunta 2: o custo de réplicar as checagens é baixo (1 chamada Redis + 1 consulta Postgres por
handshake, não por mensagem) frente ao risco de uma sessão continuar autenticada depois de
revogação explícita — a mesma classe de risco que já motivou B-38/B-39 no passado.

## Trade-offs

- **Pergunta 1 — o que foi ganho:** latência baixa, broadcast multi-réplica pronto. **O que foi
  perdido:** nenhuma superfície de autenticação nova reaproveitando o HTTP automaticamente —
  precisa ser mantida em paridade manualmente (é exatamente o que falhou na Pergunta 2).
- **Pergunta 2 — dívida técnica:** sessão WebSocket sobrevive a `POST /auth/revoke` e a
  `isActive: false` até o JWT expirar.

## Consequências

### Positivas
- Modelo de tempo real correto para o produto, já validado em uso.
- Isolamento por sala `company:${companyId}` correto e testado (não é a lacuna — a lacuna é
  autenticação, não autorização de sala).

### Negativas
- Paridade de revogação ausente — achado 🟠 Alto da AGR, sem correção ainda.

### Neutras / a observar
- `join:conversation` já revalida `companyId` contra a conversa pedida (`events.gateway.ts:142`)
  — não é a mesma lacuna, é uma checagem de autorização por evento que já funciona corretamente.

## Componentes Afetados

- [ ] Controllers · [ ] Services · [ ] Repositories · [ ] Prisma · [x] Redis (Adapter +
  blacklist, quando implementada) · [ ] Bull · [ ] Storage · [ ] Docker · [x] Nginx
  (`proxy_read_timeout`, relacionado via ADR-0016) · [x] WebSocket · [ ] Banco

## Relação com Governança

- **ACR:** não tratou este tema
- **ABR:** §2 (WebSocket namespace/conexão)
- **AGR:** §9.1 (achado central), §6 (Security Layer Matrix)
- **AER (Constituição):** AER-015
- **ASNF (Manual):** ASNF-031, ASNF-084, ASNF-114
- **ATM:** Parte IV (Matriz de Componentes — WebSocket), Parte VII (item sem ID, sugestão A)
- **Roadmap:** sem ID formal ainda — sugestão da AGR §16, candidata a item novo

## Evidências

- **Arquivos/Classes/Métodos:** `events.gateway.ts:63-99` (handshake, `handleConnection`),
  `jwt.strategy.ts:36-64` (o padrão de referência que o handshake deveria replicar)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** NÃO ENCONTRADO `events.gateway.spec.ts`
- **Pipelines:** NÃO ENCONTRADO (não haveria o que rodar, o teste não existe)

## Critérios de Validação

Quando implementada: teste de integração que revoga um access token (`POST /auth/revoke`) e
confirma que uma nova conexão WebSocket com o mesmo token é rejeitada; teste que desativa um
usuário (`isActive: false`) e confirma que uma conexão WebSocket nova dele também é rejeitada.

## Critérios de Revisão

Recomendado tratar como item independente e de baixo esforço — não precisa esperar B-40/B-41.
Revisar se um incidente de sessão WebSocket "fantasma" pós-revogação for observado em produção
(eleva a prioridade).

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação | 1.0 |

## Referências

- `docs/04-Arquitetura/AGR_2026-08-05_governance.md` §9.1, §16
- `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` (AER-015)
