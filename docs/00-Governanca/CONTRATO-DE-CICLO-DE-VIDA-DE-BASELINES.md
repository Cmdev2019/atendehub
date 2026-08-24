# Contrato de Ciclo de Vida de Baselines — V2

- **Status:** PROPOSTA — NÃO ADOTADA
- **Versão:** 2.0 · **Data:** 2026-08-24 · **Sucede:** V1 (2026-08-24, não versionada no Git — ver
  Parte 0, Histórico)
- **Natureza:** documento normativo proposto. Não é vinculante até que uma decisão formal e
  registrada (fora do escopo deste documento) o adote. Colocar este documento no Git **não**
  constitui adoção.

> Ciclo de vida deste próprio documento conforme Parte 15. Ele mora em `docs/00-Governanca/`
> porque `docs/00-Governanca/README.md` já declara, na sua própria seção "Conteúdo esperado":
> *"Definição de Ready e Definition of Done"* — este é o local que o projeto já reservava para
> exatamente este conteúdo, antes mesmo deste contrato existir.

---

## Parte 0 — Histórico deste documento

| Versão | Data | Natureza da mudança | Onde viveu |
|---|---|---|---|
| V1 | 2026-08-24 | Criação original — 8 estados (Baseline Atual→Planejamento→Autorização→Execução→Validação→Reconciliação→Aceite→Baseline Sucessora), DoR de 12 itens, DoD de 11 dimensões, regra de não regressão. | Fora do repositório (arquivo de sessão + Artifact hospedado — **nunca commitada**, achado C1 da auditoria de robustez) |
| V2 (este documento) | 2026-08-24 | Estrutural/normativa — adiciona estados de exceção (Suspenso, Abortado, Retomada), separa formalmente os atos de Autorização/Aceite/Reconhecimento com evidência própria para cada um, define objetivamente "divergência" e suas severidades, define Baseline/Commit/Tag/Release/Milestone sem sobreposição, e resolve a própria rastreabilidade (está commitada, nesta versão, pela primeira vez). | `docs/00-Governanca/CONTRATO-DE-CICLO-DE-VIDA-DE-BASELINES.md` |

**Por que V2, não V1.1:** pela regra de versionamento que este próprio documento define (Parte 15),
uma mudança que altera a arquitetura do ciclo (estados novos) ou cria obrigação normativa nova
(evidência distinta por ato de decisão) exige nova versão inteira, não um incremento. Uma V1.1
seria apropriada só para correção de erro sem mudança de estrutura — não é o caso aqui. A V1
permanece histórica e recuperável — o texto integral que a compunha está preservado no relatório
da Fase 3 de auditoria (fora deste repositório) e não é reescrito neste arquivo.

---

## Parte 1 — Objetivo

Regular, de forma determinística e auditável, a transição entre uma Baseline reconhecida do
AtendeHub e sua eventual Baseline Sucessora, por meio de um Ciclo formalmente autorizado,
executado, validado, reconciliado e aceito — incluindo os caminhos excepcionais de suspensão e
abortamento.

## Parte 2 — Escopo

Aplica-se a qualquer conjunto de mudanças que pretenda originar uma nova Baseline reconhecida.
**Não** define o tratamento de correções isoladas fora de um ciclo formal (ex.: hotfix de
produção) — esse caso é **[PENDENTE DE EVIDÊNCIA]** de que deva existir um processo separado;
não presumido aqui.

## Parte 3 — Definições

