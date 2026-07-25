import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

// Mesma regra de senha do CreateUserDto (user/dto/create-user.dto.ts) — ao
// menos 1 maiúscula, 1 minúscula e 1 número.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export class RegisterCompanyDto {
  @IsString()
  @MinLength(2, { message: 'Nome da empresa deve ter no mínimo 2 caracteres' })
  @MaxLength(80)
  companyName: string;

  @IsString()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
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
}
