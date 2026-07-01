import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
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
      where: { token: refreshToken },
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

    // Salva novo refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId: safeUser.id,
        token: tokens.refreshToken,
        expiresAt,
      },
    });

    return tokens;
  }

  // ── Logout — revoga o refresh token ──────────────────────────────────────
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        token: refreshToken,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
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

    const expiresIn = this.parseExpiry(process.env.JWT_EXPIRES_IN ?? '15m');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
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