| Termo | Definição |
|---|---|
| **Baseline** | Estado técnico datado, auditável e reproduzível — não é release, não é tag, não é versão SemVer (ver Parte 13, que separa os cinco conceitos formalmente). |
| **Baseline Atual** | A baseline vigente até o Reconhecimento formal de uma sucessora. |
| **Ciclo** | Conjunto fechado de itens com escopo autorizado, evoluindo a partir da Baseline Atual. |
| **Baseline Sucessora** | Novo estado reconhecido após Aceite e Reconhecimento formal e distintos (Parte 8). |
| **Escopo Autorizado** | Os itens explicitamente aprovados no ato de Autorização (Parte 8, Estado 3). |
| **Escopo Não Autorizado** | Qualquer mudança fora dessa lista — tratamento na Parte 8, Estado 4. |
| **Divergência** | Qualquer diferença observável, verificada por evidência primária (comando executado, leitura de arquivo, resultado de teste), entre o que um documento do ciclo declara e o que o código, os testes, o Git ou a documentação realmente mostram. Definição objetiva completa e matriz de severidade na Parte 6. |
| **Evidência** | Comando executado + resultado, ou artefato equivalente (PDF técnico, log, diff) — nunca "conforme combinado" ou memória de conversa (Parte 7). |
| **Autorização** | Ato formal e distinto que permite iniciar um Ciclo (Parte 8, Estado 3). |
| **Aceite** | Ato formal e distinto que declara que o Ciclo cumpriu seus critérios (Parte 8, Estado 7). |
| **Reconhecimento** | Ato formal e distinto que declara a nova Baseline Sucessora (Parte 8, Estado 8) — **nunca** implícito no Aceite. |
| **Reconciliação** | Estado em que código, testes, documentação, roadmap, evidência e Git concordam entre si, verificado item a item, não por impressão geral. |

---

## Parte 4 — Máquina de estados do ciclo

```
PLANEJADO ──► AUTORIZADO ──► EM EXECUÇÃO ──┬──► CONCLUÍDO ──► ACEITO ──► PROMOVIDO
                                            │
                                            ├──► SUSPENSO ──┬──► EM EXECUÇÃO (retomado)
                                            │                └──► ABORTADO
                                            │
                                            └──► ABORTADO
```

`PROMOVIDO` é o estado em que a Baseline Sucessora foi reconhecida — ponto final do ciclo.
`ABORTADO` é ponto final alternativo — nunca gera `PROMOVIDO`.

### Tabela de transições válidas

| Origem | Evento | Pré-condição | Evidência | Responsável | Destino |
|---|---|---|---|---|---|
| — | Baseline identificada + escopo proposto | Parte 5 (DoR itens 1–10) satisfeita | Registro de Planejamento (Parte 9) | Quem propõe | `PLANEJADO` |
| `PLANEJADO` | Decisão de autorizar | DoR completa (12/12 itens, Parte 5) | **Registro de Autorização** (Parte 9) | Responsável do projeto | `AUTORIZADO` |
| `PLANEJADO` | Decisão de recusar | — | Registro de Autorização com resultado "recusado" | Responsável do projeto | `PLANEJADO` (permanece, escopo pode ser revisto) |
| `AUTORIZADO` | Início de implementação | Escopo autorizado registrado | Primeiro commit vinculado a um item do escopo | Quem executa | `EM EXECUÇÃO` |
| `EM EXECUÇÃO` | Todos os itens obrigatórios atingem DoD do item | DoD do item (Parte 12) por item | Changelog + testes por item | Quem executa | `CONCLUÍDO` |
| `EM EXECUÇÃO` | Decisão de suspender | Motivo registrado | Registro de Suspensão (Parte 10) | Responsável do projeto | `SUSPENSO` |
| `EM EXECUÇÃO` | Decisão de abortar | Motivo registrado | Registro de Abortamento (Parte 10) | Responsável do projeto | `ABORTADO` |
| `SUSPENSO` | Decisão de retomar | Motivo da suspensão resolvido | Registro de Retomada (Parte 10) | Responsável do projeto | `EM EXECUÇÃO` |
| `SUSPENSO` | Decisão de abortar | — | Registro de Abortamento (Parte 10) | Responsável do projeto | `ABORTADO` |
| `CONCLUÍDO` | Validação em 5 camadas sem Divergência CRÍTICA/ALTA aberta | Reconciliação completa (código=testes=doc=roadmap=evidência=Git) | Checklist de Validação (Parte 11) | Quem executa, revisão consciente | `ACEITO` (via Registro de Aceite) |
| `CONCLUÍDO` | Divergência CRÍTICA ou ALTA encontrada | — | Registro da divergência (Parte 6) | Quem valida | `EM EXECUÇÃO` (retorno, não avança) |
| `ACEITO` | Decisão de reconhecer nova baseline | 8 condições da Parte 8, Estado 8 | **Registro de Reconhecimento** (Parte 9), distinto do Registro de Aceite | Responsável do projeto | `PROMOVIDO` |
| `ACEITO` | Decisão de **não** reconhecer (rejeição pós-aceite) | Motivo registrado | Registro de Rejeição de Promoção | Responsável do projeto | `EM EXECUÇÃO` (reabertura, Parte 10) |
| `ABORTADO` | — | — | — | — | Estado terminal — nunca gera `PROMOVIDO` (Parte 10, regra absoluta) |

