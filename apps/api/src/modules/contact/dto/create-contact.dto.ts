import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsUrl,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Channel } from '@prisma/client';

export class CreateContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^\d{10,15}$/, { message: 'Telefone deve conter entre 10 e 15 dígitos numéricos' })
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(Channel)
  channel?: Channel;
}
