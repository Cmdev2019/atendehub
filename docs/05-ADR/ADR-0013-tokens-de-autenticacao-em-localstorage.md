# ADR-0013 — Tokens de autenticação em `localStorage` (formalização retroativa de B-19)

- **Status:** Implementada — premissa sob reavaliação condicionada a B-43
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia (formalização retroativa — decisão original de 2026-07-25, item B-19)
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `src/services/api.js` (frontend, fora do escopo de código auditado por
  esta cadeia de revisões, mas citado por ser o consumidor da decisão), `apps/api/src/main.ts`
  (CORS/Helmet), `auth.controller.ts` (emissão de token)

> Ciclo de vida conforme `README.md` desta pasta. Esta ADR é **retroativa**: a decisão foi
> tomada em 2026-07-25 (item **B-19** do roadmap), antes de existir este processo formal de
> ADR. `INDICE.md` já a listava desde 2026-08-01 como "decisão histórica ainda não convertida",
> com a ressalva já registrada: "a premissa desta decisão deve ser reavaliada após a implantação
> de CSP (item B-43)". Esta ADR preserva essa ressalva, não a resolve — CSP em nível de Nginx
> segue pendente (B-43).

## Contexto

O frontend precisa manter o usuário autenticado entre recarregamentos de página. A API emite
access token (JWT curto) + refresh token (`auth.service.ts`) via `POST /auth/login`, no corpo da
resposta JSON — não via `Set-Cookie` (confirmado: `AuthResponseDto` devolve os tokens como
campos do corpo, `auth.controller.ts:35-39`; nenhum `res.cookie(...)` encontrado em
`auth.controller.ts`/`auth.service.ts`). O frontend decide onde guardar esse token no cliente.

## Problema

Onde o frontend deve armazenar o token: `localStorage` (acessível a qualquer script JS na
página) ou cookie `httpOnly` (inacessível a JS, mas sujeito a CSRF se não mitigado)?

## Alternativas Consideradas

### Alternativa A — `localStorage`
- **Prós:** simples de implementar no cliente; não exige que a API decida `Set-Cookie`/
  `SameSite`/domínio de cookie; funciona igual em qualquer origem que a API permita via CORS.
- **Contras:** qualquer script executado na página (XSS) tem acesso de leitura ao token — se um
  script malicioso rodar na origem do frontend, ele pode exfiltrar o token.
- **Complexidade:** baixa.
- **Risco:** depende inteiramente de não haver XSS na aplicação — mitigação é a defesa contra
  XSS em si (CSP, sanitização), não o armazenamento.
- **Impacto:** frontend (`src/services/api.js`), CORS da API.
- **Custo estimado:** baixo (já implementado).

### Alternativa B — Cookie `httpOnly` + `SameSite`
- **Prós:** inacessível a JavaScript — um XSS não consegue ler o token diretamente.
- **Contras:** introduz CSRF como superfície nova (mitigável com `SameSite=Strict`/token CSRF
  dedicado, mas é trabalho adicional que hoje não existe); exige que a API decida
  `Set-Cookie` com `Domain`/`Path` corretos, mais sensível a erro de configuração entre
  `app.atendehub.com` e `api.atendehub.com` (domínios distintos, `nginx.conf:31,39,64`) —
  cookie cross-subdomain exige `Domain=.atendehub.com` explícito, que não é o padrão seguro por
  omissão.
- **Complexidade:** média.
- **Risco:** troca risco de XSS-lê-token por risco de CSRF-se-mal-configurado — não é
  estritamente mais seguro, é uma superfície diferente.
- **Impacto:** frontend + backend (emissão de cookie) + Nginx (domínio de cookie
  cross-subdomain).
- **Custo estimado:** médio (não implementado).

## Decisão Tomada

**Alternativa A**, mantida — `localStorage`, risco aceito conscientemente em 2026-07-25 (B-19).

## Justificativa Técnica

Para uma API com domínio separado do frontend (`api.atendehub.com` vs. `app.atendehub.com`,
`nginx.conf`), cookie `httpOnly` cross-subdomain exige configuração de `Domain` mais frágil e
fácil de errar do que o modelo Bearer-token-em-header atual. A decisão original aceitou o risco
de XSS-lê-token **sob a premissa de que a mitigação de XSS em si (CSP, sanitização de output)
compensaria** — premissa que, na auditoria de B-43, foi encontrada **não cumprida**: não há CSP
alguma servida pelo Nginx para o HTML estático que o navegador de fato carrega (a CSP que existe
é a do Helmet, na API, que protege respostas JSON, não a página) — achado da AGR §6, que já
citava exatamente esta ADR como precisando de reavaliação.

