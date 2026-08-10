# ADR-NNNN — <Título curto no imperativo>

- **Status:** Proposta | Em Revisão | Aprovada | Implementada | Validada | Monitorada | Rejeitada | Superada por `ADR-NNNN` | Arquivada
- **Data de criação:** AAAA-MM-DD
- **Última revisão:** AAAA-MM-DD
- **Autor:** <nome ou papel>
- **Revisores:** <nomes ou papéis, ou "—" se ainda não revisada>
- **Versão:** 1.0
- **Decisores:** <nomes ou papéis>
- **Contexto técnico:** <módulos, serviços ou áreas afetadas>

> **Ciclo de vida** (ver `README.md` desta pasta para os critérios completos de transição):
> Proposta → Em Revisão → Aprovada → Implementada → Validada → Monitorada, com saídas laterais
> para Rejeitada (antes de Aprovada), Superada (depois de Aprovada, por uma ADR nova) ou
> Arquivada (decisão deixou de ser relevante, sem ser tecnicamente substituída).

## Contexto

Qual é o problema? Que forças estão em jogo — técnicas, de prazo, de time, de custo?

Descreva a situação de forma neutra, **sem** já apontar para a solução escolhida. Alguém que discorde
da decisão deve reconhecer sua própria posição descrita aqui de forma justa.

## Problema

Em uma frase objetiva: qual pergunta esta ADR responde? ("Devemos X ou Y?", não "Vamos fazer X".)

## Alternativas consideradas

### Alternativa A — <nome>
- **Prós:**
- **Contras:**
- **Complexidade:** baixa | média | alta
- **Risco:**
- **Impacto:**
- **Custo estimado:**

### Alternativa B — <nome>
- **Prós:**
- **Contras:**
- **Complexidade:**
- **Risco:**
- **Impacto:**
- **Custo estimado:**

### Alternativa C — Não fazer nada
Sempre considere. Qual o custo de manter como está?

## Decisão Tomada

Escolhemos a **Alternativa X**. Descrição objetiva do que muda na prática.

## Justificativa Técnica

Por que esta e não as outras. Se houve empate técnico desfeito por critério não-técnico (prazo,
familiaridade do time, custo de licença), **diga isso explicitamente** — é a informação mais valiosa
para quem reavaliar a decisão no futuro.

## Trade-offs

- **O que foi ganho:**
- **O que foi perdido:**
- **O que permanece como dívida técnica** (e onde essa dívida já tem item de roadmap, se tiver):

## Consequências

### Positivas
-

### Negativas
- (toda decisão tem custo; se você não encontrou nenhum, não pensou o suficiente)

### Neutras / a observar
-

## Componentes Afetados

Marque o que se aplica; remova o resto.

- [ ] Controllers · [ ] Services · [ ] Repositories · [ ] Prisma · [ ] Redis · [ ] Bull
- [ ] Storage · [ ] Docker · [ ] Nginx · [ ] WebSocket · [ ] Banco · [ ] Outros: <quais>

## Relação com Governança

- **ACR:** <referência ou "não aplicável">
- **ABR:** <seção/achado, ou "NÃO ENCONTRADO">
- **AGR:** <seção/achado, ou "NÃO ENCONTRADO">
- **AER (Constituição):** <regra `AER-XXX`, ou "NÃO ENCONTRADO">
- **ASNF (Manual):** <norma `ASNF-XXX`, ou "NÃO ENCONTRADO">
- **ATM:** <linha/parte da matriz de rastreabilidade>
- **Roadmap:** <item `B-XX`, ou "sem item — justificar por quê">

## Evidências

- **Arquivos/Classes/Métodos:** `caminho/arquivo.ts:linha`
- **Commits:** <hash ou "NÃO FOI POSSÍVEL VALIDAR — não pesquisado no histórico">
- **Testes:** `*.spec.ts` relevante
- **Pipelines:** workflow do CI que executa a validação, ou "NÃO ENCONTRADO — não integrado a CI"

## Critérios de Validação

Como confirmar, de forma objetiva e reproduzível, que a decisão foi implementada corretamente?

## Critérios de Revisão

Sob que condições esta decisão deve ser revisitada? Seja específico: "quando tivermos mais de 3 canais"
é melhor que "quando crescer". Quais eventos disparam revisão obrigatória?

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| AAAA-MM-DD | Criação | 1.0 |

## Referências

- Links, medições, provas de conceito, discussões
