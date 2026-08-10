# ADR-0014 — Clientes Redis especializados por serviço, sem provider compartilhado (relacionada a B-46)

- **Status:** Implementada — consolidação futura sob avaliação (B-46)
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia (formalização retroativa do racional já registrado na ACR de 2026-08-01)
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `token-blacklist.service.ts`, `auto-attendance-session.service.ts`,
  `health.service.ts`, `redis-io.adapter.ts`, `BullModule.forRootAsync` (`app.module.ts:46-56`)

> Ciclo de vida conforme `README.md` desta pasta.

## Contexto

5 conexões Redis distintas existem hoje no processo da API: 4 instanciadas explicitamente via
`new Redis(...)` (`TokenBlacklistService`, `AutoAttendanceSessionService`, `HealthService`,
`RedisIoAdapter`) e 1 implícita, aberta pelo BullMQ (`app.module.ts:46-56`, `keyPrefix: 'bull:'`).
Nenhuma delas passa por um provider/factory compartilhado do Nest — cada `@Injectable()`
instancia sua própria conexão no construtor. Achado confirmado na ACR de 2026-08-01 e
reconfirmado na ABR §6 desta sessão.

## Problema

Manter 4+1 conexões Redis separadas é aceitável, ou deveria existir um provider único
compartilhado entre os consumidores?

## Alternativas Consideradas

### Alternativa A — Manter clientes separados por serviço (atual)
- **Prós:** cada serviço controla seu próprio ciclo de vida de conexão sem acoplamento a um
  provider central; `TokenBlacklistService` (código de segurança já em produção) não é tocado
  por uma mudança de infraestrutura não-funcional.
- **Contras:** 4 conexões TCP ao mesmo Redis fazendo o mesmo trabalho de "conectar e configurar
  retry" de forma redundante; nenhuma delas usa namespace de chave por domínio além do que cada
  uma decide isoladamente.
- **Complexidade:** baixa (nenhuma mudança).
- **Risco:** baixo — hoje sem incidente conhecido atribuível a essa duplicação.
- **Impacto:** nenhum, é o estado atual.
- **Custo estimado:** zero agora, cresce ligeiramente a cada novo consumidor de Redis que
  reproduzir o mesmo padrão.

### Alternativa B — `RedisModule` compartilhado, client único injetado via DI
- **Prós:** um só lugar para configurar retry/timeout/reconexão; consolida os 4+1 em 1 conexão
  gerenciada.
- **Contras:** exige migrar `TokenBlacklistService` — código de segurança já em produção — como
  parte do mesmo refactor que migra os outros 3, mesmo eles não tendo relação funcional entre
  si; um refactor não-funcional isolado nesse componente carrega risco desproporcional ao
  benefício (regressão em blacklist de token teria impacto de segurança direto).
- **Complexidade:** média.
- **Risco:** o refactor em si é de baixo risco técnico, mas alto risco de blast radius se algo
  sair errado no componente de segurança.
- **Impacto:** os 4 consumidores explícitos.
- **Custo estimado:** médio, com teste de regressão cobrindo os 4 de uma vez (recomendado pela
  ACR, não feito antecipadamente).

## Decisão Tomada

**Alternativa A**, mantida — decisão consciente de **não** consolidar antecipadamente. Formalizada
aqui exatamente como já estava registrada na ACR de 2026-08-01: a consolidação é adiada para o
momento em que o item B-46 (que precisa mexer em `AutoAttendanceSessionService`/`EventsGateway.
connectedClients` de qualquer forma, para resolver o vazamento de `Map` local sob múltiplas
réplicas) for implementado — aproveitando esse mesmo PR para extrair o `RedisModule` e migrar os
2 consumidores não-relacionados a segurança junto, com teste de regressão cobrindo os 3 de uma
vez (não migrar `TokenBlacklistService` isoladamente).

## Justificativa Técnica