---

## Parte 5 — Definition of Ready (revisada)

Cada requisito abaixo é individualmente verificável — nenhum é agregado sem ID próprio.

| ID | Descrição | Evidência exigida | Critério objetivo | Responsável | Bloqueia se ausente? |
|---|---|---|---|---|---|
| DoR-01 | Baseline anterior identificada por hash | Commit hash citado no Registro de Planejamento | Hash existe em `git log` | Quem propõe | Sim |
| DoR-02 | Escopo do ciclo fechado | Lista de IDs `B-XX` no Registro de Planejamento | Cada ID existe no roadmap vivo | Quem propõe | Sim |
| DoR-03 | Critério de aceite por item | Texto do critério, um por ID | Presente no roadmap para cada ID do escopo | Quem propõe | Sim |
| DoR-04 | Dependências entre itens do escopo | Declaração explícita, mesmo que "nenhuma comprovada" | Busca documentada em ADRs/roadmap por cada par de itens | Quem propõe | Sim |
| DoR-05 | Riscos conhecidos por item | Lista, mesmo que herdada do texto já existente no roadmap | Pelo menos 1 risco ou "nenhum identificado" registrado por item | Quem propõe | Não — PARCIAL aceitável, registrado |
| DoR-06 | Evidências necessárias definidas | Tipo de evidência por item (comando, PDF, etc.) | Consistente com Parte 7 | Quem propõe | Sim |
| DoR-07 | Impacto arquitetural conhecido | ADRs relevantes citadas por ID | ADR existe em `docs/05-ADR/` | Quem propõe | Sim |
| DoR-08 | Impacto documental conhecido | Lista de documentos a atualizar | Coerente com Parte 11 (Camada Documental) | Quem propõe | Sim |
| DoR-09 | Responsável pela execução nomeado | Nome/identificador no Registro de Planejamento | Não pode ficar implícito por "é sempre a mesma pessoa" | Quem propõe | Não — PARCIAL aceitável enquanto mono-mantenedor, registrado como tal |
| DoR-10 | Responsável pela Autorização nomeado | Idem | Idem | Quem propõe | Sim (mesmo que a resposta seja "o mesmo mono-mantenedor", precisa estar escrito) |
| **DoR-11** | **Autorização formal registrada** | **Registro de Autorização (Parte 9), independente dos demais** | **Existe entrada com resultado "autorizado" no log de decisões** | **Responsável do projeto** | **Sim — sem DoR-11, o ciclo nunca sai de `PLANEJADO`** |
| DoR-12 | Baseline Atual não está, ela mesma, com uma divergência CRÍTICA aberta | Nenhuma divergência CRÍTICA sem tratamento na baseline de origem | Verificação contra o Registro de Divergências (Parte 6) | Quem propõe | Sim |

DoR-11 é **item independente dos demais** por definição (endereça diretamente o Achado C3 da
auditoria de robustez): mesmo que DoR-01 a DoR-10 e DoR-12 estejam 100% satisfeitos, sem DoR-11 o
`STATUS` do ciclo permanece `PLANEJADO`, nunca avança.

---

## Parte 6 — Divergência: definição objetiva e matriz de severidade

Resolve o Achado C2 (termo "divergência crítica" indefinido na V1).

