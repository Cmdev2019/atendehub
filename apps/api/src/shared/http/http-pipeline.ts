import {
  INestApplication,
  ValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';

/**
 * Opções do ValidationPipe global da API. Exportadas para o `main.ts`, o e2e
 * de autorização (test/http-authz.e2e-spec.ts, M-22/B-63) e os testes de DTO
 * usarem a MESMA configuração — assim um teste não valida um pipeline
 * diferente do que vai para produção.
 *
 * B-69 (M-14): `enableImplicitConversion` fica DESLIGADO de propósito. Com ele
 * ligado, a conversão implícita coerce todo valor de query (que chega sempre
 * como texto) pelo tipo do campo: `Boolean("false")` é `true`, então
 * `?isActive=false` filtrava o oposto do pedido, e o `@Transform` do DTO era
 * sobreposto. Desligado, cada campo declara a própria conversão: números de
 * query com `@Type(() => Number)` e booleanos com `@Transform`. Campos de
 * corpo (JSON) já chegam no tipo certo e não dependem disto.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true, // remove campos não declarados no DTO
  forbidNonWhitelisted: true,
  transform: true, // transforma tipos automaticamente
  transformOptions: {
    enableImplicitConversion: false,
  },
};

/**
 * Prefixo e validação global da API — compartilhado entre o `main.ts` e o
 * e2e de autorização HTTP (test/http-authz.e2e-spec.ts, M-22/B-63), para o
 * teste exercitar exatamente o mesmo pipeline que vai para produção.
 */
export function applyHttpPipeline(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
}
