import { Role } from '@prisma/client';

export class AuthUserDto {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
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
