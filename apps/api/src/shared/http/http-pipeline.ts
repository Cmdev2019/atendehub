import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Prefixo e validação global da API — compartilhado entre o `main.ts` e o
 * e2e de autorização HTTP (test/http-authz.e2e-spec.ts, M-22/B-63), para o
 * teste exercitar exatamente o mesmo pipeline que vai para produção.
 */
export function applyHttpPipeline(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // remove campos não declarados no DTO
      forbidNonWhitelisted: true,
      transform: true,          // transforma tipos automaticamente
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
}
