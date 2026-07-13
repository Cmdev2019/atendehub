import { IsString, MinLength, Matches } from 'class-validator';

// Exige ao menos 1 letra maiúscula, 1 minúscula e 1 número.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Nova senha deve ter no mínimo 8 caracteres' })
  @Matches(PASSWORD_REGEX, {
    message:
      'Nova senha deve conter ao menos uma letra maiúscula, uma minúscula e um número',
  })
  newPassword: string;
}
