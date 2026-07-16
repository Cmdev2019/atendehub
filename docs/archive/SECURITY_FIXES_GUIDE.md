# 🔧 Guia Prático de Correção - Problemas de Segurança

---

## 1️⃣ CRÍTICO: Remover Senha MinIO Hardcoded

### Problema
```typescript
// ❌ ANTES (storage.service.ts:31)
secretKey: this.config.get<string>('MINIO_ROOT_PASSWORD', 'minio_secret_123'),
```

### Solução
```typescript
// ✅ DEPOIS
import { InternalServerErrorException } from '@nestjs/common';

constructor(private readonly config: ConfigService) {
  const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
  const parsed = new URL(endpoint);

  const accessKey = this.config.get<string>('MINIO_ROOT_USER');
  const secretKey = this.config.get<string>('MINIO_ROOT_PASSWORD');

  // Validar que ambas as credenciais estão configuradas
  if (!accessKey || !secretKey) {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    if (nodeEnv === 'production' || nodeEnv === 'staging') {
      throw new InternalServerErrorException(
        'MINIO_ROOT_USER e MINIO_ROOT_PASSWORD devem estar configurados'
      );
    }
    // Em desenvolvimento, usar valores padrão (apenas para teste local)
    accessKey ??= 'minioadmin';
    secretKey ??= 'minioadmin';
    this.logger.warn('⚠️  MinIO usando credenciais padrão (desenvolvimento apenas)');
  }

  this.client = new Minio.Client({
    endPoint: parsed.hostname,
    port: Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 9000),
    useSSL: parsed.protocol === 'https:',
    accessKey,
    secretKey,
  });

  this.bucket = this.config.get<string>('MINIO_BUCKET', 'atendehub-media');
  this.publicUrl = endpoint;
}
```

### Checklist de Configuração
```bash
# 1. Gerar credenciais fortes
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Configurar variáveis de ambiente
# .env.production
MINIO_ROOT_USER=seu_usuario_aleatorio
MINIO_ROOT_PASSWORD=sua_senha_gerada_acima

# 3. Verificar que está configurado
npm run build && npm start
# Esperado: Sem aviso de credenciais padrão
```

---

## 2️⃣ CRÍTICO: Remover Credenciais de Seed

### Problema
```typescript
// ❌ ANTES (seed.ts:29 e 105-106)
const passwordHash = await bcrypt.hash("Admin@123", 12);
// ...
console.log("   Email: admin@demo.com");
console.log("   Senha: Admin@123");
```

### Solução
```typescript
// ✅ DEPOIS
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';

async function main() {
  console.log("🌱 Iniciando seed...");

  // ── Empresa demo ────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Empresa Demo",
      slug: "demo",
      plan: Plan.PROFESSIONAL,
      maxAgents: 20,
      maxChannels: 10,
    },
  });

  console.log(`✓ Empresa criada: ${company.name} (${company.id})`);

  // ── Admin com senha temporária aleatória ────────────────────────────────────
  const temporaryPassword = randomBytes(16).toString('hex');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const admin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: "admin@demo.com" } },
    update: {},
    create: {
      companyId: company.id,
      name: "Administrador",
      email: "admin@demo.com",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log(`✓ Admin criado: ${admin.email}`);

  // ── Salvar credenciais em arquivo seguro (não em logs) ────────────────────────
  const seedCredentials = `
CREDENCIAIS DE SEED
===================
Geradas em: ${new Date().toISOString()}

Email: admin@demo.com
Senha Temporária: ${temporaryPassword}

⚠️  AÇÃO REQUERIDA:
1. Guarde essas credenciais em local seguro
2. Acesse a aplicação com essas credenciais
3. Mude a senha imediatamente após primeiro login
4. Não compartilhe este arquivo
5. Delete este arquivo após guardar as credenciais

NUNCA comita este arquivo no Git.
  `.trim();

  const fileName = `.seed-credentials-${Date.now()}.txt`;
  writeFileSync(fileName, seedCredentials, { mode: 0o600 }); // Modo 600 = apenas owner pode ler

  console.log(`\n✅ Seed concluído com sucesso!`);
  console.log(`📄 Credenciais salvas em: ${fileName}`);
  console.log(`⚠️  Este arquivo será auto-deletado em 1 hora (implementar em produção)`);

  // Auto-delete em desenvolvimento após 1 hora
  if (process.env.NODE_ENV !== 'production') {
    setTimeout(() => {
      try {
        require('fs').unlinkSync(fileName);
        console.log(`🗑️  Arquivo de credenciais deletado automaticamente`);
      } catch (err) {
        console.warn(`Falha ao deletar arquivo de credenciais: ${err.message}`);
      }
    }, 60 * 60 * 1000); // 1 hora
  }
}
```

