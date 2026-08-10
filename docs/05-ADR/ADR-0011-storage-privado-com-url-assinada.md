# ADR-0011 — Storage privado com URL assinada (formalização retroativa de B-38)

- **Status:** Validada
- **Data de criação:** 2026-08-05
- **Última revisão:** 2026-08-05
- **Autor:** Engenharia (formalização retroativa — decisão já tomada e implementada em B-38)
- **Revisores:** —
- **Versão:** 1.0
- **Decisores:** Architecture Review Board
- **Contexto técnico:** `apps/api/src/shared/storage/storage.service.ts`, `MediaPresignInterceptor`

> Ciclo de vida conforme `README.md` desta pasta. Esta ADR é **retroativa**: a decisão foi
> tomada e implementada em B-38 (correção de bucket público, ver `ROADMAP_ESTABILIZACAO.md`)
> antes de existir este processo formal de ADR. Formalizada agora porque `INDICE.md` já listava
> este item desde 2026-08-01 como pendente de conversão.

## Contexto

Mídia do WhatsApp (imagem, áudio, vídeo, documento) e avatar de usuário precisam ser servidos ao
frontend a partir do MinIO. A primeira versão do bucket foi criada com política de leitura
pública (`{"Effect":"Allow","Principal":{"AWS":["*"]}}`) — qualquer um com a URL conseguia ler o
objeto sem autenticação, e a URL em si não expira. Auditoria de segurança (B-38) encontrou isso
como crítico: um link de mídia vazado (log, print, encaminhamento) dava acesso permanente ao
objeto.

## Problema

Como servir mídia armazenada no MinIO ao frontend sem que o objeto seja publicamente acessível
por qualquer pessoa com a URL?

## Alternativas Consideradas

### Alternativa A — Bucket privado + URL assinada de curta duração (presigned URL)
- **Prós:** o bucket nunca fica publicamente legível; cada URL expira (`MEDIA_SIGNED_URL_
  EXPIRATION`, default 600s, `storage.service.ts:107-114`); vazamento de uma URL específica tem
  janela de exposição limitada, não permanente.
- **Contras:** toda resposta que contenha uma URL de mídia precisa passar por um ponto de
  presign antes de sair da API (senão a URL interna, que não é acessível de fora da rede
  Docker, vaza para o cliente sem servir para nada) — exige um interceptor central
  (`MediaPresignInterceptor`) e a mesma lógica reaplicada em WebSocket (`EventsService`).
- **Complexidade:** média.
- **Risco:** baixo, já validado por E2E (`storage.e2e-spec.ts`) e por PRR pós-hardening
  (ROADMAP_ESTABILIZACAO.md, B-38 — achado de que a policy pública legada persistia entre boots
  até ser corrigida com `setBucketPolicy(bucket, '')` idempotente a cada boot).
- **Impacto:** todo consumo de mídia (upload de agente, mídia recebida do WhatsApp, avatar).
- **Custo estimado:** médio (implementado).

### Alternativa B — Proxy autenticado (API intermedia toda leitura de mídia, nunca expõe URL do MinIO)
- **Prós:** controle de acesso por requisição, sem depender de expiração de URL — a API decide a
  cada leitura se autoriza.
- **Contras:** toda leitura de mídia passa a consumir CPU/banda da própria API (proxy de bytes),
  em vez de o cliente baixar direto do MinIO; para vídeo/áudio, isso é overhead real de
  streaming pela camada de aplicação.
- **Complexidade:** média-alta.
- **Risco:** baixo de segurança, médio de performance sob volume alto de mídia.
- **Impacto:** mesmo escopo da Alternativa A.
- **Custo estimado:** médio-alto (não implementado).

### Alternativa C — Não fazer nada (manter bucket público)
- **Custo de manter como está:** vazamento permanente de qualquer URL de mídia — já classificado
  como crítico na auditoria original de B-38.

## Decisão Tomada

**Alternativa A** — bucket privado, URL assinada de curta duração, key do objeto gerada pelo
servidor (nunca a partir do nome de arquivo enviado pelo cliente,
`storage.service.ts:181-184`), ponto único de saída via `StorageService#presignDeep`, consumido
tanto pelo `MediaPresignInterceptor` (HTTP, interceptor global via `APP_INTERCEPTOR`) quanto
pelo `EventsService` (WebSocket).

## Justificativa Técnica

A Alternativa B (proxy) resolveria o mesmo problema de segurança, mas trocaria custo de
segurança por custo de performance/banda sob um tipo de dado (mídia) que é naturalmente pesado
e onde streaming direto do object storage é o padrão de mercado. A Alternativa A mantém o
cliente baixando direto do MinIO (rápido, sem custo de CPU da API) e resolve o vazamento pela
janela de expiração — trade-off aceito conscientemente: uma URL vazada continua utilizável até
expirar, não é proteção absoluta, é redução de exposição de "permanente" para "até N segundos".

