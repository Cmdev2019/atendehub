# Boas Práticas para Manter o Repositório Organizado

> Organizar um repositório é fácil; **mantê-lo organizado é a parte difícil**. Este documento existe
> porque a entropia é o estado natural: sem regra explícita, todo repositório converge para arquivos
> soltos na raiz e documentação que ninguém confia.
> Última revisão: 2026-07-28

---

## As 12 regras

### 1. A raiz é sagrada

**Nada novo entra na raiz sem aprovação do tech lead.**

A raiz contém apenas: governança (`README`, `CONTRIBUTING`, `SECURITY`, `LICENSE`, `CHANGELOG`,
`CODE_OF_CONDUCT`, `CLAUDE.md`), orquestração (`package.json` de workspaces) e configuração que
ferramentas **exigem** ali (`.gitignore`, `.editorconfig`, `.dockerignore`).

Antes de adicionar arquivo à raiz, pergunte: *"existe uma pasta onde isto pertence?"* A resposta quase
sempre é sim.

### 2. Todo diretório tem um dono e um README

Um diretório sem `README.md` é um diretório onde ninguém sabe o que pode entrar. As 49 pastas de `docs/`
já seguem isso, com as seis seções obrigatórias: objetivo, responsabilidade, conteúdo esperado, quem
utiliza, quando utilizar, quem pode alterar.

Ao criar diretório novo em qualquer lugar do repositório, crie o README junto — no mesmo commit.

### 3. Artefato gerado nunca é versionado

Build, cobertura, log, PDF, `node_modules`, cliente Prisma gerado, dump de banco: nenhum entra no Git.
Se precisa ser compartilhado, é artefato de CI ou vai para storage — não para o repositório.

**Regra prática:** se o arquivo pode ser reproduzido por um comando, não versione o arquivo — versione o
comando.

> Já aplicado: os 4 PDFs de relatório foram movidos para `docs/99-Arquivo/relatorios-pdf/` e ignorados.
> A fonte markdown é que é versionada.

### 4. Documentação muda no mesmo PR que o comportamento

**Documentação atualizada depois é documentação nunca atualizada.**