**Divergência** (definição única, ver Parte 3) só existe quando comprovada por evidência primária
— nunca por suspeita, "parece", ou impressão de quem revisa.

| Severidade | Critério objetivo (fechado — só se enquadra se corresponder literalmente a um destes) | Bloqueia item? | Bloqueia ciclo? | Impede Aceite? | Impede Reconhecimento? | Exige decisão do responsável? |
|---|---|---|---|---|---|---|
| **CRÍTICA** | (a) um teste que deveria passar falha; **ou** (b) isolamento multi-tenant comprovadamente violado (query sem `companyId` onde o padrão do projeto exige); **ou** (c) evidência exigida por este contrato está ausente para um item do escopo; **ou** (d) documentação/roadmap declara ✅ para algo que o código não implementa, verificado por leitura direta do código | Sim | Sim | Sim | Sim | Sim — sempre, sem exceção |
| **ALTA** | (a) mudança arquiteturalmente relevante sem ADR correspondente criada/atualizada; **ou** (b) commit sem vínculo a ID `B-XX` rastreável; **ou** (c) documentação do item parcialmente desatualizada (não nega o que foi feito, mas omite parte) | Não, individualmente | Não, individualmente | **Sim** | **Sim** | Sim, antes do Aceite |
| **MÉDIA** | (a) nomenclatura inconsistente entre dois documentos referindo o mesmo fato (ex.: severidade divergente do mesmo item em duas seções); **ou** (b) cobertura de teste abaixo do desejável, sem quebrar teste existente; **ou** (c) documento de apoio desatualizado (ex.: README de pasta) sem afetar o item em si | Não | Não | Não | Não | Registrada no relatório de reconciliação como pendência aberta — não bloqueia, mas não desaparece |
| **BAIXA** | Erro de digitação, formatação, ou nomenclatura cosmética sem ambiguidade de significado | Não | Não | Não | Não | Não — corrigível a qualquer momento sem processo formal |

Nenhuma divergência pode ser classificada fora destas quatro categorias por "julgamento" — se um
achado não se enquadra literalmente em nenhum critério listado, ele **não é uma divergência**
para efeito deste contrato até que uma nova categoria seja adicionada por uma versão nova deste
documento (Parte 15).

---

## Parte 7 — Evidência (regra geral)

Nenhuma decisão de Autorização, Aceite ou Reconhecimento pode existir apenas como conversa,
memória, comentário, interpretação ou "conforme combinado". Toda evidência é um destes três tipos:

1. **Comando + resultado** — texto do comando executado e sua saída literal.
2. **Diff/leitura de arquivo** — trecho do arquivo antes/depois, ou citação de linha.
3. **Artefato equivalente** — PDF técnico, log estruturado, script de validação com saída anexada
   (mesmo padrão já usado pelo projeto em `B-38`/`B-39`/`B-48`/`B-49`).

---

## Parte 8 — Os três atos formais e distintos

Resolve o Achado A1 (Aceite e Reconhecimento podiam colapsar num único ato na V1).

| Ato | Estado que produz | O que declara | Evidência própria e obrigatória | Nunca pode ser inferido de |
|---|---|---|---|---|
| **Autorização** | `PLANEJADO` → `AUTORIZADO` | Que o ciclo pode começar | Registro de Autorização (Parte 9), com DoR-11 preenchido | Um commit existir; um branch existir |
| **Aceite** | `CONCLUÍDO` → `ACEITO` | Que o ciclo cumpriu seus critérios técnicos e documentais | Registro de Aceite (Parte 9), citando o checklist de Validação (Parte 11) item a item | Testes verdes sozinhos; DoD do item sozinho |
| **Reconhecimento** | `ACEITO` → `PROMOVIDO` | Que um commit específico é a nova Baseline Sucessora | Registro de Reconhecimento (Parte 9), **arquivo/entrada própria, distinta do Registro de Aceite, com timestamp próprio** | O Aceite ter acontecido; um merge; uma tag |

