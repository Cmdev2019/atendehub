import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AccessSessionService } from '../access-session.service';

export interface JwtPayload {
  sub: string;       // userId
  companyId: string;
  email: string;
  role: string;
  typ?: 'access' | 'refresh'; // B-72 (M-08)
  jti?: string;      // id único do token (B-72)
  iat?: number;      // issued at (adicionado automaticamente pelo JWT)
  exp?: number;      // expiration (adicionado automaticamente pelo JWT)
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly accessSession: AccessSessionService,
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

    // Tipo, blacklist, usuário ativo e sessões encerradas — mesma regra do
    // handshake do WebSocket (B-74).
    return this.accessSession.validate(token, payload);
  }
}
