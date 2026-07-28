# Documentação do AtendeHub

> Índice geral e mapa de navegação. Toda documentação do projeto vive aqui, organizada em áreas
> numeradas. Cada pasta possui um `README.md` próprio declarando objetivo, responsabilidade, conteúdo
> esperado, quem utiliza, quando utilizar e quem pode alterar.

---

## Por onde começar

| Se você é… | Comece por |
|---|---|
| **Dev entrando no time** | [`README.md` da raiz](../README.md) → [`CLAUDE.md`](../CLAUDE.md) → [39-Glossario](39-Glossario/) → [04-Arquitetura](04-Arquitetura/) → [00-Governanca](00-Governanca/) |
| **Dev backend** | [06-Backend](06-Backend/) → [08-Banco-de-Dados](08-Banco-de-Dados/) → [09-APIs](09-APIs/) |
| **Dev frontend** | [07-Frontend](07-Frontend/) → [09-APIs](09-APIs/) → [11-WebSocket](11-WebSocket/) |
| **QA** | [22-QA](22-QA/) → [23-Testes](23-Testes/) → [02-Requisitos](02-Requisitos/) |
| **DevOps / plantão** | [26-DevOps](26-DevOps/) → [28-Monitoramento](28-Monitoramento/) → [34-Disaster-Recovery](34-Disaster-Recovery/) |
| **Product Management** | [01-Produto](01-Produto/) → [03-Roadmap](03-Roadmap/) → [18-Analytics](18-Analytics/) |
| **Integrador externo** | [09-APIs](09-APIs/) → [10-Webhooks](10-Webhooks/) → [11-WebSocket](11-WebSocket/) |
| **Auditoria / segurança** | [19-Seguranca](19-Seguranca/) → [35-LGPD](35-LGPD/) → [21-Vulnerabilidades](21-Vulnerabilidades/) |

---

## Mapa completo

### ⚙️ Governança e produto

| # | Área | Conteúdo |
|---|---|---|
| [00](00-Governanca/) | **Governança** | Plano de reestruturação · Convenção de nomenclatura · Boas práticas |
| [01](01-Produto/) | Produto | Visão, personas, benchmark, planos comerciais |
| [02](02-Requisitos/) | Requisitos | Funcionais, não-funcionais, critérios de aceite |
| [03](03-Roadmap/) | **Roadmap** | Plano de evolução Enterprise · backlog · Kanban |

### 🏛️ Arquitetura

| # | Área | Conteúdo |
|---|---|---|
| [04](04-Arquitetura/) | Arquitetura | C4, fluxogramas, UML, bounded contexts |
| [05](05-ADR/) | **ADR** | Decisões arquiteturais imutáveis |

### 💻 Implementação

| # | Área | Conteúdo |
|---|---|---|
| [06](06-Backend/) | Backend | Convenções do NestJS, estrutura de módulos |
| [07](07-Frontend/) | Frontend | Convenções do React, design system, diretrizes visuais |
| [08](08-Banco-de-Dados/) | Banco de dados | Modelo, migrations, RLS, retenção |
| [09](09-APIs/) | **APIs** | Contrato REST, OpenAPI, versionamento |
| [10](10-Webhooks/) | Webhooks | Entrada e saída, retry, DLQ |
| [11](11-WebSocket/) | WebSocket | Namespace, salas, catálogo de eventos |
| [12](12-Integracoes/) | Integrações | Um documento por sistema externo |

### 🎯 Domínio de negócio

| # | Área | Conteúdo |
|---|---|---|
| [13](13-CRM/) | CRM | Contato, organização, campos customizados, funil |
| [14](14-Omnichannel/) | Omnichannel | Abstração de canal, capacidades por canal |
| [15](15-IA/) | IA | Casos de uso, custo, guardrails |
| [16](16-Bots/) | Bots | Motor de fluxo, métricas de contenção |
| [17](17-Workflow/) | Workflow | Automações internas, campanhas |
| [18](18-Analytics/) | Analytics | Dicionário de métricas |

### 🔒 Segurança e qualidade

| # | Área | Conteúdo |
|---|---|---|
| [19](19-Seguranca/) | Segurança | Modelo de ameaças, controles, políticas |
| [20](20-Pentest/) | Pentest | Exercícios adversariais e correções |
| [21](21-Vulnerabilidades/) | Vulnerabilidades | Inventário, SLA de correção, exceções |
| [22](22-QA/) | QA | Estratégia de qualidade (processo) |
| [23](23-Testes/) | **Testes** | Artefatos por natureza (9 subpastas) |

### 🚀 Operação