**Regra de separação:** o Registro de Aceite e o Registro de Reconhecimento são **duas entradas
diferentes** no artefato de decisão (Parte 9), cada uma com seu próprio ID, mesmo quando tomadas
na mesma sessão de trabalho pelo mesmo responsável. Isso é deliberado: força que a pessoa escreva
duas justificativas distintas ("por que aceito o ciclo" e, separadamente, "por que reconheço este
commit específico como baseline"), em vez de uma frase única cobrindo os dois atos.

---

## Parte 9 — Artefato de decisão

**Nome:** Registro de Decisão de Ciclo.
**Onde fica:** `docs/00-Governanca/REGISTRO-DE-DECISOES-DE-CICLO.md` — arquivo próprio, criado no
momento da **primeira decisão real** (não populado especulativamente por este contrato, já que
hoje não existe nenhum ciclo autorizado — criar o arquivo vazio agora produziria um artefato de
governança sem conteúdo real, o mesmo antipadrão que a AGI já critica em outro contexto).
**Formato:** uma tabela, uma linha por decisão (Autorização, Aceite, Reconhecimento, Suspensão,
Abortamento, Retomada, ou Rejeição de Promoção são todos "tipos" desse mesmo artefato).

| Campo | Obrigatório | Descrição |
|---|---|---|
| `ID` | Sim | `DEC-NNN`, sequencial, nunca reutilizado |
| `Tipo` | Sim | Autorização · Aceite · Reconhecimento · Suspensão · Abortamento · Retomada · Rejeição de Promoção |
| `Data` | Sim | ISO 8601 |
| `Responsável` | Sim | Quem decidiu |
| `Baseline de origem` | Sim | Hash do commit vigente no momento da decisão |
| `Escopo` | Sim | IDs `B-XX` envolvidos |
| `Justificativa` | Sim | Texto — o "por quê", nunca só "ok" |
| `Evidências` | Sim | Lista de comandos/arquivos/PDFs citados (Parte 7) |
| `Resultado` | Sim | Autorizado/Recusado · Aceito/Reprovado · Reconhecido/Rejeitado · etc. |
| `Commit relacionado` | Quando aplicável | Hash do commit que a decisão referencia |
| `Status` | Sim | Vigente · Superada · Corrigida |
| `Observações` | Não | Contexto adicional |

**Como é versionado:** Conventional Commit por entrada nova (`docs(governanca): registra DEC-NNN —
<tipo> do ciclo <escopo>`), nunca reescrita de linha existente.
**Como é referenciado:** por ID (`DEC-NNN`), citado no roadmap e em qualquer ADR nova gerada pelo
ciclo.
**Como é auditado:** por leitura direta da tabela — cada linha é uma prova independente, sem
depender de nenhuma outra fonte.
**Como é invalidado:** nunca por exclusão. Uma decisão errada ganha uma **nova linha** com
`Status = Corrigida` referenciando o `ID` da linha original, que passa a `Status = Superada` —
mesmo padrão do ciclo de vida de ADR já usado pelo projeto (nunca editar, sempre suceder).
**Como é corrigido sem apagar histórico:** ver regra acima — é a aplicação direta da Parte 14
(Imutabilidade) a este artefato específico.

---

## Parte 10 — Protocolo de suspensão e abortamento

Resolve o Achado A2 (ciclo interrompido voluntariamente não tinha tratamento na V1).

### Suspensão (`EM EXECUÇÃO` → `SUSPENSO`)

Usada quando a interrupção é temporária e a retomada é esperada.

1. Responsável registra `DEC-NNN` tipo Suspensão, com motivo.
2. Estado do ciclo muda para `SUSPENSO` — nenhum novo commit do escopo deve ocorrer enquanto
   suspenso.
3. Itens já com DoD do item satisfeito **permanecem satisfeitos** — não retrocedem.
4. A Baseline Atual **não muda** — continua sendo a mesma de antes do ciclo começar.

### Retomada (`SUSPENSO` → `EM EXECUÇÃO`)

1. Responsável registra `DEC-NNN` tipo Retomada, citando o motivo original da suspensão e por que
   está resolvido.
2. Ciclo volta a `EM EXECUÇÃO` com o mesmo escopo — a menos que uma mudança de escopo seja
   decidida explicitamente (Parte 8, Estado 4, mesma regra de Escopo Não Autorizado).

### Abortamento (`EM EXECUÇÃO` ou `SUSPENSO` → `ABORTADO`)

Usada quando o ciclo não vai continuar. Responde às 10 perguntas obrigatórias:

| Pergunta | Resposta normativa |
|---|---|
| O que acontece com commits já feitos? | Permanecem no histórico do Git (nunca reescritos, Parte 14) — mas não são reconhecidos como parte de nenhuma Baseline até um ciclo futuro os incorporar formalmente. |
| O que acontece com código parcial? | Permanece no branch do ciclo abortado — não é mesclado à Baseline Atual. |
| O que acontece com documentação parcial? | Permanece registrada como histórico do ciclo abortado — não é promovida a "estado atual" do roadmap. |
| O que acontece com o backlog? | Itens que atingiram DoD do item **podem** ser marcados como tal no roadmap (o trabalho é real), mas o roadmap deve indicar que o ciclo como um todo foi abortado, não concluído. |
| O que acontece com as evidências já produzidas? | Preservadas — reaproveitáveis por um ciclo futuro que reabra o mesmo escopo. |
| O que acontece com a Baseline anterior? | Permanece intocada e vigente — um ciclo abortado nunca a substitui (regra absoluta abaixo). |
| Pode retomar depois? | Só como um **novo ciclo** (novo `DEC-NNN` de Autorização), não como continuação automática do ciclo abortado. |
| Quem autoriza a retomada (como novo ciclo)? | O mesmo processo de Autorização da Parte 8 — nenhum atalho por já ter sido tentado antes. |
| Pode iniciar novo ciclo com escopo sobreposto? | Sim, mediante nova Autorização — ver Parte 16 (não permitir dois ciclos simultâneos sobre a mesma Baseline sem essa distinção clara). |
| Como evitar confusão entre ciclo abortado e baseline? | O `DEC-NNN` de Abortamento é permanente e público (Parte 9) — qualquer auditoria futura encontra o registro exato de que aquele ciclo nunca chegou a `PROMOVIDO`. |

**Regra absoluta:** um ciclo abortado **jamais** gera Baseline Sucessora automaticamente, sob
nenhuma circunstância — não há caminho na máquina de estados (Parte 4) que ligue `ABORTADO` a
`PROMOVIDO`.

---

## Parte 11 — Validação em camadas

| Camada | Verifica | Evidência |
|---|---|---|
| 1 — Item | O critério de aceite específico do `B-XX` foi atendido? | Roadmap + comando/resultado |
| 2 — Técnica | Testes, typecheck, build, lint, integração quando aplicável | `npx jest`, `tsc --noEmit`, `npm run build`, `npm run lint:check` |
| 3 — Arquitetural | ADR aplicável respeitada/criada; padrões da ACR seguidos; isolamento multi-tenant preservado; dependências justificadas | Diff + ADR citada |
| 4 — Documental | Roadmap, `CHANGELOG.md`, `API_CONTRACT.md` (se endpoint mudar), ADR — todos reconciliados | Diff da documentação |
| 5 — Reconciliação | Código = Testes = Documentação = Roadmap = Evidência = Git, verificados um a um, não por impressão geral | Checklist explícito, uma linha por elemento |

Uma Divergência CRÍTICA ou ALTA (Parte 6) em qualquer camada impede o avanço a `ACEITO` — a
máquina de estados (Parte 4) retorna o ciclo a `EM EXECUÇÃO`.

---

## Parte 12 — Definition of Done: três conceitos, nunca equivalentes

Resolve o Fase 17 do pedido de auditoria — impede que "item concluído", "ciclo concluído" e
"promoção" sejam tratados como sinônimos.

### DONE DO ITEM

Um `B-XX` individual atinge as 11 dimensões abaixo:

| Dimensão | Critério |
|---|---|
| Técnico | Código implementado conforme critério de aceite; comportamento funcional validado |
| Arquitetural | ADR aplicável respeitada ou criada; padrões da ACR seguidos |
| Testes | Cobertura nova/atualizada; suíte verde; nenhum teste pré-existente quebrado |
| Segurança | Isolamento multi-tenant preservado; sem regressão de superfície de ataque |
| Documentação | Roadmap atualizado; `API_CONTRACT.md` se endpoint mudar |
| Evidência | Comando + resultado anexado; PDF técnico se alto risco |
| Rastreabilidade | Commit vinculado ao ID `B-XX` |
| Git | Working tree consistente; commit identificável |
| Governança | Regras formalmente adotadas respeitadas — hoje, nenhuma norma AER/ASNF é vigente, cláusula sem efeito prático até adoção formal |
| — | *(Aceite e Reconciliação não se aplicam ao item isolado — são conceitos de ciclo)* |

### DONE DO CICLO

Todos os itens do escopo autorizado (Parte 8, Estado 3) atingem DONE DO ITEM, **e** a Camada 5 de
Validação (Reconciliação, Parte 11) fecha sem Divergência CRÍTICA ou ALTA aberta. Produz o estado
`CONCLUÍDO` — ainda **não** é `ACEITO`.

### PROMOÇÃO

Ato distinto, posterior a `ACEITO` (Parte 8). Exige as 8 condições cumulativas:

1. Ciclo em estado `ACEITO` (Registro de Aceite existe, Parte 9).
2. Todos os critérios de DONE DO CICLO atendidos.
3. Evidências completas para todos os itens.
4. Documentação reconciliada (Camada 4/5 fechadas).
5. Git consistente (working tree limpo, histórico linear preservado).
6. Nenhuma Divergência CRÍTICA ou ALTA sem tratamento.
7. Registro de Aceite existente (distinto do próximo item).
8. **Registro de Reconhecimento próprio, com evidência própria** (Parte 8) — nunca inferido do
   Registro de Aceite.

**Nenhuma equivalência é permitida:** DONE DO ITEM ≠ DONE DO CICLO ≠ PROMOÇÃO. Um ciclo inteiro
pode estar em `CONCLUÍDO` (todos os itens DONE) por tempo indefinido sem jamais avançar a
`PROMOVIDO`, se o Aceite ou o Reconhecimento não forem formalmente registrados — esse limbo é
válido e esperado pela máquina de estados (Parte 4), não é uma falha a esconder.

---

## Parte 13 — Baseline, Commit, Tag, Release, Milestone: sem sobreposição

| Conceito | Definição | Quem cria | Relação com este contrato |
|---|---|---|---|
| **Baseline** | Estado técnico reconhecido — resultado de um `PROMOVIDO` (Parte 4) ou da baseline original antes de qualquer ciclo | Reconhecimento (Parte 8) | É o objeto central deste contrato |
| **Commit** | Objeto Git que representa um estado da árvore de arquivos | `git commit`, por qualquer autor | Todo commit é candidato a ancorar uma Baseline; nenhum é Baseline por si só (Parte 3) |
| **Tag** | Marcador Git opcional apontando para um commit | `git tag`, manual | **Não é exigida** por este contrato para reconhecer uma Baseline — é uma decisão de publicação separada, `[DECISÃO PENDENTE]` do responsável (ver Parte 20 do relatório de auditoria) |
| **Release** | Publicação formal de uma versão, tipicamente amarrada a uma tag e a um `CHANGELOG.md` | Processo de release (fora do escopo deste contrato) | Uma Baseline pode nunca virar Release; uma Release sempre se apoia numa Baseline reconhecida |
| **Milestone** | Instrumento de planejamento (GitHub Milestone ou equivalente) — agrupa itens por prazo/objetivo | Ferramenta de gestão | Pode agrupar os itens de um Ciclo para visibilidade, mas não substitui o Registro de Autorização (Parte 9) |

Nenhum destes cinco conceitos pode ser usado como substituto de outro dentro deste contrato — em
particular, **criar uma tag não constitui Reconhecimento** (endereça o atalho #6 identificado na
auditoria de robustez, Achado M5).

---

## Parte 14 — Imutabilidade histórica

Uma Baseline reconhecida (`PROMOVIDO`) não pode ser retroativamente alterada. O histórico deve
continuar auditável. Especificamente, é proibido:

- reescrever um commit histórico (`git commit --amend`, `rebase` de commit já promovido);
- mover uma referência histórica para apontar a outro estado;
- apagar um Registro de Decisão (Parte 9) — mesmo que errado;
- substituir um documento de governança sem preservar a versão anterior no histórico do Git.

**Correções geram nova versão** — de um documento (Parte 15) ou uma nova linha no Registro de
Decisão (Parte 9, "Corrigida"/"Superada") — nunca edição silenciosa do que já existe.

## Parte 15 — Versionamento deste próprio contrato

| Tipo de mudança | Critério | Exige nova versão? |
|---|---|---|
| Editorial | Correção de digitação, formatação, clareza de frase, sem mudar significado normativo | Não — pode ser corrigida in-place, registrada no histórico do Git (commit explica o quê) |
| Corretiva | Corrige erro factual ou de referência (ex.: link quebrado, ID errado) sem mudar regra | Sim — versão de patch conceitual (ex.: V2 → V2.1), preservando o texto anterior no histórico do Git |
| Normativa | Adiciona, remove ou altera uma obrigação (ex.: novo item de DoR obrigatório) | Sim — nova versão inteira (V2 → V3) |
| Estrutural | Altera a máquina de estados (Parte 4), a separação dos atos formais (Parte 8), ou qualquer outro mecanismo central | Sim — nova versão inteira, com justificativa própria na Parte 0 (Histórico) |

A versão anterior **permanece recuperável** — pelo histórico do Git deste arquivo
(`git log -- docs/00-Governanca/CONTRATO-DE-CICLO-DE-VIDA-DE-BASELINES.md`), nunca apagada.

---

## Parte 16 — Regra sobre ciclos simultâneos

Não é permitido mais de um ciclo em estado `AUTORIZADO`, `EM EXECUÇÃO` ou `SUSPENSO` sobre a mesma
Baseline Atual ao mesmo tempo, sem que os Registros de Autorização de cada um declarem
explicitamente a coexistência e o escopo de cada um não se sobreponha em nenhum ID `B-XX`. Isso
evita duas promoções concorrentes disputando a mesma Baseline Atual como origem.

---

## Parte 17 — Relação com ADRs, roadmap e Enterprise v1.0

- **ADRs:** mudança arquiteturalmente relevante deve estar amparada por ADR existente ou gerar ADR
  nova, seguindo `ADR-0000-template.md`, com o campo "Relação com Governança" preenchido.
- **Roadmap:** o Ciclo é rastreado no `ROADMAP_ESTABILIZACAO.md` (documento vivo) — não no
  `PLANO-DE-EVOLUCAO-ENTERPRISE.md`, que é uma fotografia estática sem changelog próprio.
- **Enterprise v1.0:** este contrato define **como** o projeto evolui entre baselines; o Plano
  Enterprise define **o que** compõe um objetivo de produto. Camadas independentes — nenhuma
  correspondência entre um ciclo autorizado sob este contrato e uma fase do Plano Enterprise
  constitui equivalência normativa, só rastreabilidade informativa.

---

## Parte 18 — O que este documento não faz

- Não adota a si mesmo. Status permanece **PROPOSTA — NÃO ADOTADA** até decisão formal separada
  do responsável pelo projeto.
- Não declara `2451e08` (ou qualquer commit) como Baseline reconhecida — isso exigiria um
  Registro de Reconhecimento (Parte 9) que não existe.
- Não autoriza nenhum ciclo, incluindo `B-40`..`B-47`.
- Não cria tag, release ou milestone.
- Não altera nenhum roadmap, ADR ou item de backlog existente.
