## O que muda

<!-- Descreva a mudança em 2-3 frases. O diff mostra o quê; explique o porquê. -->

## Tipo

- [ ] `feat` — funcionalidade nova
- [ ] `fix` — correção de defeito
- [ ] `refactor` — mudança interna sem alteração de comportamento
- [ ] `docs` — somente documentação
- [ ] `chore` — manutenção, estrutura, dependência
- [ ] `test` — somente teste
- [ ] `perf` — desempenho
- [ ] `ci` / `build` — pipeline ou empacotamento

## Item do roadmap

<!-- ID do item em ROADMAP_ESTABILIZACAO.md, ex.: B-39. Se não há item, explique por quê. -->

## Como validar

<!-- Passos concretos para o revisor reproduzir. -->

## Checklist

- [ ] Testes escritos e passando localmente
- [ ] `npm run lint:check` e `npx tsc --noEmit` limpos (API)
- [ ] Documentação atualizada **neste mesmo PR** (contrato de API, schema, evento de socket, runbook)
- [ ] Sem `console.log` novo fora de teste
- [ ] Sem `any` novo sem justificativa em comentário
- [ ] Impacto em **isolamento multi-tenant** avaliado (toda query filtra por `companyId`?)
- [ ] Impacto em **permissão** avaliado (papel e escopo corretos?)
- [ ] Impacto em **performance** avaliado (query nova tem índice?)
- [ ] Migration segue expand/contract, sem operação destrutiva junto de mudança de código
- [ ] `ROADMAP_ESTABILIZACAO.md` atualizado com evidência, se o PR fecha um item

## Riscos

<!-- O que pode quebrar? Como reverter? -->

## Capturas de tela

<!-- Obrigatório para mudança visual. Antes e depois. -->
