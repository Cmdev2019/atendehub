# Architecture Governance Index (AGI) — AtendeHub

**Codinome alternativo usado no prompt de origem:** "Architecture Governance Handbook" — mesmo
documento, um nome só adotado (AGI, por ser o usado em todo o corpo do prompt); o subtítulo não
denomeia um 2º artefato.
**Versão:** 1.0 · **Data:** 2026-08-05 · **Status:** Proposta (mesmo status de todos os
documentos que ele indexa — ver Parte III)
**Sucede:** [ACR](../04-Arquitetura/padroes-consolidados-2026-08.md) →
[ABR](../04-Arquitetura/ABR_2026-08-05_baseline.md) →
[AGR](../04-Arquitetura/AGR_2026-08-05_governance.md) →
[AER/Constituição](CONSTITUICAO-ARQUITETURAL.md) →
[ASNF/Manual](MANUAL-DE-ENGENHARIA-DE-SOFTWARE.md) →
[ATM/Matriz](MATRIZ-DE-RASTREABILIDADE-ARQUITETURAL.md) → **AGI (este documento — o único que não
soma revisão nova; organiza as seis anteriores)**.

**Natureza deste documento:** exclusivamente documental e organizacional. O AGI **não cria**
arquitetura, norma, decisão ou requisito — só apresenta, explica, ordena e conecta o que os
outros seis documentos e o repositório de ADRs já estabeleceram. Nenhum código, infraestrutura,
pipeline, Docker, Nginx, Prisma, Redis ou Bull foi alterado na produção deste arquivo. Nenhum
documento existente foi reescrito, duplicado ou copiado — toda afirmação técnica abaixo é
referência (`documento §parte`), nunca conteúdo reproduzido.

**Fonte única de verdade (regra seguida neste documento):** cada assunto tem exatamente **um**
dono. Quando este índice precisa mencionar um número (ex.: "25 regras AER"), ele cita a fonte e
não o recalcula — a única exceção é a Parte XII (Dashboard Executivo), que soma números já
publicados nos documentos-fonte, sem gerar nenhum novo.

---

## Etapa 1 — Inventário (executada antes de qualquer texto abaixo)

Todos os 7 artefatos citados no prompt de origem foram localizados e confirmados fisicamente no
repositório, com exceção de 2 (registrados como **NÃO ENCONTRADO**, nunca inventados). Nomes,
localizações e data de última modificação conferidos por leitura direta nesta sessão — não
reaproveitados de memória.

| Artefato | Encontrado? | Localização | Nomenclatura real |
|---|---|---|---|
| ACR | ✅ Sim | `docs/04-Arquitetura/padroes-consolidados-2026-08.md` | Nome do arquivo não contém a sigla; título do arquivo é "Padrões arquiteturais consolidados — Architecture Consolidation Review (2026-08-01)" |
| ABR | ✅ Sim | `docs/04-Arquitetura/ABR_2026-08-05_baseline.md` | Sigla no nome do arquivo e no título |
| AGR | ✅ Sim | `docs/04-Arquitetura/AGR_2026-08-05_governance.md` | Sigla no nome do arquivo e no título |
| AER (Constituição Arquitetural) | ✅ Sim | `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` | Nome do arquivo em português (Constituição); sigla "AER" só aparece no corpo/nos outros documentos que a citam |
| ASNF | ✅ Sim | `docs/00-Governanca/MANUAL-DE-ENGENHARIA-DE-SOFTWARE.md` | Nome do arquivo em português (Manual); "ASNF (Architecture Standards & Normative Framework)" é o "codinome do projeto normativo", declarado na 2ª linha do próprio arquivo |
| ATM | ✅ Sim | `docs/00-Governanca/MATRIZ-DE-RASTREABILIDADE-ARQUITETURAL.md` | Nome do arquivo em português (Matriz); sigla "ATM" no título |
| ADR Repository | ✅ Sim | `docs/05-ADR/` | `README.md`, `INDICE.md`, `ADR-0000-template.md`, `ADR-0001` a `ADR-0018` (18 decisões) |
| ASM (Architecture Scorecard & Maturity) | ❌ **NÃO ENCONTRADO** | — | Citado como "(futuro)" no prompt que originou a AER; a própria ATM (Parte I) já confirmou a mesma ausência por busca no repositório inteiro. Este AGI refez a busca de forma independente e chegou à mesma conclusão — ver Parte XIV |
| AEM (Architecture Evolution Roadmap) | ❌ **NÃO ENCONTRADO como artefato** | — | Ver nota de divergência abaixo — existe uma colisão de sigla não perigosa a registrar |

**Divergência entre prompt e repositório #1 (registrada, não corrigida):** a ATM (Parte I)
afirma que "AEM" não aparece em nenhum arquivo além das menções dentro dos prompts que
originaram AER/ATM. Uma nova busca feita para este AGI (`grep -rn "AEM" docs`) encontra 2
ocorrências reais: `docs/03-Roadmap/PLANO-DE-EVOLUCAO-ENTERPRISE.md:1893` e `:1962` — mas são o
identificador de nó `AEM` de um diagrama Mermaid (`AEM[EmailAdapter]`, adaptador de canal de
e-mail), semanticamente **não relacionado** ao artefato "Architecture Evolution Roadmap" citado
no prompt. A afirmação da ATM ("não aparece em nenhum arquivo") fica, portanto, tecnicamente
imprecisa nesse detalhe — mas a conclusão de fundo (não existe artefato de governança chamado
AEM) permanece correta. Registrado aqui por regra ("nunca corrigir silenciosamente"); a ATM não
foi editada.

**Divergência entre prompt e repositório #2 (registrada, não corrigida):** o prompt de origem
usa "Architecture Governance Index (AGI)" no título e "Architecture Governance Handbook" no
subtítulo, como se fossem nomes equivalentes do mesmo documento a ser criado. O repositório não
tinha, até este arquivo, nenhum artefato com nenhum dos dois nomes. Este documento adota **AGI**
como nome oficial (é o nome usado consistentemente no corpo do prompt) e registra "Handbook"
como sinônimo informal, não como um 2º documento.

---

# PARTE I — Visão Executiva

## O que é a Governança Arquitetural do AtendeHub

É a cadeia de 6 revisões técnicas + o repositório de ADRs, produzidas entre 2026-08-01 e
2026-08-05, que documenta — nessa ordem — **o que existe** (ACR, ABR), **onde isso diverge do
desejável** (AGR), **o que deveria valer daqui para frente** (AER/Constituição, ASNF/Manual) e
**como cada peça se conecta a todas as outras** (ATM). O AGI é a porta de entrada dessa cadeia:
não adiciona uma 7ª camada de conteúdo técnico, adiciona a navegação que faltava entre as 6.

## Objetivos

1. Dar a qualquer pessoa (nova no time ou não) um único ponto de partida para entender a
   arquitetura do AtendeHub e por que ela é como é.
2. Explicar a função de cada um dos 6 documentos + repositório de ADRs, sem repetir o conteúdo
   técnico de nenhum.
3. Definir a ordem de leitura por perfil (Parte V).
4. Tornar auditável a própria manutenção da documentação de governança (Parte VI, XI).

## Princípios

