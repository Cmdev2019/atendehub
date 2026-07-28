# Relatório técnico — Fechamento do backend do AtendeHub

**Data:** 2026-07-24
**Escopo:** Fases B5, B6, B3 e B7 do `ROADMAP_BACKEND.md` (documento vivo —
este relatório é um recorte narrativo para fins de estudo/avaliação, não é
fonte de verdade do projeto).

> Este documento existe para apoiar argumentação técnica (ex.: avaliação de
> carreira). Ele não substitui o `ROADMAP_BACKEND.md`, que continua sendo o
> registro oficial, item a item, com evidência de comando executado.

---

## Contexto do projeto

O AtendeHub é um SaaS multi-tenant de atendimento via WhatsApp (multiatendente),
com backend em NestJS/Prisma/PostgreSQL/Redis e frontend em Vite/React. Em
2026-07-21 foi tomada a decisão de **fechar todo o backend antes de retomar o
frontend**, para que a base estivesse 100% estável quando o trabalho de UI
voltasse — nada de contrato de API mudando de shape no meio de um ciclo de
frontend por causa de algo descoberto tarde no backend.

Nesta sessão foram fechadas as últimas 4 fases do backend: **B5 (segurança
pré-produção)**, **B6 (backend pronto para produção)**, **B3 (perfil de
usuário)** e **B7 (handoff)** — 12 itens de roadmap, 1 item de backlog
resolvido, 8 commits, 164 testes passando (eram 141 no início da sessão).

---

## 1. Segurança pré-produção (Fase B5)

### 1.1 Decisão de arquitetura documentada, não implementação por padrão

O item mais interessante desta fase não foi código — foi uma **decisão
consciente de não fazer** uma migração. Tokens de acesso/refresh ficam hoje
em `localStorage` no frontend, o que é tecnicamente vulnerável a XSS. A
solução "correta" no papel seria migrar para cookies `httpOnly` + proteção
CSRF. Mas isso:

- Exigiria reescrever o cliente HTTP e WebSocket do frontend — que estava
  pausado por decisão do próprio projeto.
- Mudaria o contrato de autenticação no meio de uma janela em que ninguém
  estava disponível para validar a integração imediatamente.
- Trocaria um risco conhecido e mitigado (XSS, mitigado por CSP e ausência
  de renderização de HTML não sanitizado) por um risco novo introduzido sob
  pressão de cronograma.

