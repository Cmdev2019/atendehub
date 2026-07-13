import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule,
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
    TokenBlacklistService,
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