### Atualizar .gitignore
```bash
# Adicionar ao .gitignore
echo ".seed-credentials-*.txt" >> .gitignore
```

---

## 3️⃣ CRÍTICO: Validar Secrets em Staging

### Problema
```typescript
// ❌ ANTES (main.ts:74-85)
if (nodeEnv === 'production') {
  logger.error(`❌ ${msg}`);
  process.exit(1);
} else {
  logger.warn(`⚠️  ${msg} (ignorado em desenvolvimento)`);
}
```

### Solução
```typescript
// ✅ DEPOIS
const isProduction = nodeEnv === 'production';
const isStaging = nodeEnv === 'staging';

if (isProduction || isStaging) {
  if (isInsecure(jwtSecret) || isInsecure(jwtRefreshSecret)) {
    logger.error(`❌ ${msg}`);
    logger.error('FALHA CRÍTICA: Aplicação não iniciará sem secrets configurados.');
    process.exit(1);
  }
} else {
  // Apenas em desenvolvimento
  if (isInsecure(jwtSecret) || isInsecure(jwtRefreshSecret)) {
    logger.warn(`⚠️  ${msg}`);
    logger.warn('💡 Dica: Execute este comando para gerar um secret:');
    logger.warn(`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`);
  }
}
```

### Configuração de Variáveis
```bash
# .env.staging
NODE_ENV=staging
JWT_SECRET=<gerar_com_comando_acima>
JWT_REFRESH_SECRET=<gerar_com_comando_acima>

# .env.production
NODE_ENV=production
JWT_SECRET=<gerar_com_comando_acima>
JWT_REFRESH_SECRET=<gerar_com_comando_acima>
```

---

## 4️⃣ IMPORTANTE: Substituir `any` por Tipos Genéricos

### Problema
```typescript
// ❌ ANTES (conversation.service.ts:54)
const where: any = {
  companyId,
  ...(status && { status }),
  ...(channel && { channel }),
  ...(agentId !== undefined && { agentId }),
  ...(departmentId && { departmentId }),
  ...(search && {
    contact: {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
      ],
    },
  }),
};
```

### Solução
```typescript
// ✅ DEPOIS
// Adicionar interface no mesmo arquivo ou em types/conversation.ts
interface ConversationWhereInput {
  companyId: string;
  status?: ConversationStatus;
  channel?: Channel;
  agentId?: string | null;
  departmentId?: string;
  contact?: {
    OR: Array<{
      name?: { contains: string; mode: 'insensitive' };
      phone?: { contains: string; mode: 'insensitive' };
    }>;
  };
}

// Usar interface ao invés de any
const where: ConversationWhereInput = {
  companyId,
  ...(status && { status }),
  ...(channel && { channel }),
  ...(agentId !== undefined && { agentId }),
  ...(departmentId && { departmentId }),
  ...(search && {
    contact: {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
      ],
    },
  }),
};
```

---

## 5️⃣ IMPORTANTE: Validador Customizado de URL

### Problema
```typescript
// ❌ ANTES
@IsUrl()
avatarUrl?: string;
```

### Solução
```typescript
// ✅ DEPOIS

// 1. Criar arquivo: src/shared/validators/safe-url.validator.ts
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

@ValidatorConstraint({ name: 'isSafeUrl', async: false })
export class IsSafeUrlConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (!value) return true; // Campo é opcional

    try {
      const url = new URL(value);

      // Apenas protocólos seguros
      const allowedProtocols = ['http:', 'https:'];
      if (!allowedProtocols.includes(url.protocol)) {
        return false;
      }

      // Evitar localhost em produção
      if (process.env.NODE_ENV === 'production') {
        if (
          url.hostname === 'localhost' ||
          url.hostname === '127.0.0.1' ||
          url.hostname === '0.0.0.0'
        ) {
          return false;
        }
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  defaultMessage(): string {
    return 'URL deve ser uma URL válida com protocolo http: ou https:';
  }
}

export function IsSafeUrl(validationOptions?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName,
      validator: IsSafeUrlConstraint,
      options: validationOptions,
    });
  };
}

// 2. Usar no DTO:
import { IsSafeUrl } from '@shared/validators/safe-url.validator';

export class CreateContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'Telefone deve conter entre 10 e 15 dígitos numéricos' })
  phone: string;

  @IsOptional()
  @IsSafeUrl({ message: 'Avatar URL deve ser segura (http/https)' })
  avatarUrl?: string;
}
```

---

## 6️⃣ MENOR: Remover `.env` do Git