## Trade-offs

- **O que foi ganho:** bucket nunca publicamente legível; janela de exposição de uma URL
  vazada limitada a `MEDIA_SIGNED_URL_EXPIRATION` (default 600s) em vez de indefinida.
- **O que foi perdido:** uma URL vazada **dentro da janela de validade** continua funcionando
  para qualquer um que a tenha — não é proteção por identidade do requisitante, é proteção por
  tempo.
- **Dívida técnica:** `getPresignedUrl`/`delete`/`presignUrl` não reconferem se o `companyId`
  embutido na key da mídia bate com o tenant de quem está pedindo (achado da AGR §4.3, sem ID de
  roadmap ainda — sugestão D da AGR §16).

## Consequências

### Positivas
- Fechou o achado crítico original de B-38 (bucket público).
- `setBucketPolicy(bucket, '')` idempotente a cada boot (`storage.service.ts:139`) garante que
  uma policy pública legada de uma versão anterior do código não sobrevive a um novo deploy —
  achado de hardening pós-auditoria, já documentado no `CHANGELOG.md`.

### Negativas
- URL vazada dentro da janela de validade continua acessível por qualquer um (trade-off aceito,
  não um bug).
- Exige que **todo** ponto de saída de dado que contenha URL de mídia passe pelo
  `MediaPresignInterceptor`/`presignDeep` — um novo endpoint que devolva uma URL de mídia sem
  passar por ali reintroduziria o vazamento da URL interna (não presignada), que nem funciona de
  fora da rede Docker, mas ainda assim é informação interna exposta desnecessariamente.

### Neutras / a observar
- Avatar de perfil do WhatsApp (servido pela própria Evolution/Meta) passa direto, sem
  modificação — não é um objeto do nosso bucket (`storage.service.ts:230`).

## Componentes Afetados

- [ ] Controllers · [x] Services (`StorageService`) · [ ] Repositories · [ ] Prisma · [ ] Redis
- [ ] Bull · [x] Storage · [ ] Docker · [ ] Nginx · [x] WebSocket (`EventsService` usa
  `presignDeep`) · [ ] Banco · [x] Outros: `MediaPresignInterceptor` (interceptor global)

## Relação com Governança

- **ACR:** não tratou este tema diretamente
- **ABR:** §9 (Segurança), citado como referência positiva de defesa em profundidade
- **AGR:** §6 (Security Layer Matrix — único caso de 3 camadas reais), §4.3 (achado do gap de
  reconferência)
- **AER (Constituição):** Política Storage (Parte II)
- **ASNF (Manual):** ASNF-032, ASNF-041, ASNF-078
- **ATM:** Parte IV (Matriz de Componentes — Storage), Parte VI (Matriz de Segurança)
- **Roadmap:** **B-38** (implementação original)

## Evidências

- **Arquivos/Classes/Métodos:** `shared/storage/storage.service.ts` (`upload`, `getPresignedUrl`,
  `presignUrl`, `presignDeep`, `onModuleInit` linhas 117-150)
- **Commits:** NÃO FOI POSSÍVEL VALIDAR
- **Testes:** `storage.service.spec.ts` (96,66% de cobertura, ABR §10), `storage.e2e-spec.ts`
- **Pipelines:** `api-ci.yml`

## Critérios de Validação

`GET` anônimo direto ao MinIO por uma key conhecida retorna acesso negado (não 200); URL
presignada expira após o tempo configurado; `setBucketPolicy(bucket, '')` roda a cada boot sem
lançar exceção que impeça o start (fail-open documentado para MinIO indisponível em dev,
`storage.service.ts:144-149`).

## Critérios de Revisão

Revisar se o volume de mídia justificar considerar a Alternativa B (proxy) para algum subtipo
específico (ex.: streaming de vídeo grande). Revisar obrigatoriamente ao corrigir o achado de
reconferência de `companyId` (sugestão D da AGR §16) — nesse momento, atualizar a seção
"Dívida técnica" desta ADR.

## Histórico

| Data | Mudança | Versão |
|---|---|---|
| 2026-08-05 | Criação — formaliza retroativamente a decisão já implementada em B-38 | 1.0 |

## Referências

- `ROADMAP_ESTABILIZACAO.md` (item B-38, changelog)
- `docs/04-Arquitetura/ABR_2026-08-05_baseline.md` §9
- `docs/04-Arquitetura/AGR_2026-08-05_governance.md` §4.3, §6
