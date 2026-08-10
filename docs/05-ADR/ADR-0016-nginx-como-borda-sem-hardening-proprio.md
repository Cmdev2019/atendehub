# ADR-0016 — Nginx como borda única (TLS + proxy reverso + estático); hardening próprio pendente (B-43)

- **Status:** Implementada (topologia) · Proposta (hardening — headers, rate limit, redirect,
  timeout de WebSocket)
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `infra/nginx/nginx.conf`, `infra/nginx/Dockerfile`

> Ciclo de vida conforme `README.md` desta pasta.

## Contexto

Em produção, um único Nginx atende dois hosts: `app.atendehub.com` (serve o build estático do
frontend, sem servidor Node — F5-3) e `api.atendehub.com` (proxy reverso para a API NestJS na
porta 3001, incluindo `/socket.io/` para WebSocket). Confirmado por leitura integral de
`infra/nginx/nginx.conf`: TLS mínimo correto (`ssl_protocols TLSv1.2 TLSv1.3`), mas **nenhum**
header de segurança (`HSTS`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`),
**nenhum** `limit_req_zone`, o host `api.` sem bloco `listen 80` com redirect (só `app.` tem),
e o `location /socket.io/` sem `proxy_read_timeout` elevado (cai no default de 60s).

## Problema

Duas perguntas: (1) a topologia (1 Nginx, 2 hosts, TLS termination + proxy reverso + estático)
está correta? (2) o hardening de borda (headers, rate limit, redirect universal, timeout de
WebSocket) deveria existir e ainda não existe — quando resolver?

## Alternativas Consideradas — Pergunta 1 (topologia)

### Alternativa A — Nginx único servindo os 2 hosts (frontend estático + proxy da API) — **já implementado**
- **Prós:** um só ponto de TLS termination e configuração de certificado; frontend não precisa
  de servidor Node em produção (build estático puro), reduzindo superfície de processo a
  manter; decisão já alinhada com F5-3 (frontend permanece Vite+React, sem Next.js/SSR).
- **Contras:** um único Nginx é ponto de falha compartilhado entre frontend e API — se ele cair,
  os dois ficam indisponíveis juntos.
- **Complexidade:** baixa.
- **Risco:** baixo — é a topologia mais simples que atende ao requisito de 2 domínios com TLS.
- **Impacto:** todo o tráfego externo.
- **Custo estimado:** baixo (já implementado).

### Alternativa B — Nginx separado por host (2 processos/containers)
- **Prós:** falha de um não derruba o outro.
- **Contras:** duplica configuração de certificado/TLS; sem ganho real para o volume atual do
  projeto (1 réplica de API, sem indício de que Nginx seja o gargalo ou ponto de falha
  observado).
- **Complexidade:** média, sem benefício comprovado no estágio atual.
- **Custo estimado:** médio, desproporcional ao problema real hoje.

## Decisão Tomada — Pergunta 1

**Alternativa A**, mantida.

## Alternativas Consideradas — Pergunta 2 (hardening)

### Alternativa A — Headers de segurança + `limit_req` + redirect universal + timeout de WebSocket
- **Prós:** fecha a lacuna já detalhada em **AER-013/AER-014** — é a única camada que toca 100%
  do tráfego antes de qualquer guard da aplicação rodar (achado central da AGR §6/§9).
- **Contras:** nenhum technical trade-off relevante identificado — é hardening puro.
- **Complexidade:** baixa.
- **Risco:** baixo.
- **Impacto:** `nginx.conf`.
- **Custo estimado:** baixo.

## Decisão Tomada — Pergunta 2

**Ainda não aprovada.** Direção proposta é a Alternativa A, já detalhada em AER-013/014 — decisão
final pertence à implementação de **B-43**.

## Justificativa Técnica

Para a Pergunta 1: separar Nginx por host resolveria um problema de disponibilidade que o
projeto não demonstrou ter (1 réplica de tudo, sem histórico de incidente de Nginx sobrecarregado),
na linha do mesmo critério de custo/benefício já usado em `ADR-0009`. Para a Pergunta 2: não há
contra-argumento técnico ao hardening — é atraso de priorização, não decisão consciente de não
fazer.

## Trade-offs

- **Pergunta 1 — o que foi ganho:** simplicidade operacional, 1 certificado, 1 processo a
  monitorar. **O que foi perdido:** falha compartilhada entre frontend e API.
- **Pergunta 2 — dívida técnica:** exatamente o que **B-43** cataloga — sem headers, sem
  rate limit próprio, sem redirect universal, timeout de WebSocket no default.

## Consequências

### Positivas
- Topologia simples, alinhada à decisão de manter o frontend como build estático (F5-3).
- Gzip e cache agressivo de assets versionados (`/assets/`, `expires 1y`) já corretos
  (`nginx.conf:49-52`).

### Negativas
- Nginx é hoje SPOF compartilhado entre frontend e API (aceito, ver Pergunta 1).
- Ausência total de hardening de borda enquanto B-43 não for feito — é a única camada que toca
  todo o tráfego e hoje não participa de nenhuma defesa (achado central da AGR).

### Neutras / a observar
- `client_max_body_size 64M` já dimensionado para mídia do WhatsApp (`nginx.conf:26`) —
  consistente com o limite de 25MB do body parser da API para webhooks (`main.ts:47`).

## Componentes Afetados

- [ ] Controllers · [ ] Services · [ ] Repositories · [ ] Prisma · [ ] Redis · [ ] Bull
- [ ] Storage · [ ] Docker · [x] Nginx · [x] WebSocket (timeout de `/socket.io/`) · [ ] Banco
- [ ] Outros

## Relação com Governança

- **ACR:** não tratou este tema
- **ABR:** citado indiretamente via B-43 na tabela de backlog
- **AGR:** §6 (Security Layer Matrix), §9 (Trust Boundary Diagram — Nginx como fronteira
  semi-trusted que não valida nada)
- **AER (Constituição):** AER-013, AER-014
- **ASNF (Manual):** ASNF-075, ASNF-088
- **ATM:** Parte VI (Segurança), Parte VII (Roadmap — linha B-43)
- **Roadmap:** **B-43**

## Evidências

- **Arquivos/Classes/Métodos:** `infra/nginx/nginx.conf` (íntegro, 90 linhas)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** NÃO ENCONTRADO
- **Pipelines:** NÃO ENCONTRADO

## Critérios de Validação

Quando implementada (Pergunta 2): `curl -I` contra `app.` e `api.` mostra os 4 headers mínimos;
`curl` HTTP contra `api.atendehub.com:80` recebe redirect 301; conexão WebSocket permanece
estável por mais de 5 minutos sem reconexão forçada.

## Critérios de Revisão

Pergunta 2: obrigatório ao implementar **B-43**. Pergunta 1: revisar se houver indício real de
Nginx como gargalo de disponibilidade (hoje ausente).

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação | 1.0 |

## Referências

- `docs/04-Arquitetura/AGR_2026-08-05_governance.md` §6, §9
- `docs/00-Governanca/CONSTITUICAO-ARQUITETURAL.md` (AER-013/014)
- `ROADMAP_ESTABILIZACAO.md` (item B-43)