### Solução
```bash
# 1. Remover arquivo do Git (não deleta localmente)
git rm --cached apps/api/.env

# 2. Adicionar ao .gitignore
cat >> .gitignore << EOF

# Variáveis de ambiente
.env
.env.local
.env.*.local
.seed-credentials-*.txt

# Logs
*.log
logs/
EOF

# 3. Commitar
git add .gitignore
git commit -m "chore: remove .env from version control"

# 4. Criar .env.example como referência
cat > apps/api/.env.example << 'EOF'
# === APLICAÇÃO ===
NODE_ENV=development
APP_PORT=3001

# === JWT SECRETS (Gerar com: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_secret_here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# === BANCO DE DADOS ===
DATABASE_URL=postgresql://user:password@localhost:5432/atendehub

# === REDIS ===
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# === MINIO (Storage)
MINIO_ENDPOINT=http://localhost:9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_BUCKET=atendehub-media

# === CORS ===
CORS_ORIGINS=http://localhost:3000

# === EVOLUTION API (WhatsApp)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your_key_here
EVOLUTION_WEBHOOK_URL=http://localhost:3001/api/v1/webhooks/evolution

# === RATE LIMITING ===
THROTTLE_TTL=60
THROTTLE_LIMIT=100
EOF

# 5. Commitar .env.example
git add apps/api/.env.example
git commit -m "docs: add .env.example as template"
```

---

## 7️⃣ MENOR: Validação de Tamanho de Upload

### Solução
```typescript
// ✅ storage.service.ts

export interface UploadResult {
  url: string;
  bucket: string;
  key: string;
  size: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;
  private bucket: string;
  private publicUrl: string;

  // Definir limite máximo por tipo de arquivo
  private readonly MAX_FILE_SIZES = {
    'image/*': 10 * 1024 * 1024, // 10MB
    'video/*': 100 * 1024 * 1024, // 100MB
    'audio/*': 50 * 1024 * 1024, // 50MB
    'application/*': 25 * 1024 * 1024, // 25MB
    default: 25 * 1024 * 1024, // 25MB
  };

  constructor(private readonly config: ConfigService) {
    // ... resto do constructor
  }

  /**
   * Upload com validação de tamanho
   */
  async upload(
    stream: Buffer | Readable,
    mimeType: string,
    companyId: string,
    originalName?: string,
    size?: number,
  ): Promise<UploadResult> {
    const dataSize = Buffer.isBuffer(stream) ? stream.length : size;

    // Validar tamanho
    this.validateFileSize(mimeType, dataSize);

    const ext = originalName
      ? extname(originalName)
      : this.getExtensionFromMime(mimeType);

    const key = `${companyId}/${this.getFolder(mimeType)}/${randomUUID()}${ext}`;

    const metaData = {
      'Content-Type': mimeType,
      ...(originalName && { 'X-Original-Name': originalName }),
    };

    await this.client.putObject(
      this.bucket,
      key,
      stream,
      dataSize,
      metaData,
    );

    const url = `${this.publicUrl}/${this.bucket}/${key}`;

    this.logger.debug(`Upload concluído: ${key} (${dataSize ?? '?'} bytes)`);

    return {
      url,
      bucket: this.bucket,
      key,
      size: dataSize ?? 0,
    };
  }

  /**
   * Validar tamanho do arquivo
   */
  private validateFileSize(mimeType: string, size?: number): void {
    if (!size) return; // Se não temos tamanho, não validamos

    // Encontrar limite baseado no tipo MIME
    let maxSize = this.MAX_FILE_SIZES.default;
    for (const [pattern, limit] of Object.entries(this.MAX_FILE_SIZES)) {
      if (pattern === 'default') continue;
      if (mimeType.match(new RegExp(`^${pattern.replace('*', '.*')}$`))) {
        maxSize = limit;
        break;
      }
    }

    if (size > maxSize) {
      const sizeMB = Math.ceil(size / 1024 / 1024);
      const limitMB = Math.ceil(maxSize / 1024 / 1024);
      throw new BadRequestException(
        `Arquivo é muito grande (${sizeMB}MB). Máximo permitido: ${limitMB}MB`,
      );
    }
  }

  // ... resto dos métodos
}
```

---

## 8️⃣ MENOR: Remover Dados Sensíveis de Logs

### Problema
```typescript
// ❌ ANTES
this.logger.log(`Login: ${user.email} (${user.companyId})`);
this.logger.log(`Login: ${user.email} na empresa ${company.name}`);
```

### Solução
```typescript
// ✅ DEPOIS
// Usar hash do email para rastreamento sem expor credencial
import { createHash } from 'crypto';

private hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex').substring(0, 8);
}

// No serviço:
async login(user: AuthUserDto): Promise<AuthResponseDto> {
  const tokens = await this.generateTokens(user);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await this.prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: this.hashToken(tokens.refreshToken),
      expiresAt,
    },
  });

  // ✅ Registro sem expor email
  this.logger.log(`Login bem-sucedido (user: ${this.hashEmail(user.email)}, company: ${user.companyId})`);

  return tokens;
}
```