Já é regra vigente no projeto para o contrato de API ("atualizar no mesmo commit que alterar um
endpoint"). Estenda para: alterou rota → atualiza `09-APIs`; alterou schema → atualiza
`08-Banco-de-Dados`; alterou evento de socket → atualiza `11-WebSocket`; alterou procedimento
operacional → atualiza `26-DevOps`.

A revisão de PR deve **rejeitar** mudança de comportamento sem a documentação correspondente.

### 5. Problema novo vira item com ID antes de ser corrigido

Regra já vigente e comprovadamente eficaz neste projeto: nada de correção sem registro. Todo achado vira
item no roadmap com ID, e todo item concluído exige evidência no changelog.

Isso é o que permite responder "por que este código está assim?" dois anos depois.

### 6. Decisão cara de reverter vira ADR

Se a decisão afeta mais de um módulo, é difícil de desfazer ou contraria uma convenção vigente, ela vira
uma ADR em `docs/05-ADR/` — **antes** de ser implementada, não depois.

ADR aceita nunca é editada. É superada por outra que a referencia. Isso preserva o raciocínio da época,
que é justamente o que se perde primeiro.

### 7. Um PR, um propósito

PR que move arquivos **e** corrige bug é irrevisável: o revisor não consegue distinguir movimentação de
mudança de comportamento, e o `git blame` fica inútil.

Se durante uma refatoração você encontrar um bug: registre como item, abra PR separado. É mais lento em
um PR e mais rápido no trimestre.

### 8. Branch curta

Branch com mais de 5 dias é sinal de escopo grande demais. Quebre.

Branch longa acumula conflito, atrasa integração e torna a revisão superficial — ninguém revisa 3.000
linhas com atenção. É também o que transforma uma reestruturação simples em pesadelo de merge.

### 9. Teste mora perto do que testa — exceto quando cruza fronteira

- Teste **unitário** fica ao lado do código (`conversation.service.spec.ts` junto de
  `conversation.service.ts`). Já é o padrão do projeto e funciona.
- Teste que **cruza aplicações** (e2e, carga, estresse, segurança, smoke) vai para `tests/` na raiz,
  separado por natureza.

Critério: se o teste só faz sentido com uma aplicação, mora nela; se precisa das duas ou de
infraestrutura real, mora em `tests/`.

### 10. Convenção automatizada é convenção cumprida

Regra que depende de alguém lembrar não é cumprida. Sempre que possível, automatize: `commitlint` para
mensagem de commit, ESLint para nomenclatura, `CODEOWNERS` para revisão por área, verificador de link
para documentação.

Onde não é possível automatizar, a verificação vira item de checklist de PR.

### 11. Pasta vazia é dívida visível — e isso é bom

As 49 pastas de `docs/` não estão todas preenchidas, e não há problema nisso. Uma pasta vazia com README
declarando o que deveria conter comunica uma lacuna conhecida. É honesto e acionável.

O que **não** é aceitável é pasta vazia por mais de um ciclo sem que alguém a olhe. Revise
trimestralmente: ou o conteúdo é criado, ou a pasta é removida com justificativa.

### 12. Arquive, não apague

Documento superado vai para `docs/99-Arquivo/` com nota explicando o que o substituiu. Nunca é deletado.

O histórico de como o entendimento evoluiu tem valor — especialmente para quem chega depois e quer
entender por que algo não foi feito do jeito óbvio.

---

## Rituais de manutenção

| Ritual | Frequência | Responsável | O que fazer |
|---|---|---|---|
| **Revisão de raiz** | Mensal | Tech lead | Conferir se algo entrou na raiz sem aprovação |
| **Revisão de pastas vazias** | Trimestral | Tech lead | Preencher ou remover com justificativa |
| **Verificação de links** | A cada release | CI | Nenhum link markdown quebrado |
| **Revisão de `99-Arquivo`** | Semestral | Tech lead | Confirmar que nada ali é citado como fonte de verdade |
| **Revisão da convenção** | Semestral | ARB | A convenção reflete a prática? Se não, ajuste um dos dois |
| **Auditoria de dependências** | Semanal | Dependabot | Triagem de PRs de atualização |
| **Revisão de `CODEOWNERS`** | A cada mudança de time | Tech lead | Toda área tem dono ativo |

---

## Antipadrões observados neste repositório

Registrados para que não se repitam. Nenhum é crítico; todos são sintoma de crescimento sem convenção
declarada — que é exatamente o que esta reestruturação corrige.

| Antipadrão | Onde ocorreu | Por que é problema | Correção |
|---|---|---|---|
| **Aplicação na raiz do monorepo** | `src/` do frontend | Assimetria com `apps/api`; raiz poluída com 6 configs do front; o `.gitignore` já ignorava `apps/web/.env`, provando que a estrutura pretendida era outra | Fase 1 |
| **Documentação sem taxonomia** | `docs/` com 7 arquivos soltos | Documento novo não tem destino óbvio; ninguém sabe onde procurar | Fase 0 ✅ |
| **Documento vivo virando arquivo gigante** | `ROADMAP_ESTABILIZACAO.md` com 236 KB | Excelente como changelog, inconsultável como referência: mistura plano, execução e histórico | Separar plano (`03-Roadmap`) de changelog (`32-Releases`) |
| **`.env.example` genérico que não é genérico** | `.env.example` da raiz é do **front** | Quem chega copia achando que configura o projeto todo | Fase 3: `config/env/<app>.env.example` |
| **Artefato binário em `docs/`** | 4 PDFs de relatório | Infla o repositório para sempre; Git não remove blob do histórico | Fase 0 ✅ |
| **Componente-monólito** | `SettingsPanel.jsx` (1.571 linhas), `apiMock.js` (1.161) | Irrevisável; qualquer alteração conflita | v1.1 do roadmap |
| **Organização por tipo em vez de por feature** | `src/components/`, `src/hooks/` | Adicionar uma feature toca 5 pastas; remover deixa resíduo | Fase 1 + v1.1 |
| **Convenção implícita** | Backend seguia convenção consistente, mas não declarada | Funciona enquanto o time é pequeno; quebra no primeiro dev novo | Fase 0 ✅ |

---

## Como um dev novo deve usar este repositório

1. Ler o [`README.md`](../../README.md) da raiz — visão geral e como executar
2. Ler o [`CLAUDE.md`](../../CLAUDE.md) — pitfalls que custaram sessões de depuração
3. Ler [`docs/README.md`](../README.md) — mapa da documentação
4. Ler [`CONVENCAO-DE-NOMENCLATURA.md`](CONVENCAO-DE-NOMENCLATURA.md) — antes do primeiro commit
5. Ler [`docs/39-Glossario/`](../39-Glossario/) — a linguagem do domínio
6. Ler [`docs/04-Arquitetura/`](../04-Arquitetura/) — como o sistema é construído
7. Consultar [`docs/05-ADR/`](../05-ADR/) sempre que pensar "por que isso foi feito assim?"

**Se algo neste fluxo não fizer sentido, o problema é da documentação, não de quem está lendo.** Abra
uma issue.
