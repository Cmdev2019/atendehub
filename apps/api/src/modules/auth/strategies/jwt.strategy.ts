import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TokenBlacklistService } from '../token-blacklist.service';

export interface JwtPayload {
  sub: string;       // userId
  companyId: string;
  email: string;
  role: string;
  iat?: number;      // issued at (adicionado automaticamente pelo JWT)
  exp?: number;      // expiration (adicionado automaticamente pelo JWT)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
      // Passa a requisição para o validate() para extrair o token bruto
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // Extrai o token bruto do header Authorization
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    if (!token) {
      throw new UnauthorizedException('Token não informado');
    }

    // ── Verifica blacklist ANTES de validar o usuário ────────────────────────
    const isBlacklisted = await this.tokenBlacklist.isBlacklisted(token);

    if (isBlacklisted) {
      throw new UnauthorizedException('Token foi revogado');
    }

    // ── Valida usuário no banco ──────────────────────────────────────────────
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuário não encontrado ou inativo');
    }

    return user;
  }
}
