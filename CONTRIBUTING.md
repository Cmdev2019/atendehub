# Como contribuir com o AtendeHub

> Leia até o fim antes do primeiro PR. São 10 minutos que evitam retrabalho.
> Idioma do projeto: **PT-BR** — código, comentários, commits e documentação.

---

## As 5 regras inegociáveis

Estas regras vêm da prática do projeto e existem porque a ausência delas já custou tempo real.

### 1. Problema novo vira item com ID **antes** de ser corrigido

Encontrou um bug ou uma lacuna? Registre em [`ROADMAP_ESTABILIZACAO.md`](ROADMAP_ESTABILIZACAO.md) com
ID (`B-NN`), descrição, evidência (`arquivo:linha`), correção proposta e critério de aceite. **Depois**
corrija.

Isso é o que permite responder "por que este código está assim?" dois anos depois.

### 2. Item concluído exige evidência no changelog

Não basta marcar ✅. A entrada no changelog precisa dizer **como você sabe que funciona**: comando
executado, contagem de testes, saída de `curl`, captura de tela.

### 3. Documentação muda no mesmo PR que o comportamento

Alterou um endpoint? [`docs/09-APIs/API_CONTRACT.md`](docs/09-APIs/API_CONTRACT.md) muda no mesmo commit.
Sem exceção. Documentação atualizada depois é documentação nunca atualizada.

### 4. Um PR, um propósito

PR que move arquivo **e** corrige bug é irrevisável. Se encontrar um bug durante uma refatoração:
registre como item, abra PR separado.

### 5. Toda query filtra por `companyId`

O AtendeHub é multi-tenant. Uma query sem filtro de tenant é um vazamento de dados entre empresas
clientes. Isso é verificado em revisão de PR e é motivo de rejeição automática.

---

## Antes de começar

### Ambiente

