import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { AuthUserDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

/**
 * B-74 (M-09): o que torna um access token válido além da assinatura — tipo,
 * blacklist, usuário ativo e sessões não encerradas (B-72). Antes isso vivia
 * só no JwtStrategy (HTTP); o handshake do WebSocket conferia apenas a
 * assinatura, então um token revogado ou de usuário desativado ainda abria
 * socket. Os dois caminhos usam esta mesma regra.
 */
@Injectable()
export class AccessSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  async validate(token: string, payload: JwtPayload): Promise<AuthUserDto> {
    // B-72 (M-08): só access token abre rota — um refresh token assinado com
    // o mesmo segredo (configuração errada) não passa daqui.
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Tipo de token inválido');
    }

    if (await this.tokenBlacklist.isBlacklisted(token)) {
      throw new UnauthorizedException('Token foi revogado');
    }

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
        sessionsRevokedAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuário não encontrado ou inativo');
    }

    // B-72 (M-08): sessões encerradas por troca/reset de senha. `iat` é em
    // segundos — a comparação também, para o token emitido logo depois da
    // troca (no mesmo segundo) continuar valendo.
    if (
      user.sessionsRevokedAt &&
      (payload.iat ?? 0) < Math.floor(user.sessionsRevokedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Sessão encerrada');
    }

    const { sessionsRevokedAt: _r, isActive: _a, ...authUser } = user;
    return { ...authUser, sessionId: payload.jti };
  }
}