- **Fonte única de verdade por tema** (ver Parte IV) — nunca dois documentos donos do mesmo
  assunto.
- **Referenciar, nunca duplicar** — todo fato técnico deste documento é uma citação
  (`documento §parte`), não uma reafirmação.
- **Honestidade sobre lacuna** — "NÃO ENCONTRADO" é uma resposta válida e mais útil que
  inventar.
- **Rastreabilidade bidirecional** — todo requisito deve ser navegável de cima para baixo
  (princípio → implementação) e de baixo para cima (código → norma); a ATM já implementa isso
  (Parte XII da ATM) e o AGI só aponta para lá.

## Benefícios

Reduz o custo de onboarding (Parte X), evita que uma nova pessoa "descubra" uma norma já escrita
em outro lugar e a duplique, e dá ao usuário (hoje mantenedor único do projeto, ver Parte VII) um
mapa para decidir com que ordem de prioridade formalizar o que ainda está "Proposto".

## Escopo

Cobre os 6 documentos da cadeia de governança arquitetural (ACR, ABR, AGR, AER, ASNF, ATM), o
repositório de ADRs (`docs/05-ADR/`) e os documentos de apoio imediatamente relacionados
(`CONVENCAO-DE-NOMENCLATURA.md`, `BOAS-PRATICAS-DO-REPOSITORIO.md`,
`PLANO-DE-REESTRUTURACAO.md`, `PADROES-ARQUITETURAIS-ATENDEHUB.md`, `CLAUDE.md`,
`ROADMAP_ESTABILIZACAO.md`). Não cobre documentação de produto, requisitos funcionais ou os
demais 34 índices de `docs/` fora do eixo de arquitetura/governança — esses continuam navegáveis
a partir de `docs/README.md`, que o AGI não substitui.

## Limitações

- O AGI **não valida** se o conteúdo técnico de cada documento está correto — isso é
  responsabilidade de quem escreveu/revisar cada um (a ATM já faz esse papel de verificação
  cruzada, não o AGI).
- 5 dos 6 documentos que o AGI indexa (ABR, AGR, AER, ASNF, ATM) e as 10 ADRs mais novas
  (`ADR-0009`–`ADR-0018`) estão hoje **sem commit** no repositório (confirmado por
  `git status` nesta sessão) — o AGI reflete o estado da árvore de trabalho local, não
  necessariamente o que está em `master` no momento em que for lido.
- Este documento é ele mesmo "Proposta" — não se torna o "manual oficial de navegação" pela
  própria existência; ver Parte XI para o que falta para adoção formal, mesmo raciocínio já usado
  pela Constituição e pelo Manual.

---

# PARTE II — Arquitetura da Governança

## Mapa conceitual da cadeia documental

```
Arquitetura (código real em apps/api, apps/web, infra/)
  │
  ▼
ACR  (2026-08-01) ─── consolida padrões já implementados, elimina duplicação de código real
  │
  ▼
ABR  (2026-08-05) ─── fotografa o estado atual com evidência de código, sem corrigir nada
  │
  ▼
AGR  (2026-08-05) ─── audita governança sobre a ABR: onde a responsabilidade deveria estar
  │                    vs. onde está de fato
  │
  ├──────────────┬──────────────┐
  ▼              ▼              │
AER            ASNF             │  (as duas nascem dos achados da AGR, no mesmo dia,
(Constituição) (Manual)         │   a AER define os princípios/regras de alto nível,
  │              │              │   o Manual detalha por domínio técnico)
  └──────┬───────┘              │
         ▼                      │
        ATM  ◄───────────────────  conecta as 6 anteriores + o repositório de ADR ao código,
         │                         teste, pipeline e roadmap reais — não cria regra nova
         ▼
        ADR (docs/05-ADR/) ◄── formaliza, uma por decisão, o que AER/ASNF propõem em bloco
         │                      (ADR-0009 a 0018 nasceram na mesma sessão, citando AER/ASNF/ATM)
         ▼
        AGI (este documento) ── organiza e explica a cadeia inteira; não adiciona conteúdo técnico
         │
         ▼
        ASM (previsto) ──────── dashboard vivo de conformidade — formaliza o que a Constituição
         │                      Parte V já propõe como "Controles Arquiteturais", hoje manual
         ▼
        AEM (previsto) ──────── roadmap de evolução da própria governança — parcialmente coberto
                                 hoje, sem o nome, por docs/03-Roadmap/PLANO-DE-EVOLUCAO-ENTERPRISE.md
```

## Responsabilidade de cada documento (uma frase por documento — detalhe completo na Parte III)

| Documento | Responsabilidade em uma frase |
|---|---|
| ACR | Inventariar padrões já implementados e eliminar duplicação de código real encontrada no processo. |
| ABR | Fotografar o estado atual do backend com evidência de código, sem sugerir correção. |
| AGR | Comparar o estado atual (ABR) contra onde a responsabilidade deveria estar, e nomear os GAPs. |
| AER / Constituição | Definir os princípios e regras de mais alto nível — o que deve valer, com força normativa proposta. |
| ASNF / Manual | Detalhar a Constituição em normas específicas por domínio técnico (`ASNF-001`–`125`) e antipadrões. |
| ATM | Amarrar ACR–ABR–AGR–AER–ASNF–ADR–código–teste–pipeline–roadmap numa única matriz rastreável nos dois sentidos. |
| ADR Repository | Registrar, uma por decisão, o "porquê" imutável — inclusive as formalizadas a partir de AER/ASNF. |
| AGI | Explicar a cadeia acima para quem chega agora — este documento. |
| ASM (previsto) | Tornar viva/automatizada a medição de conformidade que hoje é manual em toda a cadeia (ver ATM Parte IX). |
| AEM (previsto) | Formalizar a evolução da própria governança — quando e como a cadeia acima ganha uma nova rodada. |

---

# PARTE III — Catálogo Mestre

Os 13 campos pedidos, um cartão por artefato. Onde o documento-fonte já expõe o campo
explicitamente, ele é citado; onde não expõe (a maioria dos documentos anteriores a esta cadeia
não tinha um campo "Frequência de revisão" formal), o AGI declara **INFERIDO** — nunca inventado
sem marcação.

### ACR — Architecture Consolidation Review

- **Sigla:** ACR · **Objetivo:** inventariar padrões e eliminar duplicação real de código pós
  B-38/B-39/B-48/B-49. · **Escopo:** `apps/api` (módulos webhook, message, conversation, shared).
- **Público:** Backend Dev, Arquiteto. · **Responsável:** autor da sessão de 2026-08-01
  (commit `4d78e2d`, `git log`, git user `Carlos Marques`).
- **Frequência de revisão:** **INFERIDO** — não declarada no próprio documento; por analogia ao
  padrão dos demais (revisão "por auditoria", não calendário fixo), tratar como "a cada nova
  consolidação de padrões relevante".
- **Documentos relacionados:** `PADROES-ARQUITETURAIS-ATENDEHUB.md` (referência rápida
  complementar), ADR-0002/0003/0007/0008 (formalizam decisões consolidadas aqui).
- **Dependências:** nenhuma — é o ponto de partida da cadeia (ATM Parte I).
- **Status:** ✅ Concluído (ATM Parte I). Único documento da cadeia **sem** cabeçalho
  `Versão/Status/Data` padronizado — ver Parte IX (achado de convenção).
