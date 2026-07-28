# ADR-0001 — Adotar estrutura de monorepo com documentação numerada por área

- **Status:** Aceita
- **Data:** 2026-07-28
- **Decisores:** Architecture Review Board
- **Contexto técnico:** repositório inteiro — estrutura de pastas, documentação e governança

## Contexto

O repositório cresceu por acréscimo, sem convenção estrutural declarada. O resultado, verificado em
auditoria sobre `master @ de1da24`:

- **Assimetria estrutural:** o backend vive em `apps/api`, mas o frontend vive na **raiz** (`src/`),
  junto de 6 arquivos de configuração exclusivos dele. O repositório se apresenta como monorepo mas só
  metade dele está organizada como tal.
- **Evidência de intenção original perdida:** o `.gitignore` ignora `apps/web/.env`, um caminho que
  nunca existiu — prova de que `apps/web/` era o destino pretendido para o frontend.
- **Documentação sem taxonomia:** 7 arquivos soltos em `docs/`, mais `archive/` com 23 documentos
  históricos e 4 PDFs binários não versionados. Documento novo não tinha destino óbvio.
- **Ausência de governança formal:** sem ADR, sem template de issue ou PR, sem `CODEOWNERS`, sem
  convenção de nomenclatura escrita — apesar de o código **seguir** convenções consistentes na prática,
  especialmente no backend.
- **Testes sem separação por natureza:** 567 testes unitários bem distribuídos, mas um único arquivo
  e2e, localizado em `apps/api/test/`, o que implicitamente sinaliza que e2e é assunto do backend.

O projeto tem 24 meses de roadmap planejado, prevê múltiplos desenvolvedores e evolução de plataforma
mono-canal para omnichannel com marketplace. A estrutura atual não sustenta isso.

## Alternativas consideradas

### Alternativa A — Manter a estrutura atual e apenas documentar melhor
- **Prós:** custo zero; nenhum conflito de merge; nenhum risco
- **Contras:** documentar uma estrutura incoerente não a torna coerente; a assimetria `apps/api` vs
  `src/` continuaria confundindo todo dev novo; workspaces e cache de build permaneceriam inviáveis
- **Custo:** zero agora, crescente depois

### Alternativa B — Separar em múltiplos repositórios (polyrepo)
- **Prós:** fronteiras rígidas; ciclos de release independentes
- **Contras:** contrato entre front e API passa a exigir versionamento e publicação de pacote; mudança
  que cruza os dois vira dois PRs coordenados; para um time pequeno é sobrecarga pura; contraria a
  decisão de Modular Monolith registrada no plano de evolução
- **Custo:** alto e permanente

### Alternativa C — Monorepo com `apps/`, `packages/`, `infra/`, `tests/` e docs numerada
- **Prós:** simetria entre aplicações; raiz limpa; habilita workspaces, cache e CI por path; permite
  extrair pacote compartilhado (contratos, config, design system) sem novo repositório; documentação com
  endereço previsível
- **Contras:** migração gera conflito em toda branch aberta; exige janela combinada; custo de
  atualização de referências
- **Custo:** ~3,5 dias distribuídos em 4 fases

### Alternativa D — Fazer tudo de uma vez, em um único PR
- **Prós:** rápido; um único momento de dor
- **Contras:** irrevisável; impossível isolar a causa se algo quebrar; rollback vira tudo-ou-nada
- **Custo:** baixo em tempo, alto em risco

## Decisão

Adotamos a **Alternativa C**, executada de forma incremental em **5 fases** (0 a 4), uma por PR, com a
Fase 0 — puramente aditiva — executada imediatamente.

Adotamos também:

1. **`apps/` como raiz das aplicações**, com `apps/web` recebendo o frontend hoje na raiz.
2. **Documentação numerada em 40 áreas temáticas**, cada uma com README declarando objetivo,
   responsabilidade, conteúdo esperado, quem utiliza, quando utilizar e quem pode alterar.
3. **`99-Arquivo/` para histórico** — desvio declarado em relação à estrutura originalmente
   especificada, necessário porque os 23 documentos de `docs/archive/` precisavam de destino e mantê-los
   sem numeração quebraria a convenção sendo estabelecida. O prefixo `99` os coloca ao fim da ordenação
   e sinaliza que não são fonte de verdade.
4. **`tests/` na raiz** para testes que cruzam aplicações; testes unitários permanecem ao lado do
   código que testam.

E **recusamos explicitamente** quatro itens da estrutura solicitada:

| Recusado | Motivo |
|---|---|
| `logs/`, `uploads/`, `storage/`, `temp/` | São diretórios de runtime. Log vai para stdout (modelo de contêiner); mídia vai para S3/MinIO (incompatível com múltiplas réplicas se local); temporário usa o diretório do SO |
| Mover `prisma/` para `database/` | O Prisma CLI resolve `prisma/schema.prisma` a partir do `package.json`. Mover exige `--schema` em todos os comandos, no `package.json` e no Dockerfile, com ganho puramente estético — o schema tem um único consumidor |
| `frontend/` e `backend/` como pastas de topo | Seriam sinônimos de `apps/web` e `apps/api`. Duas convenções para a mesma coisa é pior que uma imperfeita |
| `ci/` na raiz | O GitHub Actions só reconhece `.github/workflows/`. Uma pasta paralela criaria um segundo lugar inerte |

## Consequências

### Positivas
- Estrutura torna a arquitetura visível: fronteiras entre aplicações ficam explícitas na árvore
- Habilita npm workspaces, cache de build por pacote e CI com filtro de path preciso
- Documentação passa a ter endereço previsível; documento novo tem destino óbvio
- Convenção declarada e verificável substitui convenção tácita
- Caminho aberto para extrair `packages/contracts` e fechar o *contract drift* entre front (JS) e API (TS)
- Onboarding deixa de depender de quem já conhece o repositório

### Negativas
- A Fase 1 gera conflito em **toda** branch aberta que toque o frontend — exige janela combinada
- Comandos memorizados mudam (`docker compose up` passa a exigir `-f infra/docker/compose.yml` após a Fase 3)
- 41 pastas de documentação, a maioria vazia no início, podem ser lidas como burocracia se não forem preenchidas
- `git blame` fica menos direto nos arquivos movidos (mitigado por `git mv` e `--follow`)

### Neutras / a observar
- A numeração de `docs/` dificulta inserir área nova entre duas existentes sem renumerar — aceitável,
  pois as áreas são temáticas amplas e estáveis
- `apps/api/prisma/` permanece fora de `database/`, o que pode surpreender quem espera a separação

## Critérios de reavaliação

- **`prisma/` em `database/`:** reavaliar se um segundo consumidor do schema aparecer (ex.: serviço de
  analytics lendo o mesmo banco)
- **Polyrepo:** reavaliar se um bounded context precisar de ciclo de release independente ou de um time
  dedicado com autonomia total de deploy
- **Numeração da documentação:** reavaliar se precisarmos de mais de 5 áreas novas em um ano
- **`99-Arquivo/`:** reavaliar em 12 meses; se nada dali for consultado, considerar remoção com o
  histórico preservado no Git

## Referências

- [`PLANO-DE-REESTRUTURACAO.md`](../00-Governanca/PLANO-DE-REESTRUTURACAO.md) — árvores, justificativas item a item, checklists e rollback
- [`CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md)
- [`PLANO-DE-EVOLUCAO-ENTERPRISE.md`](../03-Roadmap/PLANO-DE-EVOLUCAO-ENTERPRISE.md) — auditoria que originou a reestruturação
- Linha de base validada em 2026-07-28: 302 testes de frontend + 265 de backend, todos verdes
