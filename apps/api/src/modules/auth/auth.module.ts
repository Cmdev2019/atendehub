import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionModule } from './session.module';
import { EventsModule } from '../events/events.module';
import { AvailabilityModule } from '../availability/availability.module';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule,
    // B-74: blacklist e validação de sessão vêm do SessionModule (uma só
    // conexão Redis da blacklist, compartilhada com o WebSocket).
    SessionModule,
    EventsModule,
    // B-65: o logout põe o usuário Offline
    AvailabilityModule,
    // Registra o JwtModule com secret carregado via ConfigService (após .env ser lido)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenCleanupService,
    LocalStrategy,
    JwtStrategy,

    // Aplica JwtAuthGuard globalmente — todas as rotas exigem autenticação
    // exceto as marcadas com @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // Aplica RolesGuard globalmente — verifica @Roles() em todas as rotas
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
