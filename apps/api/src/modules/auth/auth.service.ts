import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  // ── Valida email + senha (usado pelo LocalStrategy) ───────────────────────
  async validateUser(email: string, password: string): Promise<AuthUserDto | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        isActive: true,
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        passwordHash: true,
        isActive: true,
        company: {
          select: { isActive: true },
        },
      },
    });

    if (!user) return null;
    if (!user.company.isActive) return null;

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) return null;

    // Remove o hash antes de retornar
    const { passwordHash: _hash, company: _company, ...safeUser } = user;
    return safeUser;
  }

  // ── Login — gera access + refresh token ───────────────────────────────────
  async login(user: AuthUserDto): Promise<AuthResponseDto> {
    const tokens = await this.generateTokens(user);

    // Salva o refresh token no banco para permitir revogação
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 dias

    // Armazena apenas o hash do token — nunca o valor em texto puro.
    // Se o banco vazar, os refresh tokens não podem ser reutilizados.
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: this.hashToken(tokens.refreshToken),
        expiresAt,
      },
    });

    this.logger.log(`Login: ${user.email} (${user.companyId})`);

    return tokens;
  }

  // ── Refresh — troca o refresh token por um novo par de tokens ─────────────
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    // Verifica se o token existe e não foi revogado
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: this.hashToken(refreshToken) },
      include: {
        user: {
          select: {
            id: true,
            companyId: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            isActive: true,
            company: { select: { isActive: true } },
          },
        },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    if (!stored.user.isActive || !stored.user.company.isActive) {
      throw new UnauthorizedException('Usuário ou empresa inativa');
    }

    // Revoga o token atual (rotação de tokens)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const { company: _c, ...safeUser } = stored.user;

    // Gera novo par
    const tokens = await this.generateTokens(safeUser);

    // Salva novo refresh token (hasheado)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId: safeUser.id,
        token: this.hashToken(tokens.refreshToken),
        expiresAt,
      },
    });

    return tokens;
  }

  // ── Logout — revoga o refresh token e opcionalmente o access token ────────
  async logout(refreshToken: string, accessToken?: string): Promise<void> {
    // Revoga o refresh token (padrão)
    await this.prisma.refreshToken.updateMany({
      where: {
        token: this.hashToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    // Se o access token foi fornecido, adiciona à blacklist
    if (accessToken) {
      await this.revokeAccessToken(accessToken);
    }
  }

  // ── Revoga um access token adicionando-o à blacklist ──────────────────────
  async revokeAccessToken(accessToken: string): Promise<void> {
    try {
      // Decodifica o token para obter o tempo de expiração
      const payload = this.jwtService.decode(accessToken) as JwtPayload;

      if (!payload || !payload.exp) {
        this.logger.warn('Token inválido ou sem exp, não adicionado à blacklist');
        return;
      }

      // Calcula quantos segundos faltam até a expiração
      const now = Math.floor(Date.now() / 1000);
      const expiresInSeconds = payload.exp - now;

      if (expiresInSeconds <= 0) {
        this.logger.debug('Token já expirado, não precisa blacklistar');
        return;
      }

      // Adiciona à blacklist com TTL igual ao tempo restante de expiração
      await this.tokenBlacklist.add(accessToken, expiresInSeconds);

      this.logger.log(`Access token revogado (TTL: ${expiresInSeconds}s)`);
    } catch (err: any) {
      this.logger.error(`Falha ao revogar access token: ${err.message}`);
      // Não propaga o erro — se falhar, o token expirará naturalmente
    }
  }

  // ── Hash determinístico do refresh token para armazenamento seguro ────────
  // Não usamos bcrypt aqui pois o token já é um segredo de alta entropia
  // (JWT assinado), e precisamos de lookup indexado exato — SHA-256 é
  // suficiente e é a prática padrão para tokens de sessão/API.
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // ── Retorna dados do usuário logado ───────────────────────────────────────
  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
      },
    });

    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    return user;
  }

  // ── Geração dos tokens ────────────────────────────────────────────────────
  private async generateTokens(user: AuthUserDto): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.role,
    };

    const jwtSecret         = this.config.get<string>('JWT_SECRET');
    const jwtExpiresIn      = this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
    const jwtRefreshSecret  = this.config.get<string>('JWT_REFRESH_SECRET');
    const jwtRefreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    const expiresIn = this.parseExpiry(jwtExpiresIn);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtSecret,
        expiresIn: jwtExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: jwtRefreshSecret,
        expiresIn: jwtRefreshExpires,
      }),
    ]);

    return { accessToken, refreshToken, expiresIn, user };
  }

  // Converte "15m", "7d", "1h" em segundos
  private parseExpiry(expiry: string): number {
    const map: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900;
    return Number(match[1]) * (map[match[2]] ?? 1);
  }
}
