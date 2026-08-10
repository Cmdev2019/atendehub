# 05-ADR — Architecture Decision Records

## Objetivo

Registrar decisões arquiteturais relevantes com contexto, alternativas e consequências — de forma imutável.

## Responsabilidade

Preservar o **porquê** de cada decisão. Uma ADR nunca é editada depois de aceita: é superada por outra que a referencia.

## Conteúdo esperado

- Uma ADR por decisão, numerada sequencialmente (`ADR-0001-titulo-em-kebab-case.md`)
- Template padrão em `ADR-0000-template.md`
- Índice com status de cada ADR (Proposta, Aceita, Superada, Rejeitada)

## Quem utiliza

Engenharia, arquitetos, qualquer pessoa que questione "por que foi feito assim?".

## Quando utilizar

Sempre que uma decisão for cara de reverter, afetar mais de um módulo ou contrariar uma convenção vigente.

## Quem pode alterar

Qualquer pessoa pode **propor** uma ADR. Só arquiteto ou tech lead **aceita**. Ninguém edita ADR já aceita — cria-se uma nova que a supera.

## Ciclo de vida de uma ADR

Estado além de "Proposta/Aceita" existe para separar **decidir** de **implementar** de **confirmar
que funciona** — os três podem acontecer em momentos bem diferentes, e confundi-los é o que faz uma
ADR "aceita" há meses continuar descrevendo um código que nunca chegou a existir.

| Estado | Critério de entrada | Quem move |
|---|---|---|
| **Proposta** | PR aberto com o arquivo preenchido a partir do template | Autor |
| **Em Revisão** | Ao menos 1 revisor começou a comentar no PR | Revisor |
| **Aprovada** | Revisor(es) aprovam o PR; decisão está tomada, **implementação pode não ter começado** | Arquiteto/Tech lead |
| **Implementada** | O código descrito na seção "Evidências" existe de fato no branch principal | Quem implementa, com link do commit/PR na seção "Histórico" |
| **Validada** | Os "Critérios de Validação" da ADR foram checados e passaram (teste automatizado rodou, ou verificação manual documentada) | Quem valida, registrado no "Histórico" |
| **Monitorada** | Existe um controle recorrente (Constituição Parte V) observando se a decisão continua valendo — é o estado mais maduro, e hoje **nenhuma ADR do projeto chegou até aqui**, porque nenhum controle automatizado de monitoramento contínuo está implementado (ver `MATRIZ-DE-RASTREABILIDADE-ARQUITETURAL.md` Parte IX) | Responsável do controle |
| **Rejeitada** | Decisão não aprovada — arquivo permanece no histórico do Git, mas sai do índice ativo | Arquiteto/Tech lead |
| **Superada por `ADR-NNNN`** | Uma ADR nova e aceita contradiz esta | Quem escreve a ADR nova, atualizando as duas |
| **Arquivada** | A decisão deixou de ser relevante sem ter sido tecnicamente contradita (ex.: o componente que ela regia foi removido) | Arquiteto/Tech lead |

**Regra prática desta transição:** uma ADR pode ficar "Aprovada" por tempo indefinido sem virar
"Implementada" — isso não é um erro, é a distinção entre decidir e executar. O que **não** é aceitável
é uma ADR "Implementada" cujo código evidenciado não existe mais (nesse caso, ela deveria ter virado
"Superada" ou "Arquivada" e não foi — achado de auditoria, não estado válido).

## Estado atual

Contém o template e o índice. ADRs 0001 a 0008 na notação de status curta original
(Proposta/Aceita/Rejeitada/Superada); ADRs 0009 em diante já usam o ciclo de vida estendido acima
(convivência das duas notações é esperada e não exige migração retroativa das 8 primeiras).

---

> Convenções desta pasta seguem [`00-Governanca/CONVENCAO-DE-NOMENCLATURA.md`](../00-Governanca/CONVENCAO-DE-NOMENCLATURA.md).
> Índice geral em [`docs/README.md`](../README.md).
