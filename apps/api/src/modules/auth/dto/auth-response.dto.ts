import { Availability, Role } from '../../../generated/prisma/client';

export class AuthUserDto {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  // B-65: Online/Offline — vem no login e no /auth/me
  availability?: Availability;
  // `jti` do access token da requisição (B-74) — só existe em `req.user`,
  // para a troca de senha manter a sessão de quem trocou.
  sessionId?: string;
}

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;   // segundos
  user: AuthUserDto;
}