Siga o [`README.md`](README.md#como-executar). Se algo não funcionar seguindo as instruções, **o problema
é da documentação** — abra uma issue.

### Leitura obrigatória

1. [`CLAUDE.md`](CLAUDE.md) — pitfalls que já custaram sessões de depuração
2. [`docs/00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](docs/00-Governanca/CONVENCAO-DE-NOMENCLATURA.md)
3. [`docs/00-Governanca/BOAS-PRATICAS-DO-REPOSITORIO.md`](docs/00-Governanca/BOAS-PRATICAS-DO-REPOSITORIO.md)
4. [`ROADMAP_ESTABILIZACAO.md`](ROADMAP_ESTABILIZACAO.md) — o que está em andamento

---

## Fluxo de trabalho

```
1. Item existe no roadmap?  ──não──> registre primeiro
        │ sim
        ▼
2. git checkout -b <tipo>/<descricao>
        ▼
3. Implemente + testes + documentação (no mesmo commit lógico)
        ▼
4. Rode a validação local (abaixo)
        ▼
5. Abra o PR usando o template
        ▼
6. CI verde + 1 aprovação
        ▼
7. Merge + atualize o roadmap com evidência
```

### Validação local antes do PR

```bash
# Frontend (na raiz)
npm test                          # 302 testes devem passar
npm run build                     # deve concluir

# Backend
cd apps/api
npm run lint:check                # sem erros
npx tsc --noEmit                  # sem erros
npm test                          # 265 testes devem passar
npm run build                     # deve concluir
```

**PR com suíte vermelha não é revisado.**

---

## Padrões de código

### Nomenclatura

Regra completa em
[`CONVENCAO-DE-NOMENCLATURA.md`](docs/00-Governanca/CONVENCAO-DE-NOMENCLATURA.md). O essencial:

| Elemento | Padrão | Exemplo |
|---|---|---|
| Service | `<dominio>.service.ts` | `conversation.service.ts` |
| DTO | `<verbo>-<dominio>.dto.ts` | `create-contact.dto.ts` |
| Guard | `<nome>.guard.ts` | `roles.guard.ts` |
| Componente React | `PascalCase.jsx` | `ChatPanel.jsx` |
| Hook | `use<Nome>.js` | `useConversations.js` |
| Teste backend | `<arquivo>.spec.ts` | `auth.service.spec.ts` |
| Teste frontend | `<arquivo>.test.js` | `ChatPanel.test.js` |

**Verbos de método têm significado fixo:** `find` pode não achar (retorna `null`); `get` deve achar
(lança exceção); `assert` valida e lança; `upsert` cria ou atualiza.

### Backend (NestJS)

- Toda rota nova precisa de `@UseGuards(JwtAuthGuard)` e do `@Roles` adequado
- DTO com `class-validator` — o `ValidationPipe` tem `forbidNonWhitelisted`, então campo extra no body
  retorna 400
- Regra de negócio no service, nunca no controller
- Sem `any` sem justificativa em comentário
- Log nunca contém dado pessoal (telefone, nome, conteúdo de mensagem)

### Frontend (React)

- Ícones vêm exclusivamente do [svgrepo.com](https://www.svgrepo.com) (coleção Tabler), via
  `src/components/icons.jsx`. **Nunca emoji na UI.**
- Sem `console.log` — use o tratamento de erro existente
- Componente acima de 300 linhas é sinal de que precisa ser quebrado
- Testes mockam `services/api` e `services/websocket` por módulo

### Banco de dados

- Migration com nome descritivo da **mudança**: `add_conversation_resolution` ✅ · `fix_stuff` ❌
- Migration destrutiva **nunca** no mesmo PR da mudança de código — use expand/contract
- Índice novo exige justificativa no PR (qual query ele atende)
- Campo com dado pessoal precisa ser registrado em [`docs/35-LGPD/`](docs/35-LGPD/)

---

## Commits

Conventional Commits em português:

```
<tipo>(<escopo>): <descrição no imperativo, minúscula, sem ponto> [<ID>]
```

**Exemplos reais deste projeto:**

```
fix(webhook): propaga erro do handleEvent para reativar o retry do Bull [B-39]
feat(api): escopo de conversa por departamento no ConversationScopeGuard [B-40]
docs: publica a estrutura de documentação em 41 áreas
chore(deps): atualiza @nestjs/* para 11.1.28
```

| Tipo | Uso |
|---|---|
| `feat` | funcionalidade nova |
| `fix` | correção de defeito |
| `docs` | somente documentação |
| `chore` | manutenção, estrutura, dependência |
| `refactor` | mudança interna sem alterar comportamento |
| `test` | somente teste |
| `perf` | desempenho |
| `build` / `ci` | empacotamento / pipeline |

O corpo do commit explica **por quê**, nunca **o quê** — o diff já mostra o quê.

---

## Branches

```
<tipo>/<escopo-opcional>-<descricao-em-kebab>
```

| Tipo | Vida máxima |
|---|---|
| `feat/` | 5 dias |
| `fix/` | 2 dias |
| `chore/` | 3 dias |
| `docs/` | 2 dias |
| `hotfix/` | horas |

**Branch com mais de 5 dias é sinal de escopo grande demais.** Quebre em PRs menores.

---

## Pull Requests

Use o [template](.github/PULL_REQUEST_TEMPLATE.md) — ele é preenchido automaticamente.

### O que o revisor vai verificar

- [ ] Testes cobrem o comportamento novo, incluindo o caminho de erro
- [ ] Toda query filtra por `companyId`
- [ ] Papel e escopo de permissão corretos na rota
- [ ] Documentação atualizada no mesmo PR
- [ ] Nenhum `console.log` ou `any` novo sem justificativa
- [ ] Query nova tem índice que a atenda
- [ ] Migration segue expand/contract
- [ ] Log não contém dado pessoal
- [ ] Nome de arquivo e identificadores seguem a convenção

### Como revisar

- **Seja específico.** "Isso está errado" não ajuda; "isso vaza dado entre tenants porque o `where` não
  filtra `companyId`" ajuda.
- **Separe bloqueio de sugestão.** Marque explicitamente o que impede o merge e o que é opinião.
- **Aprovar é assumir corresponsabilidade.** Se você não entendeu, pergunte antes de aprovar.

---

## Reportando problemas

| Tipo | Onde |
|---|---|
| Defeito | [Issue de bug](.github/ISSUE_TEMPLATE/bug.yml) |
| Funcionalidade | [Issue de feature](.github/ISSUE_TEMPLATE/feature.yml) |
| **Vulnerabilidade** | **Nunca em issue pública** — veja [`SECURITY.md`](SECURITY.md) |
| Dúvida | Consulte [`docs/`](docs/) antes de abrir |

---

## Propondo mudança arquitetural

Se a mudança afeta mais de um módulo, é cara de reverter ou contraria uma convenção vigente:

1. Copie [`docs/37-Templates/rfc.md`](docs/37-Templates/rfc.md) ou
   [`docs/05-ADR/ADR-0000-template.md`](docs/05-ADR/ADR-0000-template.md)
2. Abra PR com status **Proposta**
3. A discussão acontece no PR, não em conversa paralela
4. Ao ser aceita, o status muda para **Aceita** e entra em
   [`docs/05-ADR/INDICE.md`](docs/05-ADR/INDICE.md)

**ADR aceita nunca é editada.** Para mudar de ideia, escreva outra que a supera.

---

## Perguntas frequentes

**Posso corrigir um bug que encontrei sem registrar item?**
Não. Registre primeiro — leva 2 minutos e preserva o raciocínio.

**Preciso escrever teste para correção de bug?**
Sim, e o teste precisa falhar antes da correção. Caso contrário não há prova de que o bug existia.

**Encontrei código que não segue a convenção. Renomeio tudo?**
Não. Renomeação em massa gera conflito em toda branch aberta. Corrija na próxima vez que tocar no
arquivo por outro motivo.

**Posso adicionar arquivo na raiz do repositório?**
Só com aprovação do tech lead. A raiz é reservada para governança e orquestração.

**Onde coloco um documento novo?**
Em [`docs/`](docs/), na área numerada correspondente. Cada pasta tem um README dizendo o que aceita.
