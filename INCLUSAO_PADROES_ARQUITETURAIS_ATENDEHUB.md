# Inclusão do documento de padrões arquiteturais — relatório

> Registro da inclusão oficial de `docs/04-Arquitetura/PADROES-ARQUITETURAIS-ATENDEHUB.md` na
> documentação do AtendeHub. Data: 2026-08-01.

## 1. Local escolhido

`docs/04-Arquitetura/PADROES-ARQUITETURAIS-ATENDEHUB.md`

## 2. Justificativa

**Fase 1 (análise da estrutura existente):** o projeto já tem uma estrutura de documentação madura, em
41 áreas numeradas (`docs/00-Governanca/PLANO-DE-REESTRUTURACAO.md`), cada uma com `README.md` próprio
declarando objetivo, responsabilidade, conteúdo esperado, quem utiliza e quem pode alterar — decisão já
registrada em `ADR-0001`. `docs/04-Arquitetura/README.md` já declara explicitamente, no seu próprio
conteúdo esperado, "Padrões adotados" e, na seção "Quem pode alterar": *"Mudança estrutural exige ADR
aprovada em `05-ADR` antes do diagrama mudar"* — ou seja, a própria pasta já define a relação
Arquitetura↔ADR que este documento formaliza. `docs/05-ADR/` já existe, com template
(`ADR-0000-template.md`) e índice (`INDICE.md`) próprios, e é explicitamente o lugar de "decisões
arquiteturais imutáveis" — não de guia de consulta rápida.

**Não foram criadas** `docs/adr/`, `docs/patterns/` nem `docs/architecture/` — essas pastas genéricas
não existem no projeto e não foram necessárias: `docs/05-ADR/` e `docs/04-Arquitetura/` já cobrem
exatamente esses papéis, com convenção de nomenclatura própria já estabelecida e em uso.

**Fase 2 (local oficial):** `docs/04-Arquitetura/` é o lugar correto porque o documento (a) é um guia de
padrões de desenvolvimento que atravessa múltiplos domínios (idempotência, concorrência, retry, banco,
mensageria, testes, segurança — não é específico de um módulo do backend, o que descartaria
`06-Backend/` como único lar), e (b) complementa ADRs por design, e a pasta de Arquitetura já é
declarada como a que guarda "padrões adotados" e reconhece as ADRs como fonte de decisão.
`docs/04-Arquitetura/` já continha, desde a Architecture Consolidation Review de 2026-08-01,
`padroes-consolidados-2026-08.md` (inventário/duplicações daquela revisão) — este novo documento é
complementar a ele (aquele é o registro histórico de UMA revisão; este é o guia vivo de consulta
contínua).

### Nome do arquivo — divergência resolvida

O nome pedido, `PADROES_ARQUITETURAIS_ATENDEHUB.md` (com underscore), **não segue** a convenção
normativa real do projeto. `docs/00-Governanca/CONVENCAO-DE-NOMENCLATURA.md` §2.3 ("Documentação") é
explícita:

| Tipo | Padrão | Exemplo |
|---|---|---|
| Documento normativo | `SCREAMING-KEBAB-CASE.md` (hífen) | `CONVENCAO-DE-NOMENCLATURA.md` |

Este documento é normativo por natureza (define padrão oficial, lista prática proibida, exige checklist
de PR) — mesma categoria de `CONVENCAO-DE-NOMENCLATURA.md`. A própria convenção declara: *"Documento
normativo. Em caso de divergência entre este documento e qualquer código existente, este documento
prevalece."* Por isso o arquivo foi criado como **`PADROES-ARQUITETURAIS-ATENDEHUB.md`** (hífen), não
com underscore. O nome com underscore pedido no prompt foi preservado apenas neste relatório de
inclusão (arquivo de registro pontual na raiz, fora da jurisdição de `docs/`, onde `ROADMAP_ESTABILIZACAO.md`
e os relatórios `*_ATENDEHUB.pdf` já usam esse padrão como prática estabelecida, ainda que anterior a
`CONVENCAO-DE-NOMENCLATURA.md` — "código legado", que a própria convenção diz não renomear em massa).

## 3. Arquivos criados

- `docs/04-Arquitetura/PADROES-ARQUITETURAIS-ATENDEHUB.md` — o documento em si: objetivo, índice de 12
  seções (idempotência, persistência atômica, concorrência, retry, DLQ, tratamento de erros,
  observabilidade, banco de dados, mensageria, testes, segurança, documentação), cada uma com problema
  / quando usar / quando não usar / implementação oficial / exemplo real / ADR relacionada; matriz
  situação→padrão→implementação→ADR; anti-padrões proibidos; checklist de PR; relação com B-38/B-39/
  B-48/B-49.