## Trade-offs

- **O que foi ganho:** simplicidade de implementação; nenhuma configuração de cookie
  cross-subdomain a manter.
- **O que foi perdido:** um XSS bem-sucedido na origem do frontend expõe o token diretamente.
- **Dívida técnica:** a premissa que justificava aceitar esse risco (CSP mitigando XSS) não está
  cumprida hoje — **B-43** é o item que resolve isso. Esta ADR permanece "Implementada" (a
  decisão de usar `localStorage` está em produção), mas com a ressalva explícita de que sua
  justificativa original está parcialmente invalidada até B-43 fechar.

## Consequências

### Positivas
- Implementação simples, já em produção, sem incidente de token roubado conhecido
  (**NÃO FOI POSSÍVEL VALIDAR** histórico de incidente — fora do escopo desta revisão de
  código).
- Blacklist de token (`TokenBlacklistService`) e `POST /auth/revoke` permitem revogação rápida
  se um token vazar e isso for detectado — mitigação complementar, não impede o vazamento, mas
  limita sua janela de uso.

### Negativas
- Exposição a XSS sem a mitigação de CSP que a decisão original presumia.
- `EventsGateway` (WebSocket) aceita o mesmo token via `socket.handshake.auth.token` — se o
  token vazar, tanto HTTP quanto WebSocket ficam expostos (achado relacionado, AGR §9.1, sobre
  o WebSocket também não verificar blacklist).

### Neutras / a observar
- Não é uma decisão errada em si — é uma decisão cuja premissa de mitigação (CSP) ficou para
  trás. Corrigir B-43 resolve a lacuna sem precisar reabrir esta ADR.

## Componentes Afetados

- [x] Controllers (`AuthController`, emissão) · [ ] Services · [ ] Repositories · [ ] Prisma
- [ ] Redis · [ ] Bull · [ ] Storage · [ ] Docker · [x] Nginx (CSP ausente, dependência
  cruzada) · [x] WebSocket (mesmo token usado no handshake) · [ ] Banco
- [x] Outros: `src/services/api.js` (frontend, fora do escopo de código desta cadeia)

## Relação com Governança

- **ACR:** não tratou este tema
- **ABR:** §9 (Segurança — CSRF citado como "não aplicável ao modelo Bearer atual, decisão B-19")
- **AGR:** §6 (Security Layer Matrix — achado sobre CSP do Helmet vs. Nginx, cita esta decisão
  explicitamente)
- **AER (Constituição):** Política JWT (Parte II), ASNF-077
- **ASNF (Manual):** ASNF-070..084 (Parte VII, Segurança)
- **ATM:** Parte VI (Matriz de Segurança), Parte X (Matriz de Decisões)
- **Roadmap:** **B-19** (decisão original), **B-43** (premissa condicionante, pendente)

## Evidências

- **Arquivos/Classes/Métodos:** `auth.controller.ts:35-39` (resposta JSON, não cookie),
  `auth.service.ts` (emissão de token)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** `auth.service.spec.ts`, `auth.controller` sem spec dedicado (ABR §10.1)
- **Pipelines:** `api-ci.yml`

## Critérios de Validação

Confirmar que nenhuma resposta da API usa `Set-Cookie` para o token (mantém a decisão
consistente); confirmar, após B-43, que a CSP servida ao HTML do frontend está presente
(`curl -I` contra `app.atendehub.com` mostrando `Content-Security-Policy`).

## Critérios de Revisão

**Obrigatório revisar quando B-43 (headers de segurança do Nginx) for implementado** — nesse
momento, decidir explicitamente se a premissa original volta a valer (CSP mitigando XSS o
suficiente) ou se a Alternativa B (cookie `httpOnly`) deve ser reconsiderada. Revisar também se
qualquer incidente de XSS for identificado antes disso.

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação — formaliza retroativamente a decisão de 2026-07-25 (B-19), preservando a ressalva já registrada sobre B-43 | 1.0 |

## Referências

- `ROADMAP_ESTABILIZACAO.md` (item B-19, Registro de decisões)
- `docs/04-Arquitetura/AGR_2026-08-05_governance.md` §6
- `docs/05-ADR/INDICE.md` (listagem original desta pendência)
