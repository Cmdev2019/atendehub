# ADR-0009 — Manter Modular Monolith; critérios objetivos para extrair um serviço

- **Status:** Implementada
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia (formalização retroativa, item v1.0 já listado em `INDICE.md` desde 2026-08-01)
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `apps/api/src/app.module.ts`, os 19 módulos de `apps/api/src/modules/`

> Ciclo de vida conforme `README.md` desta pasta.

## Contexto

O backend do AtendeHub é hoje um único processo NestJS com 19 módulos (`AuditLogModule`,
`AuthModule`, `AutoAttendanceModule`, `CompanyModule`, `ContactModule`, `ConversationModule`,
`DashboardModule`, `DepartmentModule`, `EventsModule`, `HealthModule`, `MessageModule`,
`NoteModule`, `NotificationModule`, `QueueModule`, `ReportModule`, `SlaModule`, `TagModule`,
`UserModule`, `WebhookModule`, `WhatsappModule`), todos registrados em `app.module.ts` e
implantados como uma única imagem Docker (`apps/api/Dockerfile`). Comunicação entre módulos é
por injeção de dependência direta (DI do Nest), não por rede — confirmado por
`grep -rn "http://localhost\|axios.*3001"` dentro de `apps/api/src` não retornar nenhuma
chamada de um módulo para outro via HTTP interno.

O roadmap do projeto (`ROADMAP_ESTABILIZACAO.md`) descreve evolução planejada para 24 meses,
incluindo "plataforma omnichannel com marketplace" (citado em `ADR-0001`). Em algum ponto dessa
evolução, a pergunta "extrair X como serviço próprio?" vai aparecer — hoje, sem critério
escrito, essa decisão seria feita ad hoc, por instinto, no momento de maior pressão (quando um
módulo já dói o bastante para alguém propor separá-lo).

## Problema

Manter tudo em um único processo é a escolha certa **até quando**? Sem critério objetivo
declarado, "extrair um serviço" vira decisão de humor da sprint, não de arquitetura.

## Alternativas consideradas

### Alternativa A — Microsserviços desde já (por domínio: atendimento, auto-atendimento, webhook/integração)
- **Prós:** escala e deploy independentes por domínio; times futuros poderiam trabalhar sem
  colidir.
- **Contras:** o projeto tem hoje 1 mantenedor (`.github/CODEOWNERS`, confirmado na AGR Parte
  VI) — overhead de rede, serialização, observabilidade distribuída e deploy coordenado sem
  nenhum ganho de paralelismo de time para absorver o custo. `WebhookService` já tem 9
  dependências internas (AGR §5.3) que, em microsserviços, virariam chamadas de rede — cada uma
  um novo ponto de falha parcial a tratar.
- **Complexidade:** alta.
- **Risco:** alto — introduzir consistência eventual onde hoje há transação ACID
  (`$transaction` usado em `auth.service.ts:106`, `auto-attendance.service.ts:154`) sem
  necessidade comprovada.
- **Impacto:** reescrita de toda comunicação entre os 19 módulos.
- **Custo estimado:** alto, sem benefício demonstrado no estágio atual do produto.

### Alternativa B — Modular Monolith (manter, com fronteira de módulo disciplinada)
- **Prós:** cada módulo já tem fronteira clara (`*.module.ts`, providers explícitos, sem import
  cruzado de arquivo interno de outro módulo fora do que o `Module` exporta) — o código de fato
  já se comporta como "serviços internos" sem o custo operacional de rede. Deploy único, uma
  imagem Docker, uma migração de banco.
- **Contras:** todo módulo compartilha o mesmo processo — um vazamento de memória ou loop
  infinito em um módulo pode afetar os outros (não há isolamento de falha por processo).
- **Complexidade:** baixa (é o que já existe).
- **Risco:** baixo no estágio atual; cresce se um módulo específico precisar de escala
  desproporcional aos demais.
- **Impacto:** nenhum — mantém o padrão vigente.
- **Custo estimado:** zero agora.

### Alternativa C — Não fazer nada (não declarar critério)
Custo real: a próxima vez que alguém propuser extrair um módulo, a decisão será tomada sem
critério comparável ao de hoje — cada extração futura reabre o debate do zero.

## Decisão Tomada

Mantido o Modular Monolith (Alternativa B). Formalizados 3 critérios objetivos — **qualquer um
presente** é motivo suficiente para abrir uma ADR nova avaliando extração do módulo específico
(não uma decisão automática de extrair, um gatilho para reavaliar):

1. **Escala desproporcional:** um módulo precisa de recursos (CPU/memória/réplicas) ordens de
   grandeza acima dos demais, e escalar o processo inteiro para atender só aquele módulo
   desperdiça recurso de forma mensurável.
2. **Cadência de deploy divergente:** um módulo precisa de deploy com frequência
   significativamente maior (ex.: motor de auto-atendimento evoluindo diariamente) enquanto o
   resto do sistema é estável, e o risco de cada deploy do monolito inteiro para mudar um
   módulo pequeno vira o gargalo.
