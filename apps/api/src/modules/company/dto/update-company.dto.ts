import { IsString, IsOptional, IsTimeZone, IsUrl, MaxLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUrl({}, { message: 'logoUrl deve ser uma URL válida' })
  logoUrl?: string;

  // M-04/B-61: fuso IANA, ex. "America/Sao_Paulo", "America/Manaus"
  @IsOptional()
  @IsTimeZone({ message: 'timezone deve ser um fuso IANA válido (ex.: America/Sao_Paulo)' })
  timezone?: string;
}
