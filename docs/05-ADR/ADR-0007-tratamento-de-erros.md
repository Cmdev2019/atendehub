# ADR-0007 — Três classificadores de erro, um por camada, não um só genérico

- **Status:** Aceita
- **Data:** 2026-08-01
- **Decisores:** Engenharia (ACR)
- **Contexto técnico:** `apps/api/src/shared/monitoring/sentry.ts`, `apps/api/src/modules/webhook/webhook.errors.ts`, `ValidationPipe` global (`main.ts`)

## Contexto

O projeto tem 3 mecanismos de tratamento de exceção que, à primeira vista, poderiam parecer candidatos a um `ErrorClassifier` único (conforme lista de componentes sugerida na ACR): `SentryExceptionFilter` (filtro global HTTP), `classifyWebhookError` (decide retry vs. DLQ no processor de webhook) e `ValidationPipe` com `forbidNonWhitelisted` (rejeita request malformado antes de chegar em qualquer service). Vale unificar?

## Alternativas consideradas

### Alternativa A — `ErrorClassifier` único e genérico, usado nas 3 camadas
- **Prós:** um só lugar pra entender "o que o projeto faz com erro".
- **Contras:** as 3 camadas respondem perguntas diferentes: `ValidationPipe` decide **se a requisição é aceitável** (antes de qualquer lógica rodar); `SentryExceptionFilter` decide **o que reportar** pra observabilidade externa (toda exceção não tratada que chega até o filtro HTTP); `classifyWebhookError` decide **se vale a pena tentar de novo** (transitório) ou **desistir já** (permanente) — uma decisão de política de retry, não de reporte nem de validação de shape. Forçar as 3 num único componente exigiria um modelo de "tipo de erro" genérico o bastante pra cobrir DTO inválido, exceção HTTP 5xx e falha de rede da Evolution — nenhuma classificação unificada seria mais simples que as 3 já são separadas.
- **Custo estimado:** alto (design de um modelo genérico) para benefício não comprovado (as 3 já não competem nem duplicam raciocínio entre si).

### Alternativa B — Manter os 3, cada um resolvendo seu próprio problema, documentados como camadas complementares
- **Prós:** cada um é pequeno, testável isoladamente, e já está correto (`classifyWebhookError` tem suíte própria com matriz de código HTTP/rede validada em B-39).
- **Contras:** nenhum, desde que a intenção de cada um esteja documentada (evita que uma auditoria futura os confunda como duplicação acidental).
- **Custo estimado:** zero — já implementado.

## Decisão

**Alternativa B.** Os 3 mecanismos permanecem separados. Esta ADR formaliza a distinção pra evitar que uma auditoria futura os trate como candidatos a consolidação sem entender que resolvem perguntas diferentes.

## Consequências

### Positivas
- Cada camada permanece simples e testável no seu próprio escopo.
- Nenhum acoplamento entre "erro de validação de DTO" e "erro de rede da Evolution" — mudar a política de retry do webhook nunca arrisca quebrar validação de request.

### Negativas
- Um novo desenvolvedor pode, à primeira vista, achar que há 3 formas incoerentes de tratar erro no projeto — mitigado por esta ADR e pela seção correspondente em `docs/06-Backend/README.md`.

### Neutras / a observar
- `Prisma.PrismaClientKnownRequestError`/`P2002` (ADR-0002) é um 4º tipo de sinal de erro no projeto, mas não é um "classificador" — é um caso pontual e explícito (`isUniqueConstraintViolation`), não uma política geral de retry/reporte.

## Quando usar cada um (diretriz derivada)

- **`ValidationPipe`**: automático, global, nunca precisa de código extra por rota — só o DTO com `class-validator` correto.
- **`SentryExceptionFilter`**: automático, global — só relevante saber que existe pra não duplicar `console.error`/captura manual de exceção HTTP.
- **`classifyWebhookError`**: só dentro de processors de fila que precisam decidir retry vs. desistência — se um novo processor de fila for criado com a mesma necessidade, reusar/estender esta função, não escrever um classificador novo do zero.

## Critérios de reavaliação

Se um 2º processor de fila (além de `webhook`) precisar de classificação transitório/permanente, avaliar generalizar `classifyWebhookError` (hoje com nome/localização específicos de webhook) para `shared/`.

## Referências

- `apps/api/src/modules/webhook/webhook.errors.ts` e seu spec (matriz completa de códigos).