3. **Fronteira de equipe real:** mais de um time (não mais de uma pessoa dentro do mesmo time)
   passa a possuir módulos diferentes com necessidade de ciclos de release independentes —
   hoje inexistente (mantenedor único, AGR Parte VI).

## Justificativa Técnica

Nenhum dos 3 critérios está presente hoje. O custo de rede/observabilidade distribuída de
microsserviços resolveria um problema que o projeto não tem, e criaria problemas novos
(consistência eventual em fluxos que hoje são transacionais) sem necessidade comprovada —
"não introduzir abstração sem benefício comprovado" é o mesmo racional já usado em
`ADR-0003` (persistência atômica) para decidir não extrair um helper genérico; esta ADR aplica
o mesmo princípio em escala maior.

## Trade-offs

- **O que foi ganho:** simplicidade operacional (1 imagem, 1 deploy, 1 banco, transações ACID
  reais entre domínios); nenhum custo de rede interna.
- **O que foi perdido:** isolamento de falha por processo — um módulo com bug grave (ex.: loop
  infinito, vazamento de memória) pode degradar o processo inteiro. `WebhookService`
  (God Service, AGR §5.3) é o candidato mais próximo de um módulo que, sob volume alto, poderia
  justificar isolamento próprio antes dos demais.
- **Dívida técnica:** nenhuma nova. A decomposição interna do `WebhookService` (sugestão B da
  AGR §16, sem ID de roadmap ainda) é uma dívida **dentro** do monolito, independente desta ADR
  — decompor responsabilidades não exige extrair processo.

## Consequências

### Positivas
- Transações ACID reais entre módulos (`$transaction`) permanecem possíveis sem coordenação
  distribuída.
- Deploy único simplifica o pipeline de CI/CD hoje existente (`api-ci.yml`).
- Onboarding de desenvolvedor novo não exige entender topologia de rede entre serviços.

### Negativas
- Sem isolamento de falha por processo — confirmado como já discutido no `AER Parte I, P-5`
  (Separação de Responsabilidades) como o motivo pelo qual o fan-out do `WebhookService` importa
  mesmo sem extração de processo.
- Escala é do processo inteiro, não por módulo — se `WebhookService` precisar de 10x mais CPU
  que o resto, hoje isso escalaria a API inteira.

### Neutras / a observar
- Os 3 critérios de extração acima devem ser revisitados a cada marco de roadmap que envolva
  crescimento de time ou de volume de mensagens processadas.

## Componentes Afetados

- [x] Services (todos os 30, indiretamente) · [ ] Controllers · [ ] Repositories · [ ] Prisma
- [ ] Redis · [ ] Bull · [ ] Storage · [x] Docker (1 imagem única) · [ ] Nginx · [ ] WebSocket
- [ ] Banco · [x] Outros: `app.module.ts` (composição de todos os módulos)

## Relação com Governança

- **ACR:** 2026-08-01 (inventário dos 19 módulos, base desta ADR)
- **ABR:** §1 (inventário estrutural), §11 (padrões arquiteturais)
- **AGR:** §5 (Governança das Dependências — fan-in/fan-out por módulo), §5.3 (`WebhookService`)
- **AER (Constituição):** Princípio P-5 (Separação de Responsabilidades), AER-017
- **ASNF (Manual):** ASNF-020, ASNF-021, ASNF-120..123 (limites de complexidade/fan-out)
- **ATM:** Parte I (catálogo), Parte IV (Matriz de Componentes)
- **Roadmap:** sem item `B-XX` — decisão estrutural, não corretiva; listada como item v1.0 em
  `INDICE.md` desde 2026-08-01

## Evidências

- **Arquivos:** `apps/api/src/app.module.ts` (composição dos 19 módulos), `apps/api/Dockerfile`
  (imagem única)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR — não pesquisado no histórico de commits desta sessão
- **Testes:** N/A (decisão estrutural, não testável por spec unitário)
- **Pipelines:** `api-ci.yml` builda e testa o monolito como unidade única

## Critérios de Validação

Confirmar, a cada 6 meses ou a cada marco de roadmap, que nenhum dos 3 critérios de extração
(§Decisão Tomada) se tornou verdadeiro sem que uma ADR nova tenha sido aberta para reavaliar.

## Critérios de Revisão

Qualquer um dos 3 critérios listados em "Decisão Tomada" presente. Evento concreto que já se
sabe hoje que dispara revisão: contratação de um segundo time de engenharia com propriedade de
módulo distinta (torna o critério 3 verdadeiro).

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação (formalização retroativa do item v1.0 já listado desde 2026-08-01) | 1.0 |

## Referências

- `docs/05-ADR/ADR-0001-estrutura-do-repositorio.md` (contexto de crescimento planejado)
- `docs/05-ADR/ADR-0003-persistencia-atomica.md` (mesmo princípio de não abstrair sem benefício
  comprovado)
- `docs/04-Arquitetura/AGR_2026-08-05_governance.md` §5
