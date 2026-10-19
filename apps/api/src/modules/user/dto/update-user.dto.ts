import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
  IsUrl,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
} from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl deve ser uma URL válida' })
  avatarUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // B-113 (ADR-0019, regra 22): a lista substitui os setores do usuário
  // (`[]` tira de todos); ausente, não mexe neles
  @IsOptional()
  @IsArray()
  @ArrayUnique({ message: 'Setor repetido' })
  @ArrayMaxSize(100)
  @IsString({ each: true })
  departmentIds?: string[];
}
