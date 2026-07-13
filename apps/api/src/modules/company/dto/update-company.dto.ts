import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUrl({}, { message: 'logoUrl deve ser uma URL válida' })
  logoUrl?: string;
}