A decisão foi registrada formalmente no roadmap, com a data, o motivo e a
condição de revisão ("revisitar se o front expuser HTML de terceiros sem
sanitização"). **Isso é engenharia de verdade**: nem toda vulnerabilidade
teórica justifica uma reescrita imediata — o trabalho sênior é avaliar o
custo-benefício e deixar a decisão auditável, não só "corrigir tudo que
aparece".

A parte prática do mesmo item foi resolvida separadamente: um
`RefreshTokenCleanupService` novo, rodando via cron (`@nestjs/schedule`),
que remove periodicamente tokens já expirados ou revogados — higiene de
banco sem nenhuma mudança de comportamento para sessões ativas.

### 1.2 Fail-fast como princípio de design de segurança

Um padrão que se repetiu em praticamente todo o resto da fase: **em vez de
deixar uma configuração ausente causar um bug sutil em produção, o boot da
aplicação falha imediatamente e nomeia a variável exata que falta.**

Isso foi aplicado em quatro pontos:
- Segredos do `docker-compose.prod.yml` (Postgres, Redis, MinIO, Evolution)
  — antes, `redis`/`minio` caíam silenciosamente num valor de desenvolvimento
  se a variável de produção não estivesse setada. Corrigido para
  `${VAR:?obrigatório em produção}`, que faz o `docker compose build` falhar
  citando exatamente a variável ausente.
- `CORS_ORIGINS` em produção — sem essa validação, um deploy sem essa
  variável "sobe com sucesso" mas rejeita todo o tráfego do frontend real,
  e o sintoma só aparece depois, como erro de CORS no navegador do cliente,
  longe de qualquer log de boot.
- Nível de log `debug` — estava ligado incondicionalmente em qualquer
  ambiente, inclusive produção. Era o nível onde vivia o grosso de dado
  sensível (telefone de contato em quase todo log de processamento de
  webhook). Corrigido para nunca ligar em produção.
- Log de login vazando e-mail (PII) em texto puro — trocado para logar
  apenas o id do usuário, que já é suficiente pra correlacionar com o banco
  numa investigação.

O raciocínio comum por trás de tudo isso: **o custo de uma validação
"chata" no boot é segundos de atrito para quem sobe o serviço; o custo de
não ter essa validação é um incidente de produção descoberto por um
cliente, não por um log.**

### 1.3 Readiness vs. liveness

Adicionado `GET /health/ready`, distinto do `GET /health` já existente.
Essa distinção é um conceito de infraestrutura que qualquer orquestrador
moderno (Kubernetes, nginx, load balancers) espera:

- **Liveness** — "o processo está de pé?" (não checa dependência nenhuma).
- **Readiness** — "o processo está pronto pra receber tráfego de verdade?"
  (checa se as dependências — aqui, PostgreSQL e Redis — respondem).

Sem essa distinção, um orquestrador não tem como saber se deve tirar uma
instância de circulação quando o banco cai mas o processo Node continua de
pé.

---

## 2. Backend pronto para produção (Fase B6)

### 2.1 Um débito técnico "invisível" descoberto e resolvido: lint quebrado desde sempre

Ao tentar montar o pipeline de CI, a primeira tentativa de rodar
`npm run lint` falhou de cara: o projeto **nunca teve** um `eslint.config.js`
— não é uma regressão, é um item que ficou aberto desde o início do backend
(registrado como item de backlog `BL-1` em sessão anterior). Isso significa
que, apesar do projeto ter ESLint como dependência configurada há tempos,
**nunca houve lint rodando de verdade neste backend**.

Resolvido criando a configuração do zero (formato flat config, exigido pelo
ESLint 9) e rodando pela primeira vez: apareceram 11 problemas reais — a
maioria variáveis não usadas (fácil), mas também um `no-undef` genuíno
(`Express` não reconhecido — corrigido desligando essa regra especificamente
para TypeScript, já que o `tsc` já garante isso de forma muito mais
confiável que um linter que não entende tipos). Isso é o tipo de achado que
só aparece quando alguém finalmente liga a ferramenta que estava configurada
mas nunca executada.

### 2.2 Descobrindo que a infraestrutura de deploy documentada não refletia a arquitetura real

Ao revisar o `docker-compose.prod.yml` para o item de segurança de
segredos, apareceu um problema mais estrutural: o arquivo referenciava um
container `web` rodando **Next.js**, com Dockerfile em `apps/web` — pasta
que **não existe mais no repositório**. Isso era resíduo de um plano de
arquitetura anterior a uma decisão já tomada (o frontend é Vite + React
estático, na raiz do projeto, não Next.js).

Ou seja: **o arquivo de deploy de produção, se alguém tentasse usá-lo
naquele estado, falharia no primeiro `docker compose build`** — um problema
que só foi descoberto porque alguém finalmente tentou rodar o build de
verdade, não só ler o arquivo.

A correção não foi só "trocar o caminho": foi uma decisão de arquitetura —
eliminar o container `web` por completo. Um frontend Vite/React em produção
é só um conjunto de arquivos estáticos (HTML/JS/CSS já compilados); rodar
um processo Node inteiro só pra servir esses arquivos é overhead sem
benefício. A solução ficou: o próprio `nginx` (que já existia como proxy
reverso) builda o front (`vite build`) num estágio de imagem Docker e serve
os arquivos direto, com `try_files` no padrão de SPA. Uma camada inteira de
infraestrutura eliminada.

**Validação real, não só leitura de arquivo**: os dois Dockerfiles novos
(API e front/nginx) foram de fato construídos com Docker rodando nesta
sessão. Isso pegou um segundo bug: o `Prisma Client` precisa da biblioteca
OpenSSL disponível na imagem de runtime — sem isso, o cliente gerado
apontaria pro binário de engine errado silenciosamente. Corrigido instalando
`openssl` explicitamente antes de rodar `prisma generate` no estágio final
da imagem, e confirmado que o client carrega sem erro dentro do container
de verdade (não só que o build "termina sem erro" — as duas coisas são
diferentes).

### 2.3 Observabilidade: da teoria pra evidência real

A empresa já tinha `nest-winston` como dependência instalada — mas **nunca
conectada**; o boot ainda usava o logger padrão do NestJS (console simples,
sem estrutura). Isso foi ligado de verdade:

- Em produção, logs saem em **JSON estruturado** — formato que qualquer
  agregador de log (ELK, CloudWatch, Loki) consome sem parsing customizado.
- Cada requisição HTTP ganha um **request-id** (via `AsyncLocalStorage`,
  sem precisar passar o id manualmente em cada chamada de log) — permite
  correlacionar todas as linhas de log de uma única requisição, mesmo que
  ela dispare processamento assíncrono depois.
- Filas do Bull (webhook e SLA) ganharam handlers de evento pra job
  **falhou definitivamente** e **travou** (`stalled`) — diferente do log
  por tentativa que já existia, que não cobria esses dois casos.

A validação aqui foi a mais concreta de toda a sessão: a API foi subida
contra Postgres/Redis reais, e **enquanto ela rodava, chegou tráfego real
de WhatsApp de um número de teste do próprio usuário** — cada webhook
processado saiu no log já com o `requestId` correlacionado
automaticamente, sem eu precisar simular nada.

### 2.4 Runbook: documentação que corrigiu a si mesma antes de ser publicada

Ao escrever o runbook de produção (deploy, rollback, reset de fila,
troubleshooting), o primeiro rascunho do script de exemplo pra resetar uma
fila travada estava **errado**: usava a opção `prefix` do Bull, mas o
projeto na verdade configura o Redis com `keyPrefix` no cliente ioredis —
duas opções com nomes parecidos mas efeitos diferentes, que geram chaves
Redis diferentes.

Isso só foi descoberto porque, em vez de confiar na leitura do código, o
comando foi **testado de verdade contra o Redis real** antes de ir pro
documento. Um runbook com um comando que parece certo mas não funciona é
pior do que não ter runbook — alguém vai confiar nele durante um incidente
real.

---

## 3. Perfil de usuário completo (Fase B3)

Dois endpoints novos (`PATCH /users/me`, `POST /users/me/avatar`), com um
detalhe de design que vale registrar: a rota `/users/me` precisa ser
declarada **antes** da rota `/users/:id` no controller — frameworks web
baseados em Express casam rotas na ordem em que são declaradas, então sem
esse cuidado, uma chamada pra `/users/me` seria interpretada como
`/users/:id` com `id = "me"`.

A segurança do endpoint de auto-edição não depende de uma checagem de
`if (role === 'ADMIN')` em tempo de execução — depende do **shape do DTO**:
os campos `role` e `isActive` simplesmente não existem no objeto aceito, e
o `ValidationPipe` global do projeto (`forbidNonWhitelisted`) já rejeita
qualquer campo extra com 400 automaticamente. Isso é mais robusto do que
uma checagem manual, porque não depende de ninguém lembrar de adicionar a
checagem quando o endpoint for alterado no futuro.

Todo o fluxo foi validado de ponta a ponta contra a API, o banco e o MinIO
reais — não só testes unitários: login real, edição de nome (200), tentativa
de escalar para `SUPER_ADMIN` pelo mesmo endpoint (400), upload de uma
imagem real (201, com URL do MinIO publicamente acessível confirmada via
`curl`), e upload de um arquivo não-imagem como avatar (400).

---

## 4. Handoff (Fase B7)

O fechamento formal envolveu uma decisão operacional que vale mencionar: o
checklist de handoff pedia rodar `prisma migrate reset --force` — comando
que **apaga o banco de dados por completo** — pra provar que o setup
funciona do zero. Havia, nesse momento, tráfego real de teste (WhatsApp)
no banco de desenvolvimento. Em vez de simplesmente rodar o comando
destrutivo, a decisão foi **parar e confirmar explicitamente com o
responsável pelo projeto** antes de prosseguir — mesmo o comando sendo
tecnicamente "seguro" no sentido de que reconstrói o banco do zero
corretamente, ele destrói dado que talvez alguém quisesse preservar.

No caminho, um problema técnico secundário: o `prisma generate` automático
que roda depois do reset falhou com um erro de permissão de arquivo — uma
outra instância do servidor, já rodando havia tempo numa janela separada,
tinha o binário do motor do Prisma travado em uso. De novo, a decisão foi
**confirmar antes de encerrar um processo que não foi iniciado por mim**
nesta sessão, mesmo sendo tecnicamente inofensivo reiniciá-lo.

---

## O que este fechamento demonstra, de forma resumida

| Categoria | Evidência concreta |
|---|---|
| **Julgamento técnico, não só execução** | Decisão documentada de *não* migrar para cookie httpOnly, com critério explícito de quando revisitar |
| **Segurança como fail-fast, não checklist** | 4 pontos de validação de boot que transformam erro de configuração silencioso em falha imediata e nomeada |
| **Rigor de validação** | Toda mudança de infraestrutura (Docker, nginx, filas, banco) foi testada contra o sistema real rodando, não só lida — isso pegou 4 bugs reais que uma revisão só de código não pegaria |
| **Disciplina de documentação viva** | Cada item fechado tem critério de aceite, evidência de comando executado e, quando aplicável, o motivo da decisão registrado |
| **Comunicação de risco antes de ação destrutiva** | Duas pausas explícitas pra confirmar ações irreversíveis (reset de banco, encerrar processo) mesmo sob pressão de terminar o checklist |
| **Cobertura de teste como rede de segurança real** | 164 testes automatizados (eram 141 no início da sessão) cobrindo autenticação, isolamento multi-tenant, filas, SLA e os novos endpoints — não só "existe teste", mas teste que de fato pegaria regressão |

---

*Gerado a partir do trabalho registrado em `ROADMAP_BACKEND.md`
(2026-07-24) e `ROADMAP_ESTABILIZACAO.md`. Para o detalhe item a item, com
evidência de comando, consulte aqueles documentos — este relatório é a
versão narrativa, não a fonte de verdade.*