| # | Área | Conteúdo |
|---|---|---|
| [24](24-Escalabilidade/) | Escalabilidade | Limites, gargalos, capacidade |
| [25](25-Observabilidade/) | Observabilidade | Traces, métricas, logs |
| [26](26-DevOps/) | **DevOps** | Runbook, IaC, ambientes, segredos |
| [27](27-CI-CD/) | CI/CD | Pipeline e portões de qualidade |
| [28](28-Monitoramento/) | Monitoramento | Alertas, SLO, plantão, post-mortems |
| [29](29-Producao/) | Produção | O que está no ar agora |
| [30](30-Deploy/) | Deploy | Procedimento e estratégia de liberação |

### 📦 Ciclo de vida

| # | Área | Conteúdo |
|---|---|---|
| [31](31-Versionamento/) | Versionamento | Semver, branches, commits, API |
| [32](32-Releases/) | Releases | Notas e histórico de versões |
| [33](33-Backup/) | Backup | Rotinas e testes de restauração |
| [34](34-Disaster-Recovery/) | Disaster Recovery | Cenários e exercícios |
| [35](35-LGPD/) | LGPD | Conformidade e direitos do titular |

### 📎 Apoio

| # | Área | Conteúdo |
|---|---|---|
| [36](36-Checklist/) | Checklists | Listas de verificação operacionais |
| [37](37-Templates/) | Templates | Modelos reutilizáveis |
| [38](38-Reunioes/) | Reuniões | Atas com decisão e encaminhamento |
| [39](39-Glossario/) | Glossário | Linguagem ubíqua do domínio |
| [99](99-Arquivo/) | ⚠️ Arquivo | Histórico — **não é fonte de verdade** |

---

## Documentos-chave

| Documento | Onde | O que é |
|---|---|---|
| **Plano de Evolução Enterprise** | [`03-Roadmap/`](03-Roadmap/PLANO-DE-EVOLUCAO-ENTERPRISE.md) | Auditoria de 37 módulos, 272 GAPs, roadmap v1.0→v4.0, benchmark, 19 diagramas |
| **Plano de Reestruturação** | [`00-Governanca/`](00-Governanca/PLANO-DE-REESTRUTURACAO.md) | Árvore-alvo, migração em fases, checklists, rollback |
| **Convenção de Nomenclatura** | [`00-Governanca/`](00-Governanca/CONVENCAO-DE-NOMENCLATURA.md) | Normativo — leia antes do primeiro commit |
| **Boas Práticas do Repositório** | [`00-Governanca/`](00-Governanca/BOAS-PRATICAS-DO-REPOSITORIO.md) | As 12 regras de manutenção |
| **Contrato da API** | [`09-APIs/`](09-APIs/API_CONTRACT.md) | Shapes, enums, eventos de socket |
| **Runbook operacional** | [`26-DevOps/`](26-DevOps/RUNBOOK.md) | Deploy, rollback, troubleshooting, backup |
| **Roadmap de estabilização** | [`../ROADMAP_ESTABILIZACAO.md`](../ROADMAP_ESTABILIZACAO.md) | Documento vivo canônico (move para `03-Roadmap` na Fase 4) |

---

## Regras desta documentação

1. **Documento vivo não tem data no nome.** O histórico é responsabilidade do Git. Data em nome de
   arquivo é permitida apenas em registro de momento (post-mortem, ata, relatório de pentest).
2. **Documentação muda no mesmo PR que o comportamento.** Alterou endpoint → atualizou `09-APIs`.
3. **ADR nunca é editada depois de aceita.** É superada por outra que a referencia.
4. **Pasta vazia comunica lacuna conhecida.** É honesto. O que não se aceita é lacuna sem revisão
   trimestral.
5. **`99-Arquivo/` é consulta histórica, nunca fonte de verdade.** Se um documento ali é citado como
   verdade em alguma discussão, isso é um defeito a corrigir.
6. **Todo documento novo nasce de um template** de [`37-Templates/`](37-Templates/), não de página em
   branco.

---

## Estado da documentação

| Situação | Contagem |
|---|---|
| Áreas criadas | 41 (40 numeradas + arquivo) |
| Subpastas de teste | 9 |
| READMEs com as 6 seções obrigatórias | 49 |
| Áreas com conteúdo além do README | 5 — `00`, `03`, `07`, `09`, `26` |
| Áreas aguardando primeiro documento | 36 |

> A assimetria acima é esperada e transparente: a estrutura foi criada de uma vez, e o conteúdo é
> produzido conforme cada área é trabalhada. Ver [regra 11 de boas práticas](00-Governanca/BOAS-PRATICAS-DO-REPOSITORIO.md).
