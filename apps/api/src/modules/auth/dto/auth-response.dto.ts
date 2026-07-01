import { Role } from '@prisma/client';

export class AuthUserDto {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
}

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;   // segundos
  user: AuthUserDto;
}
