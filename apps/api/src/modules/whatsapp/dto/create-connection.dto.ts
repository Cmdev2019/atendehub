import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  @MaxLength(60)
  name: string; // ex: "Comercial", "Suporte"

  @IsOptional()
  @IsString()
  departmentId?: string;
}