- `INCLUSAO_PADROES_ARQUITETURAIS_ATENDEHUB.md` (este arquivo) — relatório da inclusão.

## 4. Arquivos alterados

- `docs/README.md` — linha da área `04` no "Mapa completo" ganhou o link para o novo documento, sem
  alterar a estrutura da tabela.
- `docs/04-Arquitetura/README.md` — seção "Estado atual" ampliada para listar os dois documentos que a
  pasta já contém (`padroes-consolidados-2026-08.md`, da ACR, e o novo documento de referência).

Nenhum outro arquivo do repositório foi tocado — confirmado via `git status` antes do commit (Fase 8).

## 5. Relação com as ADRs

O documento **não duplica** o conteúdo de nenhuma ADR — cada seção resume problema/quando-usar/
implementação em poucas linhas e linka para a ADR correspondente para a comparação de alternativas e o
raciocínio completo:

| Seção do documento | ADR |
|---|---|
| 1. Idempotência | ADR-0002 |
| 2. Persistência Atômica | ADR-0002, ADR-0003 |
| 3. Concorrência | ADR-0004 |
| 4. Retry | ADR-0005 |
| 5. DLQ | ADR-0006 |
| 6. Tratamento de Erros | ADR-0007 |
| 7. Observabilidade | ADR-0008 |
| 12. Documentação | ADR-0001 |

Seções 8-11 (Banco de Dados, Mensageria, Testes, Segurança) não têm ADR dedicada hoje — documentadas com
base em código real (migrations, guards, validators) e nas ADRs adjacentes onde aplicável, sem inventar
decisão que não foi formalizada. Nenhuma contradição encontrada entre o documento e as 8 ADRs existentes
(0001-0008) — toda referência de nome de componente, arquivo e caminho foi conferida diretamente no
código antes de ser escrita (ver Fase 7).

## 6. Relação com B-38, B-39, B-48 e B-49

Seção dedicada no próprio documento ("Relação com B-38, B-39, B-48 e B-49"), com tabela ligando cada
item aos padrões que ele exercita:

- **B-38** → Segurança (§11): bucket privado, URL assinada, e o achado do hardening (revogar policy
  herdada, não só parar de aplicar uma nova).
- **B-39** → Retry (§4), DLQ (§5), Observabilidade (§7): retry restabelecido, DLQ nova, logs
  estruturados.
- **B-48** → Idempotência (§1), Persistência Atômica (§2), Concorrência (§3): `Message.externalId`,
  `MessageService#createUnique`.
- **B-49** → Idempotência (§1), Persistência Atômica (§2), Concorrência (§3): índice parcial de
  `Conversation`, `ConversationService#upsertFromWebhook`.

## 7. Validações realizadas

- **Fase 5 (consistência):** todo nome de arquivo, símbolo de código (`isUniqueConstraintViolation`,
  `formatStructuredLog`, `MessageService#createUnique`, `ConversationService#upsertFromWebhook`,
  `webhook.errors.ts`, `webhook-queue.config.ts`, `webhook-dlq.*`,
  `safe-media-url.validator.ts`, `queue-names.ts`) e nome de migration citados no documento foram
  conferidos diretamente contra o repositório (`ls`/`grep`) antes de serem escritos — nenhum
  componente inventado.
- **Fase 7 (validação final):**

| Item | Resultado |
|---|---|
| Documento criado no local correto | ✅ `docs/04-Arquitetura/` |
| Nome segue padrão | ✅ `SCREAMING-KEBAB-CASE.md`, corrigido do pedido original (ver seção 2) |
| Estrutura documental respeitada | ✅ nenhuma pasta nova criada |
| ADRs continuam sendo a fonte oficial das decisões | ✅ documento linka, nunca reescreve a comparação de alternativas |
| Não existem duplicações | ✅ conteúdo profundo permanece só nas ADRs |
| Referências corretas | ✅ todo arquivo/símbolo citado confirmado no código |
| Links internos (índice → seções) | ✅ headers conferidos, slugs batem |
| Markdown válido | ✅ tabelas e listas revisadas |
| Pronto para revisão | ✅ |

## 8. Resultado final

Documento incluído em `docs/04-Arquitetura/PADROES-ARQUITETURAIS-ATENDEHUB.md`, integrado ao índice
geral (`docs/README.md`) e ao README da própria pasta, sem criar estrutura paralela, sem duplicar ADR,
sem alterar nem mover nenhum documento existente. Único desvio do pedido original: nome do arquivo
corrigido de `PADROES_ARQUITETURAIS_ATENDEHUB.md` (underscore) para
`PADROES-ARQUITETURAIS-ATENDEHUB.md` (hífen), por exigência da própria convenção normativa do projeto —
decisão registrada e justificada na seção 2 deste relatório.
