import { IsString, IsOptional, IsBoolean, MaxLength, Matches } from 'class-validator';

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color deve ser um hex válido ex: #6366f1' })
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