- **Localização:** `docs/04-Arquitetura/padroes-consolidados-2026-08.md`.

### ABR — Architecture Baseline Review

- **Sigla:** ABR · **Objetivo:** documentar o estado atual com evidência de código, sem corrigir.
  · **Escopo:** `apps/api` (NestJS+Prisma+Postgres+Redis/Bull), `infra/postgres/init.sql`.
- **Público:** Arquiteto, Security, Backend Dev preparando a leva B-40–B-44.
- **Responsável:** sessão de 2026-08-05 (não commitada — ver Parte I, Limitações).
- **Frequência de revisão:** **INFERIDO** — a ATM (Parte XV) propõe reexecutar as contagens de
  arquivo que a fundamentam "a cada novo documento da cadeia"; a ABR em si não declara uma
  cadência própria.
- **Documentos relacionados:** AGR (sucede), AER/ASNF (citam `ABR §N` extensivamente), ATM (Parte
  I a XIV citam `ABR §N` em quase toda linha).
- **Dependências:** ACR (contexto, ATM Parte I).
- **Status:** ✅ Concluído, 15 seções, 625 linhas.
- **Localização:** `docs/04-Arquitetura/ABR_2026-08-05_baseline.md`.

### AGR — Architecture Governance Review

- **Sigla:** AGR · **Objetivo:** auditoria de governança — onde a responsabilidade deveria estar
  vs. onde está de fato; não é auditoria de bug (AGR §"Natureza da revisão").
- **Escopo:** autorização, multi-tenancy, trust boundaries, dependências, operação.
- **Público:** Arquiteto, Tech Lead, Security.
- **Responsável:** mesma sessão da ABR, na sequência (AGR §0, "Sucede ABR, mesma sessão").
- **Frequência de revisão:** **INFERIDO** — mesmo raciocínio da ABR.
- **Documentos relacionados:** ABR (cita via `[ABR §N]` em vez de redescobrir evidência — AGR
  §0), AER/ASNF (nascem dos achados daqui), ATM.
- **Dependências:** ABR.
- **Status:** ✅ Concluído, 16 seções, 730 linhas.
- **Localização:** `docs/04-Arquitetura/AGR_2026-08-05_governance.md`.

### AER — Architecture Enforcement Review (Constituição Arquitetural)

- **Sigla:** AER · **Objetivo:** normas de mais alto nível + mecanismos de enforcement — 10
  princípios (`P-1`–`P-10`), 25 regras (`AER-001`–`025`, Blocos A–G), RACI, processo de exceção,
  KPIs, roadmap de enforcement.
- **Escopo:** todo o sistema — é a autoridade normativa proposta (ATM Parte I).
- **Público:** todo perfil técnico (Parte V).
- **Responsável:** mesma sessão da AGR, na sequência.
- **Frequência de revisão:** definida no próprio documento — Parte VIII (Critérios de Auditoria)
  e Parte VI (RACI: "Revisar Constituição" é `R/A` do Arquiteto).
- **Documentos relacionados:** ABR/AGR (evidência-base, citadas por seção em cada princípio),
  ASNF (detalha em nível de norma), ATM (Parte II a XI citam `AER-XXX` extensivamente), ADRs
  `0009`–`0018` (citam `AER-XXX` no campo "Relação com Governança").
