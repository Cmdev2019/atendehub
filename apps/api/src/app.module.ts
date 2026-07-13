import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './shared/prisma/prisma.module';
import { StorageModule } from './shared/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompanyModule } from './modules/company/company.module';
import { UserModule } from './modules/user/user.module';
import { DepartmentModule } from './modules/department/department.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { ContactModule } from './modules/contact/contact.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { MessageModule } from './modules/message/message.module';
import { NoteModule } from './modules/note/note.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL') ?? 60) * 1000,
          limit: Number(config.get('THROTTLE_LIMIT') ?? 100),
        },
      ],
    }),
    // ── BullMQ (filas de processamento assíncrono) ───────────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          // Prefixo para separar keys do Bull de outras keys Redis
          keyPrefix: 'bull:',
        },
        defaultJobOptions: {
          // Jobs sem progresso por 5min são considerados travados
          removeOnComplete: 100, // mantém últimos 100 jobs completos
          removeOnFail: 500,     // mantém últimos 500 jobs que falharam
          attempts: 3,           // retry até 3x por padrão
          backoff: {
            type: 'exponential',
            delay: 2000,         // 2s, depois 4s, depois 8s
          },
        },
      }),
    }),
    PrismaModule,
    StorageModule,
    // ── Auth & Core ──────────────────────────────────────────────────────────
    AuthModule,
    CompanyModule,
    UserModule,
    DepartmentModule,
    // ── WhatsApp ─────────────────────────────────────────────────────────────
    WhatsappModule,
    // ── Atendimento ──────────────────────────────────────────────────────────
    ContactModule,
    ConversationModule,
    MessageModule,
    NoteModule,
    // ── Tempo real ────────────────────────────────────────────────────────────
    EventsModule,
    // ── Integrações ───────────────────────────────────────────────────────────
    WebhookModule,
  ],
  providers: [
    // Aplica rate limiting globalmente. Sem isso, o ThrottlerModule.forRoot()
    // acima apenas define opções, mas nenhuma rota é de fato limitada.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
