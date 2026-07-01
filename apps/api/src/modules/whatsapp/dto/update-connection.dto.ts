import { IsString, IsOptional, MaxLength, IsBoolean } from 'class-validator';

export class UpdateConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