- **Dependências:** ABR, AGR.
- **Status:** ⚠️ Proposta, aguarda adoção formal (ver a própria seção "Como este documento se
  torna vinculante" do arquivo — 3 passos, nenhum executado ainda). 918 linhas, 10 Partes.
- **Localização:** `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md`.

### ASNF — Architecture Standards & Normative Framework (Manual Oficial de Engenharia de Software)

- **Sigla:** ASNF · **Objetivo:** catálogo detalhado de 125 normas (`ASNF-001`–`125`) e 16
  antipadrões oficiais (`AP-01`–`16`), detalhando a AER por domínio técnico.
- **Escopo:** Backend, Multi-tenant, Prisma, Redis, Bull, Segurança, Infraestrutura,
  Observabilidade, Testes, Performance, Qualidade.
- **Público:** todo Backend Dev/DevOps no dia a dia de PR (Parte XV do próprio Manual traz os
  checklists usados nesse fluxo).
- **Responsável:** mesma sessão da AER, "não substitui, detalha" (Manual, cabeçalho).
- **Frequência de revisão:** **INFERIDO** — mesmo status "Proposta, aguarda adoção formal" da
  Constituição; sem cadência própria declarada além da Parte XIV (Gestão de Exceções).
- **Documentos relacionados:** AER (detalha), ATM (Parte III/IV/V/VI/VIII citam `ASNF-XXX` linha
  a linha), ADRs `0009`–`0018`.
- **Dependências:** AER.
- **Status:** ⚠️ Proposta, aguarda adoção formal (mesmo status da Constituição, que ela não
  substitui). 728 linhas, 16 Partes + Glossário + Índice de Referências Cruzadas.
- **Localização:** `docs/00-Governanca/MANUAL-DE-ENGENHARIA-DE-SOFTWARE.md`.

### ATM — Architecture Traceability Matrix (Matriz de Rastreabilidade Arquitetural)

- **Sigla:** ATM · **Objetivo:** rastreabilidade pura entre todos os artefatos acima — não cria
  regra, norma ou decisão nova (ATM, cabeçalho).
- **Escopo:** 15 Partes — Mapa Mestre, Requisitos, Governança, Componentes, Multi-Tenant,
  Segurança, Roadmaps, Testes, Automação, Decisões, Riscos, Rastreabilidade Bidirecional, Gap de
  Rastreabilidade, Dashboard Executivo, Plano de Evolução da própria ATM.
- **Público:** Auditor, Arquiteto, Tech Lead.
- **Responsável:** mesma sessão, última da cadeia original; recebeu 1 atualização registrada no
  próprio cabeçalho quando as 10 ADRs novas foram escritas na sequência.
- **Frequência de revisão:** declarada explicitamente na própria Parte XV — a cada novo
  documento da cadeia, a cada item de roadmap fechado, a cada auditoria periódica (Constituição
  Parte VIII).
- **Documentos relacionados:** todos os outros 5 + ADR Repository + código + teste + pipeline +
  roadmap.
- **Dependências:** ACR, ABR, AGR, AER, ASNF.
- **Status:** ⚠️ Proposta, 509 linhas, 15 Partes + nota final.
- **Localização:** `docs/00-Governanca/MATRIZ-DE-RASTREABILIDADE-ARQUITETURAL.md`.

### ADR Repository — Architecture Decision Records

- **Sigla:** ADR · **Objetivo:** registrar, uma por decisão, contexto + alternativas +
  consequências, de forma imutável (`docs/05-ADR/README.md`).
- **Escopo:** decisões pontuais — hoje 18 (`ADR-0001`–`0018`); 8 no formato de status curto
  original, 10 no ciclo de vida estendido (`docs/05-ADR/README.md`, "Estado atual").
- **Público:** qualquer pessoa que questione "por que foi feito assim?" (`README.md`).
- **Responsável:** qualquer pessoa propõe; só Arquiteto/Tech Lead aceita (`README.md`).
- **Frequência de revisão:** por ADR — ver campo "Revisão prevista" de cada linha em
  `docs/05-ADR/INDICE.md`, não uma cadência única para o repositório inteiro.
- **Documentos relacionados:** todos — cada ADR nova (`0009`+) preenche um campo "Relação com
  Governança" citando ACR/ABR/AGR/AER/ASNF/ATM/Roadmap explicitamente (`ADR-0000-template.md`).
- **Dependências:** varia por ADR.
- **Status:** 10 Aprovadas/Implementadas (status maduro), 2 integralmente Propostas, 6 com status
  composto (parte implementada, parte proposta) — números exatos em `docs/05-ADR/INDICE.md`
  "Dashboard executivo".
- **Localização:** `docs/05-ADR/`.

### ASM — Architecture Scorecard & Maturity (previsto)

- **Status:** ❌ **NÃO ENCONTRADO** — ver Etapa 1 e Parte XIV. Nenhum campo abaixo pode ser
  preenchido sem inventar; todos ficam **NÃO ENCONTRADO / NÃO APLICÁVEL (previsto)**.

### AEM — Architecture Evolution Roadmap (previsto)

- **Status:** ❌ **NÃO ENCONTRADO como artefato de governança** (ver nota de divergência #1 na
  Etapa 1 — existe uma colisão de sigla não relacionada num diagrama). Mesmo tratamento da ASM
  acima — ver Parte XIV.

---

# PARTE IV — Fonte Oficial por Tema

| Tema | Documento oficial | Observações |
|---|---|---|
| Autorização (RBAC, guards) | ADR-0012 (decisão) + AER Bloco A (regras) + ASNF Parte II.1/VII (normas) | Sem ADR único de "estratégia de autorização" que amarre RLS+RBAC — gap já registrado pela ATM (Parte XIII); ADR-0012 cobre só o modelo de Role. |
| Multi-tenant | ADR-0010 (RLS, Proposta) + AER Bloco B + ASNF Parte III | P-4 da Constituição é o princípio; nenhuma implementação de RLS existe hoje (ver ATM Parte II). |
| Storage | ADR-0011 + AER (Política Storage) + ASNF-041/078 | Implementada e Validada (INDICE.md). |
| Redis | ADR-0014 + ASNF Parte V | "Implementada — consolidação sob avaliação" (INDICE.md); 5 clients sem provider compartilhado. |
| Bull / filas | ADR-0005 (retry), ADR-0006 (DLQ) + ASNF Parte VI | Retry e DLQ com ADR própria desde a ACR (2026-08-01); mais antigas que a leva 0009+. |
| Docker | ADR-0015 + AER Bloco C + ASNF Parte VIII | "Implementada (build) / Proposta (runtime)" — hardening pendente (B-44). |
| Nginx | ADR-0016 + AER Bloco C + ASNF Parte VIII | "Implementada (topologia) / Proposta (hardening)" — pendente (B-43). |
| WebSocket | ADR-0017 + AER-015 + ASNF-084/114 | "Implementada (handshake) / Proposta (paridade)" — sem item de roadmap com ID ainda. |
| Observabilidade | ADR-0008 + AER (Política de Observabilidade) + ASNF Parte IX | Mais antiga da leva 0009+; nasceu na ACR/2026-08-01. |
| Roadmap técnico | `ROADMAP_ESTABILIZACAO.md` (backend+frontend, vivo) / `ROADMAP_BACKEND.md` (encerrado, histórico) | `CLAUDE.md` declara `ROADMAP_ESTABILIZACAO.md` fonte de verdade #1 do projeto — o AGI não altera essa hierarquia, só a cita. |
| Roadmap de evolução de produto/arquitetura de longo prazo | `docs/03-Roadmap/PLANO-DE-EVOLUCAO-ENTERPRISE.md` | Cobre v1.0→v4.0; é o candidato mais próximo a um futuro "AEM" — ver Parte XIV. |
| Segurança | AER Bloco C/D + ASNF Parte VII + ATM Parte VI (Matriz de Segurança) | ATM Parte VI é quem consolida risco↔mitigação↔teste; AER/ASNF definem a norma. |
| Arquitetura (estado atual) | ABR (evidência) — não a ACR, que é anterior e mais estreita (só padrões pós-B38/39/48/49) | Distinção importante: ACR ⊂ escopo, ABR é o inventário completo. |
| Normas | ASNF (única fonte — 125 normas) | AER define **princípio**, não norma; a ASNF é quem detalha em nível de implementação. |
| Rastreabilidade | ATM (única fonte) | Nenhum outro documento desta cadeia tenta amarrar tudo — é o papel exclusivo da ATM. |
| Nomenclatura | `CONVENCAO-DE-NOMENCLATURA.md` | ASNF-001..007 **referenciam**, não duplicam (ATM Parte I, linha `CONVENCAO-DE-NOMENCLATURA.md`). |
| Estrutura de repositório | `PLANO-DE-REESTRUTURACAO.md` + ADR-0001 | ADR-0001 formaliza a decisão; o Plano é o documento de execução/checklist. |
| Guia rápido de padrões (não normativo) | `PADROES-ARQUITETURAIS-ATENDEHUB.md` | Declarado no próprio commit (`7ab3fb0`) como "complementar às ADRs, nunca as substituindo" — não é uma 2ª fonte de verdade, é um atalho de consulta que sempre linka de volta à ADR. |

---

# PARTE V — Fluxos de Consulta

| Perfil | Ordem de leitura obrigatória | Opcional |
|---|---|---|
| **Novo Desenvolvedor** | `README.md` (raiz) → `CLAUDE.md` → este AGI → `docs/04-Arquitetura/README.md` + ABR §1 (resumo executivo) → `CONVENCAO-DE-NOMENCLATURA.md` → ADR mais recentes do módulo que for tocar | ASNF completo (consultar por tema, não ler linear) |
| **Arquiteto** | Este AGI → AER (Constituição) inteira → ASNF inteira → ATM Partes I/II/III → ADRs `0009`–`0018` | ACR/ABR/AGR (evidência, se for questionar um achado) |
| **Auditor** | ATM inteira (é o documento desenhado para essa pergunta) → AER Parte VIII (Critérios de Auditoria) → AGR (achados de governança) | ABR (evidência bruta, para checar um número específico) |
| **DevOps** | AER Bloco C (infra/rede) → ASNF Partes VI/VIII → ADR-0014/0015/0016 → ATM Parte IV (linhas Docker/Nginx/Redis) | Constituição Parte V (controles propostos, ainda não implementados) |
| **QA** | ASNF Parte X (Normas de Testes) → ATM Parte VIII (Matriz de Testes) → `docs/22-QA/README.md`, `docs/23-Testes/README.md` (fora desta cadeia, mas o próximo passo natural) | AER Bloco F (regras de teste) |
| **Tech Lead** | Este AGI inteiro → AER Partes VI/VII/IX (RACI, exceções, KPIs) → ATM Parte XIV (Dashboard) → `docs/05-ADR/INDICE.md` (dashboard de ADR) | Todo o resto, sob demanda |
| **Revisor de Pull Request** | `docs/05-ADR/README.md` (ciclo de vida) → ASNF Parte XV (Checklist de PR) → norma específica do que está sendo revisado (buscar por tema na Parte IV deste AGI) | Nenhum — o checklist é desenhado para não exigir leitura linear |

---

# PARTE VI — Fluxo de Atualização

| Pergunta | Resposta |
|---|---|
| Quando atualizar a **ACR/ABR/AGR**? | Não têm gatilho de atualização automática declarado — são fotografias de uma sessão específica; uma nova rodada gera um novo arquivo (mesmo padrão de nome com nova data), não uma edição da anterior (**INFERIDO** por convenção observada, não escrito em nenhum dos 3). |
| Quando atualizar a **AER/Constituição**? | AER Parte VIII (Critérios de Auditoria) + Parte VI (RACI: revisão é `R/A` do Arquiteto) — a própria Constituição define seus critérios de auditoria periódica. |
| Quando atualizar a **ASNF/Manual**? | Junto com a AER (não substitui, detalha — mudança de princípio implica revisão de norma correspondente). |
| Quando atualizar a **ATM**? | Declarado na própria ATM Parte XV: a cada novo documento da cadeia, a cada item de roadmap fechado, a cada mudança de "proposto" para "implementado" em mecanismo de automação, a cada auditoria periódica. |
| Quando criar uma **ADR nova**? | `docs/05-ADR/README.md`: sempre que uma decisão for cara de reverter, afetar mais de um módulo, ou contrariar uma convenção vigente. |
| Quando atualizar este **AGI**? | (1) Um 7º documento nasce na cadeia (ou a ASM/AEM saem de "previsto" para reais); (2) qualquer um dos 6 documentos muda de status (Proposta→Aprovada); (3) uma nova ADR marco (`0019`+) é criada; (4) uma auditoria da Constituição Parte VIII roda e encontra desvio na própria estrutura de governança, não só no código. |
| Quem aprova? | Mesma matriz RACI da Constituição Parte VI (Parte VII deste AGI) — hoje, mantenedor único; papel formal é do Arquiteto/Tech Lead. |
| Quem revisa? | Mesmo RACI — coluna `C` (Consultado) das funções não envolvidas na aprovação. |
| Quem apenas consulta? | Todos os demais perfis da Parte V. |

---

# PARTE VII — Matriz de Responsabilidades

Reaproveitada da Constituição Parte VI (RACI), **não duplicada linha a linha** — reproduzida aqui
de forma condensada por ser a matriz que rege também a manutenção deste próprio AGI. Fonte
completa: [`CONSTITUICAO-ARQUITETURAL.md` Parte VI](CONSTITUICAO-ARQUITETURAL.md).

| Atividade | Dono formal | Realidade hoje |
|---|---|---|
| Definir princípio/política | Arquiteto (`R/A`) | Mesma pessoa (`@Cmdev2019`, único mantenedor — Constituição Parte VI, "Nota de honestidade factual") |
| Implementar regra | Backend Dev (`R`), Tech Lead (`A`) | Idem |
| Aprovar exceção | Arquiteto (`A`), Tech Lead (`R`) | Idem |
| Auditar conformidade | Tech Lead (`R/A`), Security (`R`) | Idem |
| Manter mecanismo de enforcement | Tech Lead (`A`), DevOps (`R` Docker/Nginx/CI) | Idem |
| Medir KPI | Tech Lead (`R/A`) | Idem |
| Revisar Constituição | Arquiteto (`R/A`) | Idem |
| Manter este AGI | **INFERIDO por analogia** — mesma linha "Revisar Constituição" (Arquiteto `R/A`), por ser o documento estruturalmente mais próximo (organiza a própria cadeia normativa) | Idem |

A matriz **já está pronta para o time crescer** — é o próprio objetivo declarado da Constituição
ao definir por função, não por pessoa (Constituição Parte VI). O AGI não adiciona papel novo.

---

# PARTE VIII — Integração

## Quem depende de quem (grafo de dependência declarada, não inferida — ver Parte I de cada documento/ATM Parte I)

- **ACR** → não depende de nada (ponto de partida).
- **ABR** → cita ACR como contexto, não como dependência de dado (ATM Parte I: "ACR (contexto)").
- **AGR** → depende da ABR (cita `[ABR §N]` em vez de redescobrir evidência).
- **AER** → depende de ABR + AGR (cada princípio cita a seção que o originou).
- **ASNF** → depende da AER ("não substitui, detalha").
- **ATM** → depende de todas as 5 anteriores (ACR, ABR, AGR, AER, ASNF).
- **ADR `0009`–`0018`** → cada uma cita individualmente ABR/AGR/AER/ASNF/ATM no campo "Relação
  com Governança" do template (`ADR-0000-template.md`).
- **AGI (este documento)** → depende das 6 anteriores + do ADR Repository; nenhuma delas depende
  do AGI (é estritamente uma camada de navegação por cima, nunca uma pré-condição para as outras
  funcionarem).

## Quem referencia quem (não é o mesmo grafo — referência ≠ dependência de conteúdo)

`docs/05-ADR/INDICE.md`, `PADROES-ARQUITETURAIS-ATENDEHUB.md` e os `README.md` de
`04-Arquitetura`/`05-ADR` referenciam a cadeia inteira sem depender dela para fazer sentido
sozinhos — são pontos de entrada alternativos, não elos que quebrariam se um documento da cadeia
sumisse.

## Quem nunca deve duplicar conteúdo

- Nenhuma ADR nova deve reescrever um princípio da AER ou uma norma da ASNF — deve **citar** o
  ID (`AER-XXX`/`ASNF-XXX`) no campo "Relação com Governança" do template.
- A `PADROES-ARQUITETURAIS-ATENDEHUB.md` é, por declaração do próprio commit que a introduziu
  (`7ab3fb0`), um atalho de consulta — nunca uma 2ª fonte de verdade concorrente com a ADR que
  cita.
- Este AGI nunca deve reproduzir o texto de uma regra `AER-XXX` ou norma `ASNF-XXX` — só citar o
  ID e a localização, como feito em toda a Parte IV acima.

---

# PARTE IX — Convenções

| Convenção | Regra | Fonte |
|---|---|---|
| Nomenclatura de arquivo normativo | `SCREAMING-KEBAB-CASE.md` | `CONVENCAO-DE-NOMENCLATURA.md §2.3` |
| Nomenclatura de arquivo descritivo | `kebab-case.md` | `CONVENCAO-DE-NOMENCLATURA.md §2.3` |
| Nomenclatura de ADR | `ADR-NNNN-titulo-em-kebab.md`, numeração sequencial a partir do maior número existente, nunca reservado com antecedência | `CONVENCAO-DE-NOMENCLATURA.md §2.3`, `docs/05-ADR/INDICE.md` |
| Versionamento de documento vivo/normativo | Campo `Versão` + `Data` no cabeçalho; **sem data no nome do arquivo** | `CONVENCAO-DE-NOMENCLATURA.md §2.3` (citada pela própria ATM Parte XV) — aplica-se a AER, ASNF, ATM |
| Versionamento de revisão pontual (fotografia de uma sessão) | Data **no nome do arquivo** (`ABR_2026-08-05_baseline.md`, `AGR_2026-08-05_governance.md`) | **Achado de convenção implícita desta Parte** — não está escrita em nenhum documento normativo; é um padrão observado, não uma regra formalizada. Recomenda-se que uma futura revisão da `CONVENCAO-DE-NOMENCLATURA.md` a torne explícita (fora do escopo deste AGI alterar). |
| Estrutura de diretórios | `docs/NN-Nome/`, numerado, com `README.md` próprio | `PLANO-DE-REESTRUTURACAO.md`, ADR-0001 |
| Referências cruzadas | `[Texto](caminho/relativo.md)` para link; `documento §N`/`documento Parte N` para citação em prosa | Padrão observado em todos os 6 documentos da cadeia + este AGI |
| Identificadores de regra/norma | `AER-NNN` (3 dígitos, sequencial, sem reuso), `ASNF-NNN` (3 dígitos), `AP-NN` (antipadrão, 2 dígitos), `P-N` (princípio, 1 dígito) | AER/ASNF, observado |
| Histórico | Cada ADR carrega uma tabela `Histórico` própria (Data/Mudança/Versão); os 6 documentos da cadeia **não têm** tabela de histórico própria — cada revisão nova é um arquivo novo, não uma edição versionada do mesmo arquivo | `ADR-0000-template.md` vs. observação direta de ACR/ABR/AGR/AER/ASNF/ATM |

**Achado de convenção não resolvido (registrado, não corrigido por regra deste AGI):** a AER e
a ASNF são chamadas de "documento vivo" implicitamente (não levam data no nome, seguem a mesma
convenção de `CONVENCAO-DE-NOMENCLATURA.md §2.3` que rege documentos normativos), mas ainda não
têm — diferente da ATM (Parte XV) — uma seção própria "Plano de Evolução" com gatilho de
atualização explícito. Fica como recomendação para a próxima revisão de cada uma (não implementado
aqui, por regra de não corrigir documento existente).

---

# PARTE X — Onboarding

## Guia oficial para novos integrantes

| Passo | O quê | Tempo estimado | Objetivo |
|---|---|---|---|
| 1 | `README.md` (raiz) + `CLAUDE.md` | 15 min | Entender o produto e as convenções de comando/ambiente. |
| 2 | Este AGI, inteiro | 20 min | Ter o mapa da cadeia de governança antes de entrar em qualquer documento técnico. |
| 3 | ABR §1 (Resumo executivo) + AGR §1 (Executive Summary) | 15 min | Entender o estado atual e os GAPs de governança sem ler as ~1350 linhas completas dos dois. |
| 4 | AER Parte I (10 Princípios) | 15 min | Saber **por que** as regras existem antes de decorar regra por regra. |
| 5 | `CONVENCAO-DE-NOMENCLATURA.md` completo | 15 min | Não escrever um nome de arquivo/variável que vai ser corrigido no primeiro PR. |
| 6 | ASNF — consulta pontual pela Parte IV deste AGI (por tema, não linear) | Sob demanda | Evitar as ~2h de leitura linear das 125 normas antes do 1º commit. |
| 7 | `docs/05-ADR/INDICE.md` — ler as ADRs do módulo que for tocar primeiro | 10–20 min por ADR relevante | Entender decisões já tomadas antes de propor algo que as contradiga sem saber. |

**Tempo total estimado até o 1º PR com contexto suficiente:** ~1h30–2h (passos 1–5), mais leitura
pontual sob demanda (passos 6–7).

## Checklist de onboarding

- [ ] Li `CLAUDE.md` e sei rodar o front (`npm run dev`) e o backend (`npm run start:dev`) local.
- [ ] Sei localizar, sem buscar, onde fica a fonte de verdade de cada tema da Parte IV deste AGI.
- [ ] Sei a diferença entre ABR (fotografia) e ATM (rastreabilidade) sem reler os dois documentos.
- [ ] Sei o que fazer antes de abrir um PR que toca autorização/multi-tenancy (ASNF Parte II.1/III
      + checklist de PR da ASNF Parte XV).
- [ ] Sei que uma ADR aceita nunca é editada — sei como propor uma nova que supera.

---

# PARTE XI — Governança do Ciclo de Vida

| Estágio | Como acontece hoje (evidência) |
|---|---|
| **Como nasce um documento** | Uma sessão de revisão (auditoria, consolidação, ou pedido do usuário) produz um arquivo novo em `docs/00-Governanca/` ou `docs/04-Arquitetura/`, seguindo a convenção de nome da Parte IX. Não existe hoje um template formal para "novo documento de governança" (diferente da ADR, que tem `ADR-0000-template.md`) — **gap identificado por este AGI**, fora de escopo corrigir aqui. |
| **Como é aprovado** | Para ADR: PR com status "Proposta" → "Aprovada" (`docs/05-ADR/README.md`). Para os 6 documentos da cadeia (ACR–ATM): **nenhum mecanismo de aprovação formal existe ainda** — todos os 5 mais recentes (ABR, AGR, AER, ASNF, ATM) estão em "Proposta" desde que foram escritos, sem processo declarado de quem os move para "Aprovada" além da RACI genérica da Constituição Parte VI. |
| **Como é revisado** | ADR: ciclo de vida estendido de 8 estágios (`docs/05-ADR/README.md`). AER: Parte VIII (Critérios de Auditoria). ASNF: Parte XIV (Gestão de Exceções). ATM: Parte XV (Plano de Evolução, mais explícita que as demais). |
| **Como é substituído** | ADR: campo "Superada por `ADR-NNNN`" — **hoje 0 ADRs superadas** (`docs/05-ADR/INDICE.md`, Dashboard). Os 6 documentos da cadeia: substituição implícita por um arquivo novo com data nova (mesmo padrão da Parte IX) — não há um campo "Superado por" formal como o da ADR. |
| **Como é arquivado** | ADR: estado "Arquivada" no ciclo de vida — **hoje 0 ADRs arquivadas**. Os 6 documentos: `docs/99-Arquivo/` é o destino declarado para "relatórios históricos" (`CLAUDE.md`, fontes de verdade #4) — nenhum dos 6 documentos desta cadeia foi movido para lá ainda, todos estão vigentes. |

**Achado desta Parte:** o ciclo de vida de ADR é significativamente mais maduro (8 estágios, regra
escrita) que o ciclo de vida dos 6 documentos da cadeia ACR–ATM (sem estágio formal além de
"Proposta"). Não é uma inconsistência a corrigir por este AGI — é uma lacuna real, registrada aqui
e recomendada como item para a Parte XIV (Plano de Evolução) ou para uma futura ASM.

---

# PARTE XII — Dashboard Executivo

Todo número abaixo cita a fonte — nenhum recalculado por este AGI além de somas simples
explícitas.

| Indicador | Valor | Fonte |
|---|---|---|
| Documentos da cadeia de governança (ACR–ATM) | 6 | Inventário (Etapa 1) |
| Artefatos previstos, ainda ausentes | 2 (ASM, AEM) | Inventário (Etapa 1) |
| Total de ADRs | 18 (`0001`–`0018`) | `docs/05-ADR/INDICE.md` |
| ADRs Aprovadas/Implementadas (status maduro) | 10 | `docs/05-ADR/INDICE.md` |
| ADRs integralmente Propostas | 2 | `docs/05-ADR/INDICE.md` |
| ADRs Superadas | 0 | `docs/05-ADR/INDICE.md` |
| ADRs Arquivadas | 0 | `docs/05-ADR/INDICE.md` |
| Regras `AER-XXX` | 25 | `docs/00-Governanca/MATRIZ-DE-RASTREABILIDADE-ARQUITETURAL.md` Parte IX |
| Normas `ASNF-XXX` | 125 | `docs/00-Governanca/MANUAL-DE-ENGENHARIA-DE-SOFTWARE.md`, codinome ASNF |
| Antipadrões oficiais (`AP-NN`) | 16 | `docs/00-Governanca/MANUAL-DE-ENGENHARIA-DE-SOFTWARE.md` Parte XIII |
| Princípios (`P-N`) | 10 | `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` Parte I |
| Documentos "Proposta, aguarda adoção formal" | 5 (ABR\*, AGR\*, AER, ASNF, ATM) — \*ABR/AGR não usam a palavra "Proposta" no cabeçalho, mas nenhum dos dois tem processo de aprovação declarado (Parte XI) | Cabeçalhos individuais + Parte XI deste AGI |
| Documentos obsoletos | 0 | Nenhum movido para `docs/99-Arquivo/` |
| Controllers com guarda de autenticação | 19/19 (100%) | ATM Parte XIV |
| Controllers com teste próprio | 3/19 (~16%) | ATM Parte XIV |
| Cobertura de statements agregada (medição real) | 50,28% | ATM Parte XIV (`1589/3160`) |
| Tabelas com `companyId` sob RLS | 0/14 (0%) | ATM Parte XIV |
| Regras/normas com automação real em produção hoje | 1 de 150 (~0,7%) — o teste tripwire `AER-019` | ATM Parte XIV |
| Itens de roadmap rastreados com ID (`B-XX`) | 12/12 (B-38 a B-49) | ATM Parte VII/XIV |
| Itens de melhoria sugeridos pela AGR ainda sem ID no roadmap | 4 | AGR §16, ATM Parte VII |
| Última revisão da cadeia | 2026-08-05 (ABR, AGR, AER, ASNF, ATM, ADR `0009`–`0018`, este AGI) | Cabeçalhos individuais |
| Documentos da cadeia (+ ADRs `0009`–`0018` + este AGI) hoje sem commit | 17 arquivos novos + 3 modificados (`git status` desta sessão) | Verificação direta nesta sessão |

---

# PARTE XIII — Glossário

| Termo | Definição curta |
|---|---|
| **ACR** | Architecture Consolidation Review — consolidação de padrões pós B-38/39/48/49 (2026-08-01). |
| **ABR** | Architecture Baseline Review — inventário do estado atual com evidência de código. |
| **AGR** | Architecture Governance Review — auditoria de onde a governança deveria estar vs. está. |
| **AER** | Architecture Enforcement Review — nome técnico da Constituição Arquitetural; define princípios e regras. |
| **ASNF** | Architecture Standards & Normative Framework — nome técnico do Manual de Engenharia; 125 normas. |
| **ATM** | Architecture Traceability Matrix — matriz de rastreabilidade pura entre todos os artefatos. |
| **ADR** | Architecture Decision Record — registro imutável de uma decisão pontual. |
| **AGI** | Architecture Governance Index — este documento; organiza e explica a cadeia acima. |
| **ASM** | Architecture Scorecard & Maturity — previsto, não existe ainda (Parte XIV). |
| **AEM** | Architecture Evolution Roadmap — previsto, não existe ainda como artefato de governança (Parte XIV). |
| **P-N** | Princípio fundamental da Constituição (`P-1` a `P-10`, AER Parte I). |
| **AER-NNN** | Regra obrigatória da Constituição (`AER-001` a `025`, AER Parte III). |
| **ASNF-NNN** | Norma detalhada do Manual (`ASNF-001` a `125`). |
| **AP-NN** | Antipadrão oficial catalogado no Manual (`AP-01` a `16`, ASNF Parte XIII). |
| **B-XX** | Item numerado do backlog vivo em `ROADMAP_ESTABILIZACAO.md`. |
| **RLS** | Row-Level Security — isolamento multi-tenant a nível de linha no Postgres; **proposto**, não implementado (ADR-0010, AER-005/006). |
| **RBAC** | Role-Based Access Control — modelo de autorização por papel (ADR-0012). |
| **RACI** | Responsible/Accountable/Consulted/Informed — matriz de responsabilidades (Constituição Parte VI, Parte VII deste AGI). |
| **God Service** | Antipadrão AP-01 — classe com fan-out alto e múltiplas responsabilidades não relacionadas; caso real: `WebhookService`. |
| **Trust boundary** | Fronteira onde a confiança no dado muda de nível — mapeada na AGR §9. |
| **Fan-in / Fan-out** | Nº de arquivos que importam um serviço (fan-in) / nº de dependências injetadas no construtor de um serviço (fan-out) — métrica usada para detectar God Service. |
| **Tripwire test** | Teste automatizado que quebra deliberadamente se uma invariante (ex.: valores do enum `ConversationStatus`) mudar sem revisão — único controle 100% automático hoje (AER-019). |
| **Source of Truth (SoT)** | Princípio seguido por este AGI e pela ATM: cada tema tem exatamente um documento dono; os demais referenciam, nunca duplicam. |
| **companyId** | Chave de isolamento multi-tenant presente (por convenção, não por RLS) em toda query do backend — `CLAUDE.md`, P-4/P-9 da Constituição. |
| **Modular Monolith** | Padrão arquitetural adotado (ADR-0009) — módulos NestJS coesos num único deploy, com critérios objetivos de quando extrair um serviço. |

---

# PARTE XIV — Plano de Evolução

## ASM — Architecture Scorecard & Maturity

**Status: PREVISTO.** Não existe nenhum arquivo, script ou dashboard com este nome no
repositório (confirmado de forma independente por este AGI, Etapa 1, reproduzindo a busca já
feita pela ATM Parte I).

**O que falta para existir, com base no que a cadeia já desenhou (sem implementar nada aqui):**
a Constituição Parte V ("Controles Arquiteturais, recorrentes, não por-PR") já **propõe** boa
parte do que um ASM formalizaria — cobertura de teste, deriva de RLS, fan-out, headers Nginx,
consolidação de Redis, CODEOWNERS, idade de exceção — mas today todos esses controles são
manuais (ATM Parte IX: "1 de 150 regras/normas com automação real em produção"). Um ASM real
seria o dashboard vivo que:
1. Executa periodicamente as contagens que hoje a ABR/ATM fazem manualmente por sessão (`find`,
   `grep`, `npx jest --coverage`).
2. Publica os indicadores da Parte XII deste AGI (e da ATM Parte XIV) como série temporal, não
   como fotografia de uma data.
3. Fecha o elo "Monitoramento" que hoje aparece como **NÃO ENCONTRADO** em quase toda linha da
   ATM Parte III (Matriz de Governança).

## AEM — Architecture Evolution Roadmap

**Status: PREVISTO.** Não existe artefato de governança com este nome (a única ocorrência da
sigla no repositório é a colisão não relacionada registrada na Etapa 1).

**Observação relevante para quando for formalizado:** `docs/03-Roadmap/PLANO-DE-EVOLUCAO-ENTERPRISE.md`
já cobre parte do espaço que um AEM ocuparia — um roadmap de evolução v1.0→v4.0 com GAPs
categorizados. A diferença é de **foco**: aquele documento é sobre evolução de **produto e
arquitetura de sistema**; um AEM, pelo nome dado no prompt de origem ("Architecture Evolution
Roadmap"), seria mais estreito — evolução da **própria cadeia de governança** (quando uma nova
ABR/AGR é necessária, quando a AER precisa de uma Parte XI nova, etc.). Cabe ao usuário decidir
se formaliza um AEM dedicado à governança ou se estende o `PLANO-DE-EVOLUCAO-ENTERPRISE.md`
existente para cobrir esse espaço — **este AGI não decide, apenas registra a lacuna e a opção**.

**Como ambos completam a Governança Arquitetural:** hoje a cadeia ACR→ATM+ADR é boa em
**descrever e normatizar** (documentos), fraca em **medir continuamente** (ASM) e em **planejar
sua própria evolução** (AEM). Os dois fecham exatamente essas duas lacunas, sem sobrepor o que já
existe — nenhum dos dois, quando criado, deveria duplicar conteúdo da AER/ASNF/ATM, só consumir o
que elas já produzem.

---

# Relatório Executivo

## 1. Resumo do inventário documental

Todos os 7 artefatos citados no prompt de origem foram localizados, com exceção de 2 (ASM, AEM —
ambos previstos, nenhum implementado). Os 5 documentos mais recentes da cadeia (ABR, AGR, AER,
ASNF, ATM) mais as 10 ADRs mais novas (`0009`–`0018`) foram todos escritos na mesma sessão
(2026-08-05) e ainda **não têm commit** no repositório. O repositório de ADR está maduro (ciclo
de vida de 8 estágios, dashboard próprio); os 6 documentos da cadeia ACR–ATM não têm, entre si,
um processo de aprovação formal — todos os 5 mais recentes seguem em "Proposta".

## 2. Inconsistências encontradas

- A ATM (Parte XIII) já registra a inconsistência mais relevante desta cadeia: a Constituição
  propôs se tornar `ADR-0009`, mas esse número foi ocupado por "Modular Monolith" antes da
  Constituição ser formalizada — ela segue **sem** ADR próprio.
- **Achado novo deste AGI:** a alegação da ATM de que "AEM" não aparece em nenhum arquivo além
  dos prompts que originaram AER/ATM está tecnicamente imprecisa — existe uma colisão de sigla
  não relacionada (`AEM[EmailAdapter]`) num diagrama Mermaid de `PLANO-DE-EVOLUCAO-ENTERPRISE.md`.
  A conclusão de fundo (não existe artefato de governança chamado AEM) permanece correta.
- **Achado novo deste AGI:** `docs/00-Governanca/README.md` e `docs/04-Arquitetura/README.md` —
  os `README.md` das próprias pastas onde os documentos desta cadeia vivem — não foram
  atualizados para listar CONSTITUICAO-ARQUITETURAL.md, MANUAL-DE-ENGENHARIA-DE-SOFTWARE.md,
  MATRIZ-DE-RASTREABILIDADE-ARQUITETURAL.md (`00-Governanca/README.md`, seção "Estado atual") nem
  ABR_2026-08-05_baseline.md/AGR_2026-08-05_governance.md (`04-Arquitetura/README.md`, mesma
  seção) — os 5 arquivos existem fisicamente na pasta, mas ficam órfãos do próprio índice local.
  O índice geral `docs/README.md` também não menciona nenhum dos 6 documentos da cadeia nem este
  AGI.
- **Achado novo deste AGI:** a ACR não segue o padrão de cabeçalho `Versão/Status/Data` adotado
  pelos 5 documentos seguintes da cadeia — é o único sem esses 3 campos explícitos.
- **Achado novo deste AGI:** o ciclo de vida de uma ADR (8 estágios, regra escrita) é mais maduro
  que o ciclo de vida dos 6 documentos ACR–ATM (sem estágio formal além de "Proposta") — ver
  Parte XI.

## 3. Referências quebradas ou documentos ausentes

Nenhuma referência quebrada encontrada entre os 6 documentos da cadeia — todos se citam
mutuamente e os links relativos resolvem para arquivos existentes (verificado nesta sessão).
Documentos ausentes: **ASM** e **AEM**, ambos previstos e registrados como tal (Parte XIV) — não
inventados.

## 4. Riscos para a manutenção da governança

- **Maior risco imediato:** 17 arquivos novos e 3 modificados desta cadeia de governança (5
  documentos + 10 ADRs + este AGI + os 3 arquivos de `05-ADR` alterados) estão fora do controle
  de versão — qualquer perda de working tree local apaga toda a sessão de 2026-08-05.
- **Risco estrutural:** nenhum dos 6 documentos da cadeia tem processo de aprovação formal —
  ficam em "Proposta" indefinidamente sem um gatilho que force a decisão de adoção (mesmo padrão
  observado, não uma regra escrita — Parte XI).
- **Risco de deriva de índice:** os `README.md` de pasta não listam os documentos novos que já
  existem fisicamente ali (achado #3 acima) — quem navegar só pelos `README.md` locais não
  encontra a cadeia inteira.
- **Risco de mono-mantenedor:** a própria Constituição já documenta isso (Parte VI) — nenhuma
  decisão arquitetural passa por um segundo revisor humano hoje.

## 5. Recomendações para a próxima etapa (ASM), sem implementá-la

1. Antes de construir o ASM, decidir formalmente o processo de aprovação da AER/ASNF/ATM (hoje
   ausente) — um dashboard de conformidade contra normas ainda "Proposta" mede algo que não tem
   força normativa confirmada.
2. Priorizar automatizar primeiro os controles que a Constituição Parte V já desenhou com
   ferramenta nomeada (`hadolint`, `gitleaks`, `jscpd`, `jest --coverage` com `coverageThreshold`)
   — é o caminho de menor esforço citado pela própria ATM Parte IX, antes de construir um
   dashboard agregador por cima de controles que ainda não existem.
3. Commitar a cadeia atual (ABR, AGR, AER, ASNF, ATM, ADRs `0009`–`0018`, este AGI) antes de
   iniciar o ASM — não faz sentido medir conformidade contra documentos que podem ser perdidos.
4. Atualizar os `README.md` de `00-Governanca/` e `04-Arquitetura/` (achado #3 acima) para que a
   cadeia inteira seja descobrível sem depender só deste AGI.

## 6. Confirmação

Nenhuma alteração de código, infraestrutura, Docker, Nginx, Prisma, Redis, Bull, pipeline ou
lógica de negócio foi realizada durante a produção deste documento. Nenhum documento existente
(ACR, ABR, AGR, AER, ASNF, ATM, qualquer ADR, `CONVENCAO-DE-NOMENCLATURA.md`,
`PLANO-DE-EVOLUCAO-ENTERPRISE.md` ou qualquer `README.md`) foi editado — todas as divergências e
achados acima ficam registrados exclusivamente neste arquivo novo, por regra explícita do prompt
que o originou.
