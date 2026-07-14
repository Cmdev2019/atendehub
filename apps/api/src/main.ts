import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

// ── Placeholders inseguros que jamais devem ser usados em produção ────────────
const INSECURE_PLACEHOLDERS = [
  'troque_por_um_segredo_forte_de_64_bytes_minimo',
  'troque_por_outro_segredo_forte_diferente_do_acesso',
  'change_me',
  'secret',
  'jwt_secret',
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // ── Validação crítica de segredos na inicialização ─────────────────────────
  const config = app.get(ConfigService);
  validateSecrets(config);

  // ── Segurança ──────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(compression());

  // ── CORS ───────────────────────────────────────────────────────────────────
  const origins = process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'];
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Prefixo global da API ──────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Validação global de DTOs ───────────────────────────────────────────────
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

  const port = process.env.APP_PORT ?? 3001;
  await app.listen(port);

  const logger = app.get(Logger);
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'development') {
    logger.log(`🚀 AtendeHub API rodando em http://localhost:${port}/api/v1`);
  } else {
    logger.log(`🚀 AtendeHub API iniciada na porta ${port}`);
  }
}

bootstrap();

// ── Validação de segredos ────────────────────────────────────────────────────
function validateSecrets(config: ConfigService): void {
  const logger = new Logger('Bootstrap');
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  const jwtSecret = config.get<string>('JWT_SECRET', '');
  const jwtRefreshSecret = config.get<string>('JWT_REFRESH_SECRET', '');

  const isInsecure = (value: string) =>
    !value ||
    value.length < 32 ||
    INSECURE_PLACEHOLDERS.some((p) => value.toLowerCase().includes(p));

  const isProduction = nodeEnv === 'production';
  const isStaging = nodeEnv === 'staging';

  if (isInsecure(jwtSecret) || isInsecure(jwtRefreshSecret)) {
    const msg =
      'JWT_SECRET ou JWT_REFRESH_SECRET não configurados corretamente. ' +
      'Gere segredos fortes com: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"';

    // Falhar em produção E staging
    if (isProduction || isStaging) {
      logger.error(`❌ FALHA CRÍTICA - ${msg}`);
      logger.error('⚠️  A aplicação não iniciará sem secrets configurados.');
      process.exit(1);
    } else {
      // Apenas warning em desenvolvimento
      logger.warn(`⚠️  ${msg} (ignorado em desenvolvimento)`);
      logger.warn('💡 Dica: Execute o comando acima para gerar um secret forte.');
    }
  }

  if (isProduction || isStaging) {
    logger.log('✅ Secrets JWT validados com sucesso');
  }
}