---

## 9️⃣ MENOR: Validador de Telefone com IsMobilePhone

### Problema
```typescript
// ❌ ANTES
@Matches(/^\d{10,15}$/, { message: 'Telefone deve conter entre 10 e 15 dígitos numéricos' })
phone: string;
```

### Solução
```typescript
// ✅ DEPOIS
import { IsMobilePhone } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsMobilePhone('pt-BR', {}, { message: 'Telefone brasileiro inválido' })
  phone: string;

  // ... resto dos campos
}

// Se precisar suportar múltiplos países:
export class CreateInternationalContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  // Aceita PT-BR, ES, US, etc
  @IsMobilePhone() // Valida qualquer formato de telefone
  phone: string;

  @IsOptional()
  @IsString()
  @IsIn(['pt-BR', 'es', 'en-US', 'en-GB'])
  country?: string; // Dica: qual país o número pertence

  // ... resto dos campos
}
```

Instalar dependência se necessário:
```bash
npm install class-validator --save
```

---

## 🔟 MENOR: Configurar HTTPS em Development

### Solução
```typescript
// ✅ main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { readFileSync } from 'fs';
import { AppModule } from './app.module';

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
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const defaultOrigin = nodeEnv === 'development' ? 'http://localhost:3000' : 'https://app.example.com';
  const origins = config.get<string>('CORS_ORIGINS')?.split(',') ?? [defaultOrigin];

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
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = config.get<number>('APP_PORT') ?? 3001;

  // ── HTTPS para produção e staging ──────────────────────────────────────────
  if (nodeEnv !== 'development') {
    const https = await import('https');
    const key = readFileSync('/etc/certs/server.key', 'utf8');
    const cert = readFileSync('/etc/certs/server.crt', 'utf8');

    const httpsOptions = { key, cert };
    await app.listen(port, () => {
      const logger = new Logger('Bootstrap');
      logger.log(`🚀 AtendeHub API rodando em https://localhost:${port}/api/v1`);
    });
  } else {
    // Desenvolvimento: http é ok
    await app.listen(port);
    const logger = new Logger('Bootstrap');
    logger.log(`🚀 AtendeHub API rodando em http://localhost:${port}/api/v1`);
    logger.warn('⚠️  HTTPS desativado em desenvolvimento');
  }
}

function validateSecrets(config: ConfigService): void {
  const logger = new Logger('Bootstrap');
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  const jwtSecret = config.get<string>('JWT_SECRET', '');
  const jwtRefreshSecret = config.get<string>('JWT_REFRESH_SECRET', '');

  const INSECURE_PLACEHOLDERS = [
    'troque_por_um_segredo_forte_de_64_bytes_minimo',
    'troque_por_outro_segredo_forte_diferente_do_acesso',
    'change_me',
    'secret',
    'jwt_secret',
  ];

  const isInsecure = (value: string) =>
    !value ||
    value.length < 32 ||
    INSECURE_PLACEHOLDERS.some((p) => value.toLowerCase().includes(p));

  const isProduction = nodeEnv === 'production';
  const isStaging = nodeEnv === 'staging';

  if (isProduction || isStaging) {
    if (isInsecure(jwtSecret) || isInsecure(jwtRefreshSecret)) {
      const msg =
        'JWT_SECRET ou JWT_REFRESH_SECRET não configurados corretamente. ' +
        'Gere segredos fortes com: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"';

      logger.error(`❌ ${msg}`);
      process.exit(1);
    }
  } else if (isInsecure(jwtSecret) || isInsecure(jwtRefreshSecret)) {
    const msg =
      'JWT_SECRET ou JWT_REFRESH_SECRET não configurados corretamente. ' +
      'Gere segredos fortes com: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"';

    logger.warn(`⚠️  ${msg} (ignorado em desenvolvimento)`);
  }
}

bootstrap();
```

---

## ✅ Verificação Final

Após implementar todas as correções, execute:

```bash
# 1. Verificar vulnerabilidades de dependências
npm audit

# 2. Executar linter de segurança
npm install -D eslint-plugin-security --save-dev
npm install -D @typescript-eslint/eslint-plugin --save-dev

# 3. Testar build
npm run build

# 4. Verificar ambiente de staging
NODE_ENV=staging npm start

# 5. Testes de integração
npm test
```

---

## 📚 Referências de Segurança

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NestJS Security Best Practices](https://docs.nestjs.com/security/authentication)
- [Node.js Security Checklist](https://github.com/goldbergyoni/nodebestpractices#6-security-best-practices)
- [Prisma Security Guide](https://www.prisma.io/docs/concepts/components/prisma-client/security)
