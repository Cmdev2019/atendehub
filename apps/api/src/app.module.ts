import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompanyModule } from './modules/company/company.module';
import { UserModule } from './modules/user/user.module';
import { DepartmentModule } from './modules/department/department.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { ContactModule } from './modules/contact/contact.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { MessageModule } from './modules/message/message.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    PrismaModule,
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
    // ── Tempo real ────────────────────────────────────────────────────────────
    EventsModule,
    // ── Integrações ───────────────────────────────────────────────────────────
    WebhookModule,
  ],
})
export class AppModule {}
