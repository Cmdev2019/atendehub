import {
  Inject,
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../shared/redis/redis.module';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { EventsService } from '../events/events.service';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { JwtPayload } from './strategies/jwt.strategy';

// B-72 (M-08): reuso de um refresh token já rotacionado é sinal de roubo — a
// sessão inteira é encerrada. Só que duas abas do painel dividem o mesmo
// localStorage e podem renovar ao mesmo tempo; dentro desta janela o reuso é
// tratado como corrida e só a requisição atrasada é recusada.
const REFRESH_REUSE_GRACE_MS = 30_000;

// B-85 (M-20): hash de uma senha qualquer, com o mesmo custo dos reais. Quando
// o e-mail não existe, o login compara contra ele — sem isso a resposta saía
// bem mais rápida e o tempo revelava se o e-mail estava cadastrado.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('atendehub-sem-usuario', 12);

// B-85 (M-20): teto diário de cadastros públicos por IP (além do 3/min da rota)
const SIGNUP_DAILY_LIMIT_DEFAULT = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly events: EventsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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

    // B-85 (M-20): o bcrypt roda sempre, exista o usuário ou não — o tempo
    // de resposta não diz mais se o e-mail está cadastrado.
    const passwordMatch = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.company.isActive || !passwordMatch) return null;

    // Remove o hash antes de retornar
    const { passwordHash: _hash, company: _company, ...safeUser } = user;
    return safeUser;
  }

  // ── Login — gera access + refresh token ───────────────────────────────────
  async login(user: AuthUserDto): Promise<AuthResponseDto> {
    const tokens = await this.issueTokens(user);

    // Nunca logar o e-mail (PII) — id já é suficiente para correlacionar
    // com o banco se necessário investigar.
    this.logger.log(`Login: user=${user.id} company=${user.companyId}`);

    return tokens;
  }

  // ── Auto-cadastro público de empresa (B-9) ─────────────────────────────────
  // Quem se cadastra vira ADMIN da empresa nova (plano FREE por padrão, ver
  // Company.plan @default(FREE) no schema — sem fluxo de billing/upgrade
  // ainda). Pré-requisito B-20 (e-mail único globalmente, não só por
  // empresa) já aplicado via migration antes deste método existir.
  async registerCompany(dto: RegisterCompanyDto, ip?: string): Promise<AuthResponseDto> {
    // B-85 (M-20): o cadastro público pode ser desligado (SIGNUP_ENABLED=false)
    // e tem teto diário por IP — cada empresa nova ganha conexões de WhatsApp
    // gratuitas. Verificação de e-mail e CAPTCHA dependem de SMTP e de chave
    // de serviço externo: em espera (projeto sem produção).
    if (this.config.get<string>('SIGNUP_ENABLED', 'true') === 'false') {
      throw new ForbiddenException('O cadastro de novas empresas está desativado');
    }
    await this.consumeSignupQuota(ip);

    const email = dto.email.toLowerCase().trim();

    // Checagem prévia (mesmo padrão de user.service.ts#create — findFirst
    // antes do create, sem capturar P2002): risco de corrida é teórico e
    // aceito, consistente com o resto do código.
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }

    const slug = await this.generateUniqueSlug(dto.companyName);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { company, user } = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: dto.companyName.trim(), slug },
      });
      const user = await tx.user.create({
        data: {
          companyId: company.id,
          name: dto.name.trim(),
          email,
          passwordHash,
          role: Role.ADMIN,
        },
      });
      return { company, user };
    });

    this.logger.log(`Nova empresa cadastrada: company=${company.id} admin=${user.id}`);

    const authUser: AuthUserDto = {
      id: user.id,
      companyId: user.companyId,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
    };

    // Auto-login: quem acabou de criar a empresa já entra logado, sem
    // precisar de uma 2ª ida à tela de login.
    return this.login(authUser);
  }

  // Contador por IP e dia no Redis. Redis fora do ar não bloqueia o cadastro
  // (o limite por minuto da rota continua valendo).
  private async consumeSignupQuota(ip?: string): Promise<void> {
    if (!ip) return;
    const limit = Number(this.config.get('SIGNUP_DAILY_LIMIT_PER_IP')) || SIGNUP_DAILY_LIMIT_DEFAULT;
    const key = `signup:ip:${ip}:${new Date().toISOString().slice(0, 10)}`;
    const count = await this.redis
      .multi()
      .incr(key)
      .expire(key, 24 * 60 * 60)
      .exec()
      .then((res) => Number(res?.[0]?.[1] ?? 0))
      .catch(() => 0);
    if (count > limit) {
      throw new HttpException(
        'Limite diário de cadastros atingido para esta rede. Tente amanhã.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // Gera um slug único a partir do nome da empresa (usado como subdomínio —
  // ver comentário em Company.slug no schema). Colisão é resolvida com
  // sufixo numérico incremental (comercial-2, comercial-3, ...).
  private async generateUniqueSlug(companyName: string): Promise<string> {
    const base =
      companyName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // remove acentos (NFD separa a base da marca combinante)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'empresa';

    let slug = base;
    let suffix = 1;
    while (await this.prisma.company.findUnique({ where: { slug }, select: { id: true } })) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
    return slug;
  }

  // ── Refresh — troca o refresh token por um novo par de tokens ─────────────
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    // B-72 (M-08): assinatura e tipo antes do banco — um access token (outro
    // segredo, typ "access") não serve como refresh token.
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.typ !== 'refresh') throw new Error('typ');
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

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

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    if (stored.revokedAt) {
      await this.handleRefreshReuse(stored.userId, stored.revokedAt);
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    if (!stored.user.isActive || !stored.user.company.isActive) {
      throw new UnauthorizedException('Usuário ou empresa inativa');
    }

    // Rotação atômica (B-72): só quem efetivamente revogar o token ganha o
    // par novo. Antes, duas requisições simultâneas com o mesmo token liam
    // `revokedAt: null` e as duas saíam com sessões válidas.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const { company: _c, isActive: _a, ...safeUser } = stored.user;
    return this.issueTokens(safeUser);
  }

  // Refresh token revogado apresentado de novo. Fora da janela de corrida
  // entre abas, alguém guardou uma cópia: encerra todas as sessões do usuário.
  private async handleRefreshReuse(userId: string, revokedAt: Date): Promise<void> {
    if (Date.now() - revokedAt.getTime() < REFRESH_REUSE_GRACE_MS) return;
    this.logger.warn(`Reuso de refresh token revogado: user=${userId} — sessões encerradas`);
    await this.revokeAllSessions(userId);
  }

  // ── Encerra todas as sessões do usuário (B-72 / M-08) ─────────────────────
  // Refresh tokens são revogados no banco; access tokens ainda dentro da
  // validade caem pela marca `sessionsRevokedAt`, conferida no JwtStrategy.
  // `userData` vai no mesmo update — a troca de senha e o fim das sessões
  // acontecem juntos ou não acontecem. Os sockets abertos caem em seguida
  // (B-74), menos o da sessão `keepSession` (quem trocou a própria senha).
  async revokeAllSessions(
    userId: string,
    userData: Prisma.UserUpdateInput = {},
    keepSession?: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { ...userData, sessionsRevokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    this.events.disconnectUser(userId, keepSession);
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

      // B-74 (M-09): o socket desta sessão cai junto — antes seguia recebendo
      // eventos depois do logout.
      const jti = (this.jwtService.decode(accessToken) as JwtPayload | null)?.jti;
      if (jti) this.events.disconnectSession(jti);
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

  // ── Emite um par de tokens e registra o refresh token ─────────────────────
  // Usado no login, na renovação e depois da troca da própria senha (B-72),
  // que encerra as outras sessões mas mantém o usuário logado neste aparelho.
  async issueTokens(user: AuthUserDto): Promise<AuthResponseDto> {
    const tokens = await this.generateTokens(user);

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

    return tokens;
  }

  // ── Geração dos tokens ────────────────────────────────────────────────────
  private async generateTokens(user: AuthUserDto): Promise<AuthResponseDto> {
    const payload: Omit<JwtPayload, 'typ' | 'jti'> = {
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

    // `expiresIn` do jsonwebtoken (via @types/jsonwebtoken) passou a exigir o
    // tipo literal `StringValue` da lib `ms` ("15m", "7d"...) em vez de
    // `string` genérico — JWT_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN já seguem
    // esse formato (validado por `parseExpiry` logo abaixo), o cast só
    // relaxa a checagem estática, sem mudar o valor passado em runtime.
    const [accessToken, refreshToken] = await Promise.all([
      // `typ` (B-72 / M-08) separa os dois tokens mesmo que os segredos
      // acabem iguais por erro de configuração. `jti` deixa cada token único:
      // sem ele, dois logins do mesmo usuário no mesmo segundo geravam o
      // mesmo refresh token e o segundo batia no índice único (500).
      this.jwtService.signAsync({ ...payload, typ: 'access', jti: randomUUID() }, {
        secret: jwtSecret,
        expiresIn: jwtExpiresIn as JwtSignOptions['expiresIn'],
      }),
      this.jwtService.signAsync({ ...payload, typ: 'refresh', jti: randomUUID() }, {
        secret: jwtRefreshSecret,
        expiresIn: jwtRefreshExpires as JwtSignOptions['expiresIn'],
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
