import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  IsUrl,
  Matches,
} from 'class-validator';
import { Role } from '@prisma/client';

// Exige ao menos 1 letra maiúscula, 1 minúscula e 1 número.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export class CreateUserDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @Matches(PASSWORD_REGEX, {
    message:
      'Senha deve conter ao menos uma letra maiúscula, uma minúscula e um número',
  })
  password: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Role inválida' })
  role?: Role;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl deve ser uma URL válida' })
  avatarUrl?: string;
}
