import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './shared/websocket/redis-io.adapter';

// ── Placeholders inseguros que jamais devem ser usados em produção ────────────
const INSECURE_PLACEHOLDERS = [
  'troque_por_um_segredo_forte_de_64_bytes_minimo',
  'troque_por_outro_segredo_forte_diferente_do_acesso',
  'change_me',
  'secret',
  'jwt_secret',
];

async function bootstrap() {
  // 'debug' inclui dados de payload (ex.: telefone do contato em cada
  // mensagem processada no webhook) — nunca em produção, mesmo que alguém
  // ligue debug manualmente depois via variável de ambiente do Nest.
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevels = isProduction
    ? (['error', 'warn', 'log'] as const)
    : (['error', 'warn', 'log', 'debug'] as const);

  const app = await NestFactory.create(AppModule, {
    logger: [...logLevels],
    bodyParser: false, // registrado manualmente abaixo com limites por rota
  });

  // ── Body parser com limite por rota ────────────────────────────────────────
  // Webhooks da Evolution chegam com mídia embutida em base64 (webhookBase64)
  // e estouram o limite padrão de 100kb → 413 e a mensagem nunca entra.
  app.use('/api/v1/webhooks', json({ limit: '25mb' }));
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // ── Validação crítica de segredos na inicialização ─────────────────────────
  const config = app.get(ConfigService);
  validateSecrets(config);

  // ── Segurança ──────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(compression());

  // ── CORS ───────────────────────────────────────────────────────────────────
  const origins = process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'];
  validateCorsOrigins(config, origins);
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Prefixo global da API ──────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Socket.IO com Redis Adapter (B2-6) ─────────────────────────────────────
  // Precisa ser aplicado aqui, no IoAdapter raiz, e não dentro do gateway —
  // ver comentário em redis-io.adapter.ts.
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

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
  const nodeEnv = process.env.NODE_ENV || 'development';

  await app.listen(port);

  if (nodeEnv === 'development') {
    console.log(`🚀 AtendeHub API rodando em http://localhost:${port}/api/v1`);
  } else {
    console.log(`🚀 AtendeHub API iniciada na porta ${port}`);
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

// ── Validação de CORS_ORIGINS ─────────────────────────────────────────────────
// Sem isso, um deploy em produção sem CORS_ORIGINS configurado sobe "com
// sucesso" mas rejeita silenciosamente todo tráfego do front real (fallback
// aponta pro localhost:3000 de dev) — falha só aparece depois, como CORS
// error no navegador do cliente, longe de qualquer log de boot.
function validateCorsOrigins(config: ConfigService, origins: string[]): void {
  const logger = new Logger('Bootstrap');
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const isStaging = nodeEnv === 'staging';

  if (!isProduction && !isStaging) return;

  const usesDevDefault = !process.env.CORS_ORIGINS;
  const usesWildcard = origins.includes('*');

  if (usesDevDefault || usesWildcard) {
    const msg = usesWildcard
      ? 'CORS_ORIGINS não pode ser "*" em produção (incompatível com credentials:true e permite qualquer origem).'
      : 'CORS_ORIGINS não configurado — caindo no default de desenvolvimento (localhost:3000).';

    logger.error(`❌ FALHA CRÍTICA - ${msg}`);
    logger.error('⚠️  A aplicação não iniciará com CORS mal configurado em produção/staging.');
    process.exit(1);
  }

  logger.log(`✅ CORS validado — origens permitidas: ${origins.join(', ')}`);
}
