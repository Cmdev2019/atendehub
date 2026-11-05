# Plano de Teste — B-118: efeitos e refs do frontend

- **Natureza:** Regressão e testes de componentes/hooks.
- **Responsável pela execução:** Codex, na retomada do projeto.
- **Versão alvo:** alterações locais sobre 9e8ceb4427f86cfeef14614bb61a085f59b4e25e.
- **Data:** 2026-11-05.
- **Estado:** PR #142 aberto; CI do código aprovada, auditoria da API e revisão pendentes.

## Objetivo

Remover os 15 avisos de estado síncrono em efeitos e os acessos a refs durante o render
apontados pelo B-118, preservando a interação dos diálogos, filtros, filas e conversas.

## Escopo

Inclui os nove arquivos de produção citados no item, a configuração ESLint e quatro arquivos
de testes com sete casos novos. Não altera endpoints, schema, integrações nem infraestrutura.
Os problemas de segurança do relatório externo de 30/10 e a revisão do B-107 seguem separados.

## Pré-condições

Dependências já instaladas; API e WebSocket simulados pelos testes existentes. O teste de
aviso da fila usa relógio simulado. Nenhum serviço externo ou banco real é necessário.

## Casos de teste

| # | Cenário | Passos e resultado esperado | Prioridade |
|---|---|---|---|
| 1 | Atualizar tags durante a edição | Alterar nome/e-mail e atualizar as tags do mesmo contato; preservar o rascunho. | Alta |
| 2 | Trocar e reabrir contato | Trocar o ID, fechar e abrir; inicializar com o contato correto e focar o nome. | Alta |
| 3 | Filtro com resposta atrasada | Trocar de relatório antes da resposta; mostrar carregamento e ignorar o resultado anterior. | Alta |
| 4 | Offline e volta ao Online | Cancelar aviso, listener e timer; uma nova chegada mantém seu prazo completo. | Alta |
| 5 | Trocar de conversa após erro | Limpar o erro e não o restaurar ao voltar à conversa anterior. | Alta |
| 6 | Falha de envio atrasada | Selecionar outra conversa antes da rejeição; não exibir o erro nela. | Alta |
| 7 | Atualização e encerramento no mesmo lote | Preservar os últimos dados e mover a conversa uma única vez para Encerrados. | Alta |

A suíte existente também verifica reabertura do encerramento, foco, Escape, validação dos
formulários, contatos, exportação, polling, debounce, disponibilidade e configurações.

## Critérios de aceitação

- [x] Sete casos novos aprovados; três reproduzem falhas nos fontes originais.
- [x] Todos os 440 testes do frontend aprovados, em 44 suítes.
- [x] ESLint com a configuração real: zero erros e zero avisos.
- [x] Regra set-state-in-effect como erro em todo o frontend.
- [x] Regra refs como erro em useConversations; nos componentes permanece desligada
  pelo falso positivo conhecido com createElement/h.
- [x] Build de produção gerado com a configuração real do Vite/Rolldown.
- [x] Comandos normais de lint, testes e build na CI; checks api, web e api-e2e aprovados.
- [ ] Auditoria de dependências da API aprovada e revisão do B-118 concluída.

## Critérios de parada

Interromper a conclusão se uma regressão falhar, se reaparecerem avisos do item ou se o build
falhar. O resultado local não autoriza encerrar a revisão do B-107 nem atribuir aprovação de CI.

## Método, riscos e limites

O terminal falhou ao criar o PowerShell (acesso negado), e a chamada direta ao Git falhou com
EPERM. A branch local continua fix/b-107-redis-sem-resposta; na validação inicial não foram feitos commit, push ou
merge. Antes das mudanças, os 561 arquivos do índice foram comparados pelos hashes de blob,
com normalização CRLF/LF, sem divergências.

ESLint foi executado pela API Linter, usando o eslint.config.js real. O build usou a API do
Vite, com o vite.config.js real e somente o diretório de saída alterado para a área externa
de evidências. Portanto, não houve dependência de servidor de desenvolvimento.

Jest foi executado por runCLI, em lotes, sobre cópia idêntica de src e jest.setup.js e usando
as dependências já instaladas. O runtime de ferramentas interpreta o projeto como ESM e
não disponibilizou o global jest no setup da execução direta. A cópia de validação usa
package.json CommonJS e Babel com modules=commonjs; as demais opções vêm da configuração do
projeto. NODE_ENV=test foi explicitado após o build. Nenhum mock ou asserção foi substituído.
O teste do cliente de demonstração manteve os 800 ms de latência simulada por chamada.

Foram executadas as sete regressões também com os quatro fontes originais: quatro passaram
e três falharam (rascunho após tags, erro de envio em outra conversa e encerramento no mesmo
lote). Com os fontes alterados, todas passam. Os testes locais não equivalem a validação visual em
navegador ou backend/e2e. A execução posterior na CI está registrada abaixo.

## Evidências e reprodução

Os JSONs por lote, lint, build, hashes e comparação dos fontes originais ficam fora do
repositório, em EVIDENCIAS_B-118_IMPLEMENTACAO_2026-11-05, na pasta de trabalho do projeto.
Fontes e testes da cópia isolada foram conferidos por hash contra a árvore final.

Quando a execução de processos estiver disponível, a validação normal na raiz do repositório é:

~~~powershell
npm run lint
npm test -- --runInBand
npm run build
~~~

O resultado de CI deve ser acrescentado ao histórico antes de marcar o item como concluído.

## Publicação no GitHub

Após a autorização do responsável para usar a conta Cmdev2019, o acesso de escrita ao
repositório foi confirmado. O B-118 foi publicado na branch refactor/b-118-efeitos-e-refs,
baseada no master afc05cd9b9e097a0dcb171ccde5ef5bdf688e04c. Os 14 arquivos existentes de
código, testes e lint têm a mesma base na branch do B-107 e no master; a documentação
foi portada preservando o histórico do master. Nenhum código do B-107 entra neste PR.
A primeira tentativa de gravação pela API de Git retornou 403. Após a reconexão informada pelo responsável, a gravação de objeto Git foi confirmada. A publicação usa o conector GitHub porque o terminal local segue indisponível.
Os checks api, web e api-e2e e a revisão do PR completam a validação desta publicação.

## Resultado da CI — PR #142

Execução do commit 980b1ddd77c4673ca9356bbe1432735aea090001, publicado sobre master:

| Check | Resultado | Evidência |
|---|---|---|
| web | Aprovado: 44 suítes, 440 testes; lint e build aprovados | [Web CI](https://github.com/Cmdev2019/atendehub/actions/runs/42065655197) |
| api | Aprovado: 70 suítes, 707 testes; lint, tipos e cobertura aprovados | [API CI](https://github.com/Cmdev2019/atendehub/actions/runs/42065654977) |
| api-e2e | Aprovado: 18 suítes, 98 testes | [API CI](https://github.com/Cmdev2019/atendehub/actions/runs/42065654977) |
| web-audit | Aprovado | [Dependency Audit](https://github.com/Cmdev2019/atendehub/actions/runs/42065654930) |
| api-audit | Falhou; dependências da API exigem tratamento separado | [Dependency Audit](https://github.com/Cmdev2019/atendehub/actions/runs/42065654930) |

O B-118 não altera package.json, lockfiles nem arquivos apps/api. Os detalhes da auditoria
permanecem nas evidências externas, seguindo SECURITY.md. O PR continua em validação e
não foi mesclado. Este registro de CI altera somente documentação; o código permanece idêntico.