Mover código de segurança em produção (`TokenBlacklistService`) só para economizar 1 conexão TCP,
sem nenhum outro trabalho já planejado tocando o mesmo componente, é risco desproporcional ao
benefício. Esperar até B-46 (que já vai mexer em infraestrutura de estado compartilhado por outro
motivo — o throttle de avatar e a contagem de conectados, ambos precisando de Redis ao invés de
`Map` local) permite pagar o custo do refactor uma vez só, com o mesmo teste de regressão cobrindo
tudo.

## Trade-offs

- **O que foi ganho:** nenhum refactor prematuro em código de segurança; simplicidade de cada
  serviço controlar sua própria conexão.
- **O que foi perdido:** 4 conexões TCP redundantes ao mesmo Redis; nenhum namespace de chave
  consolidado.
- **Dívida técnica:** consolidação adiada para **B-46** — explicitamente, não por omissão.

## Consequências

### Positivas
- `TokenBlacklistService` permanece estável, sem risco de regressão de segurança introduzido por
  um refactor de infraestrutura não relacionado.
- Decisão documentada evita que uma auditoria futura confunda a duplicação como acidental — é
  intencional, com prazo de resolução amarrado a B-46.

### Negativas
- 4+1 conexões Redis é mais difícil de monitorar/alertar como uma coisa só (cada uma aparece
  separada em qualquer ferramenta de observabilidade de conexões).
- Qualquer novo consumidor de Redis que seguir o mesmo padrão (novo `new Redis()`) sem revisar
  esta ADR primeiro perpetua a fragmentação além dos 4+1 já aceitos.

### Neutras / a observar
- Nenhuma das 4 conexões usa namespace de chave por tenant (ABR §6) — questão separada da
  consolidação, seria resolvida independentemente se algum dia virar requisito.

## Componentes Afetados

- [ ] Controllers · [x] Services (`TokenBlacklistService`, `AutoAttendanceSessionService`,
  `HealthService`) · [ ] Repositories · [ ] Prisma · [x] Redis · [x] Bull (client implícito)
- [ ] Storage · [ ] Docker · [ ] Nginx · [x] WebSocket (`RedisIoAdapter`) · [ ] Banco · [ ] Outros

## Relação com Governança

- **ACR:** 2026-08-01 — racional original desta decisão
- **ABR:** §6 (Inventário Redis completo)
- **AGR:** §5.1 (fan-in), citado como "achado maior não consolidado" na ACR original
- **AER (Constituição):** Constituição Parte V (controle "Consolidação de clients Redis")
- **ASNF (Manual):** ASNF-057..062
- **ATM:** Parte IV (Matriz de Componentes — Redis), Parte XI (Riscos)
- **Roadmap:** **B-46**

## Evidências

- **Arquivos/Classes/Métodos:** `token-blacklist.service.ts:22`,
  `auto-attendance-session.service.ts:19`, `health.service.ts:28`, `redis-io.adapter.ts:31`,
  `app.module.ts:46-56`
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** `token-blacklist.service.spec.ts`, `health.service.spec.ts` (ambos mockam `ioredis`)
- **Pipelines:** `api-ci.yml`

## Critérios de Validação

Enquanto não consolidado: confirmar que nenhum novo `new Redis(...)` aparece fora dos 4+1 já
aceitos sem justificativa/ADR nova (controle já proposto na Constituição Parte V). Após
consolidar: `grep -rn "new Redis(" apps/api/src` retorna só o provider compartilhado.

## Critérios de Revisão

Revisar obrigatoriamente ao implementar **B-46**. Revisar antes disso se um 6º consumidor de
Redis for proposto (o custo de adiar cresce a cada novo consumidor não-consolidado).

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação — formaliza retroativamente o racional já registrado na ACR de 2026-08-01 | 1.0 |

## Referências

- `docs/04-Arquitetura/padroes-consolidados-2026-08.md` (ACR original)
- `docs/04-Arquitetura/ABR_2026-08-05_baseline.md` §6
- `ROADMAP_ESTABILIZACAO.md` (item B-46)
